"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoOrthographic } from "d3-geo";
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Sphere,
} from "react-simple-maps";
import type { Region } from "@/types";

const WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const OCEAN = "#A8D5E6";
const LAND = "#C2CEBE";
const LAND_HOVER = "#AEBBAB";
const GRATICULE = "rgba(255, 255, 255, 0.28)";

const AUTO_STEP_DEG = 0.12;
const IDLE_RESUME_MS = 1200;
const LERP_RATE = 0.08;
const DRAG_THRESHOLD_PX = 5;

// ISO numeric country codes per region — kept only for the hover-tint hint
// on countries that actually belong to a region. Click navigation uses the
// nearest-region logic below instead.
const NA_IDS = new Set<number>([840, 124, 484]);
const EU_IDS = new Set<number>([
  8, 20, 31, 40, 51, 56, 70, 100, 112, 191, 196, 203, 208, 233, 246, 250, 268,
  276, 292, 300, 336, 348, 352, 372, 380, 428, 438, 440, 442, 470, 492, 498,
  499, 528, 578, 616, 620, 642, 643, 674, 688, 703, 705, 724, 752, 756, 792,
  804, 807, 826,
]);
const ASIA_IDS = new Set<number>([
  4, 31, 50, 51, 64, 96, 104, 116, 144, 156, 158, 196, 268, 275, 296, 344, 356,
  360, 364, 368, 376, 392, 398, 400, 408, 410, 414, 417, 418, 422, 446, 458,
  462, 469, 496, 512, 524, 586, 608, 626, 634, 643, 682, 686, 702, 704, 706,
  716, 760, 762, 764, 784, 792, 795, 860, 887,
]);

function isRegionCountry(numId: number): boolean {
  return NA_IDS.has(numId) || EU_IDS.has(numId) || ASIA_IDS.has(numId);
}

// Rough centroids for the three regions, used by nearestRegion().
const REGION_CENTROIDS: Record<Region, [number, number]> = {
  // [lat, lng]
  na: [40, -100],
  eu: [50, 15],
  asia: [30, 105],
};

// Spherical angular distance between two (lat, lng) points in degrees.
// Not in kilometers — we only care about ordering, not magnitude.
function angularDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a = toRad(lat1);
  const b = toRad(lat2);
  const dLng = toRad(lng2 - lng1);
  // Clamp to avoid NaN from floating-point drift past 1.
  return Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dLng),
      ),
    ),
  );
}

function nearestRegion(lat: number, lng: number): Region {
  let best: Region = "na";
  let bestDist = Infinity;
  (Object.keys(REGION_CENTROIDS) as Region[]).forEach((r) => {
    const [rLat, rLng] = REGION_CENTROIDS[r];
    const d = angularDistance(lat, lng, rLat, rLng);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  });
  return best;
}

type Props = {
  phi?: number;
  lockLambda?: number;
  onRegionClick?: (region: Region) => void;
};

export default function GlobeHero({
  phi = -15,
  lockLambda,
  onRegionClick,
}: Props) {
  const [lambda, setLambda] = useState(20);
  const draggingRef = useRef(false);
  const didDragRef = useRef(false);
  const pointerDownXRef = useRef<number | null>(null);
  const pointerDownYRef = useRef<number | null>(null);
  const lastPointerXRef = useRef<number | null>(null);
  const idleSinceRef = useRef<number>(0);
  const reducedMotionRef = useRef(false);
  const lockLambdaRef = useRef<number | undefined>(lockLambda);

  useEffect(() => {
    lockLambdaRef.current = lockLambda;
  }, [lockLambda]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    idleSinceRef.current = performance.now();
    let raf = 0;
    const tick = () => {
      const lock = lockLambdaRef.current;
      if (lock !== undefined) {
        setLambda((current) => {
          const diff = ((((lock - current) % 360) + 540) % 360) - 180;
          if (Math.abs(diff) < 0.05) return lock;
          return current + diff * LERP_RATE;
        });
      } else if (
        !draggingRef.current &&
        !reducedMotionRef.current &&
        performance.now() - idleSinceRef.current > IDLE_RESUME_MS
      ) {
        setLambda((l) => l + AUTO_STEP_DEG);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const projectionConfig = useMemo(
    () => ({
      scale: 380,
      rotate: [lambda, phi, 0] as [number, number, number],
    }),
    [lambda, phi],
  );

  // Parallel d3 projection used only for click-point inverse lookup. Must
  // match the ComposableMap projection (same scale + rotate + translate) or
  // the inverted (lat, lng) will be wrong.
  const invertProjection = useMemo(
    () =>
      geoOrthographic()
        .scale(380)
        .translate([400, 400])
        .rotate([lambda, phi, 0]),
    [lambda, phi],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    didDragRef.current = false;
    pointerDownXRef.current = e.clientX;
    pointerDownYRef.current = e.clientY;
    if (lockLambdaRef.current !== undefined) return;
    draggingRef.current = true;
    lastPointerXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Track drag threshold even when lockLambda is on, so clicks still work.
    if (pointerDownXRef.current !== null && pointerDownYRef.current !== null) {
      const dx = Math.abs(e.clientX - pointerDownXRef.current);
      const dy = Math.abs(e.clientY - pointerDownYRef.current);
      if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
      }
    }
    if (!draggingRef.current || lastPointerXRef.current === null) return;
    const dx = e.clientX - lastPointerXRef.current;
    lastPointerXRef.current = e.clientX;
    setLambda((l) => l + dx * 0.35);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownXRef.current = null;
    pointerDownYRef.current = null;
    if (!draggingRef.current) return;
    draggingRef.current = false;
    lastPointerXRef.current = null;
    idleSinceRef.current = performance.now();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleWrapperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onRegionClick) return;
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // The SVG viewBox is 800×800; map click coords into that space.
    const svgX = ((e.clientX - rect.left) / rect.width) * 800;
    const svgY = ((e.clientY - rect.top) / rect.height) * 800;
    const inverted = invertProjection.invert?.([svgX, svgY]);
    if (!inverted) return; // Click was outside the sphere.
    const [lng, lat] = inverted;
    onRegionClick(nearestRegion(lat, lng));
  };

  return (
    <div
      role="img"
      aria-label="Rotating globe of Earth — click anywhere to explore"
      className="relative w-full h-full touch-pan-y select-none cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={handleWrapperClick}
    >
      <ComposableMap
        width={800}
        height={800}
        projection="geoOrthographic"
        projectionConfig={projectionConfig}
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        <defs>
          <radialGradient id="globe-ocean" cx="35%" cy="30%" r="85%">
            <stop offset="0%" stopColor="#CDE7F1" />
            <stop offset="100%" stopColor={OCEAN} />
          </radialGradient>
          <radialGradient id="globe-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(20,60,90,0.22)" />
          </radialGradient>
        </defs>

        <Sphere
          id="globe-sphere"
          fill="url(#globe-ocean)"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={0.6}
        />
        <Graticule stroke={GRATICULE} strokeWidth={0.5} />
        <Geographies geography={WORLD_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const numId = parseInt(geo.id, 10);
              const isRegion = isRegionCountry(numId);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: {
                      fill: LAND,
                      stroke: "none",
                      outline: "none",
                      transition: "fill 180ms",
                    },
                    hover: {
                      fill: isRegion ? LAND_HOVER : LAND,
                      stroke: "none",
                      outline: "none",
                    },
                    pressed: {
                      fill: isRegion ? LAND_HOVER : LAND,
                      stroke: "none",
                      outline: "none",
                    },
                  }}
                />
              );
            })
          }
        </Geographies>
        <circle
          cx={400}
          cy={400}
          r={380}
          fill="url(#globe-shadow)"
          pointerEvents="none"
        />
      </ComposableMap>
    </div>
  );
}
