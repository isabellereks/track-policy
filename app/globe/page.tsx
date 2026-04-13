"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import createGlobe from "@/lib/cobe";
import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { ALL_FACILITIES } from "@/lib/datacenters";
import type { DataCenter } from "@/types";

const { PI, sin, cos } = Math;
const GLOBE_R = 0.8;

function latLonTo3D([lat, lon]: [number, number]): [number, number, number] {
  const latRad = (lat * PI) / 180;
  const lonRad = (lon * PI) / 180 - PI;
  const cosLat = cos(latRad);
  return [-cosLat * cos(lonRad), sin(latRad), cosLat * sin(lonRad)];
}

function projectMarker(
  location: [number, number],
  phi: number,
  theta: number,
  elevation: number,
  scale: number = 1,
): { x: number; y: number; visible: boolean } {
  const pos3D = latLonTo3D(location);
  const r = GLOBE_R + elevation;
  const p: [number, number, number] = [pos3D[0] * r, pos3D[1] * r, pos3D[2] * r];

  const cx = cos(theta), cy = cos(phi), sx = sin(theta), sy = sin(phi);
  const rx = cy * p[0] + sy * p[2];
  const ry = sy * sx * p[0] + cx * p[1] - cy * sx * p[2];
  const rz = -sy * cx * p[0] + sx * p[1] + cy * cx * p[2];

  return {
    x: (rx * scale + 1) / 2,
    y: (-ry * scale + 1) / 2,
    visible: rz >= 0 || rx * rx + ry * ry >= 0.64,
  };
}

const STATUS_LABEL: Record<DataCenter["status"], string> = {
  operational: "Operational",
  "under-construction": "Under construction",
  proposed: "Proposed",
};

function formatMW(mw: number | undefined): string | null {
  if (!mw) return null;
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw)} MW`;
}

function formatH100e(n: number | undefined): string | null {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M H100e`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k H100e`;
  return `${Math.round(n)} H100e`;
}

function formatCost(n: number | undefined): string | null {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n}`;
}

function stripConfidence(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(/\s*#\w+/g, "").trim();
}

interface GlobeMarker {
  id: string;
  location: [number, number];
  size: number;
  totalMW: number;
  count: number;
  facility: DataCenter;
}

const LABEL_PAD_X = 80;
const LABEL_PAD_Y = 22;
const MIN_SCALE = 1;
const MAX_SCALE = 3.5;
const ZOOM_SPEED = 0.002;

function clusterFacilities(facilities: DataCenter[], cellDeg: number): GlobeMarker[] {
  const buckets = new Map<string, DataCenter[]>();
  for (const f of facilities) {
    const key = `${Math.round(f.lat / cellDeg)}|${Math.round(f.lng / cellDeg)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(f);
    buckets.set(key, bucket);
  }
  const markers: GlobeMarker[] = [];
  for (const [, bucket] of buckets) {
    let repr = bucket[0];
    let sumLat = 0, sumLng = 0, totalMW = 0;
    for (const f of bucket) {
      sumLat += f.lat;
      sumLng += f.lng;
      totalMW += f.capacityMW ?? 0;
      if ((f.capacityMW ?? 0) > (repr.capacityMW ?? 0)) repr = f;
    }
    const size = totalMW > 500 ? 0.045 : totalMW > 100 ? 0.03 : 0.018;
    markers.push({
      id: `dc-${repr.id}`,
      location: [sumLat / bucket.length, sumLng / bucket.length],
      size, totalMW, count: bucket.length, facility: repr,
    });
  }
  markers.sort((a, b) => b.totalMW - a.totalMW);
  return markers;
}

function StatusLoader() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" className="shrink-0">
      <rect x="0" y="1" width="2" height="6" rx="0.5" fill="#FF9500">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" begin="0s" />
      </rect>
      <rect x="4" y="0" width="2" height="8" rx="0.5" fill="#FF9500">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" begin="0.2s" />
      </rect>
      <rect x="8" y="2" width="2" height="4" rx="0.5" fill="#FF9500">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" begin="0.4s" />
      </rect>
    </svg>
  );
}

export default function GlobePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const phiRef = useRef(0);
  const isPausedRef = useRef(false);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ phi: 0, theta: 0 });
  const phiOffset = useRef(0);
  const thetaOffset = useRef(0);
  const scaleRef = useRef(1);
  const scaleTargetRef = useRef(1);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [selectedFacility, setSelectedFacility] = useState<DataCenter | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerOpenRef = useRef(false);
  const [statsReady, setStatsReady] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  const markers = useMemo(() => clusterFacilities(ALL_FACILITIES, 4), []);

  const topIds = useMemo(() => {
    const GEO_CELL = 40;
    const regions = new Map<string, GlobeMarker>();
    for (const m of markers) {
      const key = `${Math.round(m.location[0] / GEO_CELL)}|${Math.round(m.location[1] / GEO_CELL)}`;
      const existing = regions.get(key);
      if (!existing || m.totalMW > existing.totalMW) {
        regions.set(key, m);
      }
    }
    return new Set(Array.from(regions.values()).map((m) => m.id));
  }, [markers]);

  const handleSelectFacility = useCallback((facility: DataCenter) => {
    setSelectedFacility(facility);
    setDrawerOpen(true);
    drawerOpenRef.current = true;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDown.current = { x: e.clientX, y: e.clientY };
    isPausedRef.current = true;
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (pointerDown.current) {
      const dx = e.clientX - pointerDown.current.x;
      const dy = e.clientY - pointerDown.current.y;
      const s = scaleRef.current;
      dragOffset.current = { phi: dx / (200 * s), theta: dy / (600 * s) };
    }
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SPEED;
    scaleTargetRef.current = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleTargetRef.current * (1 + delta)));
    isPausedRef.current = true;
    clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(() => {
      if (!pointerDown.current) isPausedRef.current = false;
    }, 800);
  }, []);

  const lastPinchDist = useRef<number | null>(null);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist.current !== null) {
        const delta = (dist - lastPinchDist.current) * 0.005;
        scaleTargetRef.current = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleTargetRef.current * (1 + delta)));
      }
      lastPinchDist.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  const handlePointerUp = useCallback(() => {
    if (pointerDown.current) {
      phiOffset.current += dragOffset.current.phi;
      thetaOffset.current += dragOffset.current.theta;
      dragOffset.current = { phi: 0, theta: 0 };
    }
    pointerDown.current = null;
    isPausedRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false });
      container.addEventListener("touchmove", handleTouchMove, { passive: false });
      container.addEventListener("touchend", handleTouchEnd, { passive: true });
    }
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (container) {
        container.removeEventListener("wheel", handleWheel);
        container.removeEventListener("touchmove", handleTouchMove);
        container.removeEventListener("touchend", handleTouchEnd);
      }
    };
  }, [handlePointerMove, handlePointerUp, handleWheel, handleTouchMove, handleTouchEnd]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const width = canvas.offsetWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const elevation = 0.02;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr, width, height: width,
      phi: 0, theta: 0.15, diffuse: 1.2,
      mapSamples: 20000, mapBrightness: 6,
      dark: darkMode ? 1 : 0,
      baseColor: darkMode ? [0.1, 0.1, 0.14] : [0.9, 0.9, 0.92],
      markerColor: [0.04, 0.52, 1],
      glowColor: darkMode ? [0.08, 0.1, 0.18] : [0.85, 0.88, 0.95],
      markers: [], markerElevation: elevation,
      opacity: darkMode ? 0.85 : 0.95,
      mapTexture: darkMode ? "/globe-map.png" : "/globe-map-light.png",
      mapColor: true,
    });

    let animId: number;
    function animate() {
      if (!isPausedRef.current && !drawerOpenRef.current) {
        phiRef.current += 0.003;
      }

      scaleRef.current += (scaleTargetRef.current - scaleRef.current) * 0.12;
      const currentScale = scaleRef.current;

      const currentPhi = phiRef.current + phiOffset.current + dragOffset.current.phi;
      const thetaRange = 0.4 + (currentScale - 1) * 0.3;
      const currentTheta = Math.max(
        -thetaRange,
        Math.min(thetaRange, 0.15 + thetaOffset.current + dragOffset.current.theta),
      );
      globe.update({ phi: currentPhi, theta: currentTheta });

      const containerEl = containerRef.current;
      if (containerEl) {
        containerEl.style.transform = `scale(${currentScale})`;
      }

      const containerW = canvas.offsetWidth;
      const placed: { x: number; y: number }[] = [];
      for (const m of markers) {
        const el = labelRefs.current.get(m.id);
        if (!el) continue;
        const pos = projectMarker(m.location, currentPhi, currentTheta, elevation);
        el.style.left = `${pos.x * 100}%`;
        el.style.top = `${pos.y * 100}%`;

        const isTop = topIds.has(m.id);
        let hide = !pos.visible;
        if (!hide && isTop) {
          for (const p of placed) {
            if (
              Math.abs(pos.x * containerW - p.x * containerW) < LABEL_PAD_X &&
              Math.abs(pos.y * containerW - p.y * containerW) < LABEL_PAD_Y
            ) {
              hide = true;
              break;
            }
          }
          if (!hide) placed.push(pos);
        }

        el.style.opacity = hide ? "0" : "1";
        el.style.filter = hide ? "blur(6px)" : "none";
      }

      animId = requestAnimationFrame(animate);
    }
    animate();

    setStatsReady(true);

    return () => {
      cancelAnimationFrame(animId);
      globe.destroy();
      setStatsReady(false);
    };
  }, [markers, darkMode]);

  const operator = selectedFacility && (stripConfidence(selectedFacility.operator) ?? selectedFacility.operator);
  const capacity = selectedFacility && formatMW(selectedFacility.capacityMW);
  const compute = selectedFacility && formatH100e(selectedFacility.computeH100e);
  const cost = selectedFacility && formatCost(selectedFacility.costUSD);
  const user = selectedFacility && stripConfidence(selectedFacility.primaryUser);

  const details: { label: string; value: string }[] = [];
  if (selectedFacility) {
    if (user) details.push({ label: "Primary user", value: user });
    if (capacity) details.push({ label: "Capacity", value: capacity });
    if (compute) details.push({ label: "Compute", value: compute });
    if (cost) details.push({ label: "Investment", value: cost });
    if (selectedFacility.yearBuilt)
      details.push({ label: "Built", value: String(selectedFacility.yearBuilt) });
    else if (selectedFacility.yearProposed)
      details.push({ label: "Proposed", value: String(selectedFacility.yearProposed) });
    if (selectedFacility.country) details.push({ label: "Country", value: selectedFacility.country });
    if (selectedFacility.state) details.push({ label: "State", value: selectedFacility.state });
    details.push({ label: "Address", value: selectedFacility.location });
  }

  const stats = useMemo(() => {
    let totalMW = 0;
    for (const f of ALL_FACILITIES) totalMW += f.capacityMW ?? 0;
    return { total: ALL_FACILITIES.length, totalMW };
  }, []);

  return (
    <div className={`h-dvh w-screen overflow-hidden relative flex font-sans touch-none transition-colors duration-500 ${darkMode ? "bg-[#0a0a0c]" : "bg-[#f0f2f5]"}`}>
      <div className={`flex-1 relative flex justify-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${drawerOpen ? "items-start pt-10 md:pt-0 md:items-center md:pr-[380px]" : "items-center"}`}>
        <Link
          href="/#datacenters"
          className={`absolute top-3 left-3 md:top-6 md:left-6 z-20 inline-flex items-center gap-1.5 text-xs md:text-sm transition-colors ${darkMode ? "text-white/50 hover:text-white/80" : "text-black/40 hover:text-black/70"}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          TrackPolicy
        </Link>

        <button
          onClick={() => setDarkMode((d) => !d)}
          className={`absolute top-3 right-3 md:top-6 md:right-6 z-20 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${darkMode ? "bg-white/10 hover:bg-white/20 text-white/70" : "bg-black/8 hover:bg-black/15 text-black/60"}`}
          aria-label="Toggle dark mode"
        >
          {darkMode ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 9.2A6.5 6.5 0 016.8 2 6 6 0 1014 9.2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          )}
        </button>

        <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 md:bottom-6 md:left-6 z-20 flex items-center gap-5 md:gap-8">
          {selectedFacility && drawerOpen ? (
            <>
              <div>
                <div className={`text-xs md:text-sm tracking-tight ${darkMode ? "text-white/40" : "text-black/40"}`}>{operator}</div>
                <div className={`text-2xl md:text-3xl font-semibold tabular-nums ${darkMode ? "text-white/90" : "text-black/90"}`}>
                  {capacity ?? "—"}
                </div>
              </div>
              {selectedFacility.country && (
                <div>
                  <div className={`text-xs md:text-sm tracking-tight ${darkMode ? "text-white/40" : "text-black/40"}`}>Location</div>
                  <div className={`text-2xl md:text-3xl font-semibold ${darkMode ? "text-white/90" : "text-black/90"}`}>
                    {selectedFacility.country}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <div className={`text-xs md:text-sm tracking-tight ${darkMode ? "text-white/40" : "text-black/40"}`}>Facilities</div>
                <div className={`text-2xl md:text-3xl font-semibold tabular-nums ${darkMode ? "text-white/90" : "text-black/90"}`}>
                  <NumberFlow value={statsReady ? stats.total : 0} />
                </div>
              </div>
              <div>
                <div className={`text-xs md:text-sm tracking-tight ${darkMode ? "text-white/40" : "text-black/40"}`}>Total capacity</div>
                <div className={`text-2xl md:text-3xl font-semibold tabular-nums ${darkMode ? "text-white/90" : "text-black/90"}`}>
                  <NumberFlow value={statsReady ? parseFloat((stats.totalMW / 1000).toFixed(1)) : 0} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} suffix=" GW" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Globe + labels */}
        <div ref={containerRef} className="globe-markers-container w-full max-w-[720px] aspect-square relative origin-center">
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-grab"
            onPointerDown={handlePointerDown}
          />

          {markers.map((m) => {
            const name = stripConfidence(m.facility.operator) ?? "Unknown";
            const mw = formatMW(m.totalMW);
            const markerColor = m.facility.status === "proposed" ? "bg-[#BF5AF2]" : m.facility.status === "under-construction" ? "bg-[#FF9500]" : "bg-[#0A84FF]";
            const isTop = topIds.has(m.id);
            return (
              <div
                key={m.id}
                ref={(el) => { if (el) labelRefs.current.set(m.id, el); else labelRefs.current.delete(m.id); }}
                className="globe-marker absolute z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer"
                onMouseEnter={() => { isPausedRef.current = true; }}
                onMouseLeave={() => { if (!pointerDown.current) isPausedRef.current = false; }}
                onClick={() => handleSelectFacility(m.facility)}
              >
                <div className={`globe-marker-icon w-[14px] h-[14px] rounded-full ${markerColor} border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]`} />
                <div className="absolute -inset-3 md:hidden" />
                <div
                  className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none transition-all duration-150 ${
                    isTop ? "hidden md:block opacity-100 scale-100" : "globe-marker-tooltip opacity-0 scale-95"
                  }`}
                >
                  <div
                    className={`globe-marker-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded shadow-lg whitespace-nowrap ${darkMode ? "bg-[#1D1D1F] text-white/90" : "bg-white text-black/85"}`}
                    style={{ fontSize: "11px", letterSpacing: "-0.01em" }}
                  >
                    <span className="font-medium tracking-tight truncate">{name}</span>
                    {mw && <span className={darkMode ? "text-white/50" : "text-black/40"}>{mw}</span>}
                    <span className={`globe-marker-cta shrink-0 ${darkMode ? "text-white/30" : "text-black/25"}`}>↗</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={`absolute bottom-3 right-3 md:bottom-6 md:right-6 z-20 text-[11px] tracking-tight hidden md:block ${darkMode ? "text-white/25" : "text-black/25"}`}>
          Drag to rotate · Scroll to zoom · Click to inspect
        </div>
      </div>

      {/* Drawer: bottom sheet on mobile, right sidebar on desktop */}
      <div
        className={`absolute z-30 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl md:rounded-none md:top-0 md:left-auto md:right-0 md:bottom-0 md:max-h-full md:h-full md:w-[380px] md:max-w-[90vw] ${darkMode ? "bg-[#141416] border-t border-white/8 md:border-t-0 md:border-l md:border-white/8 shadow-[0_-8px_32px_rgba(0,0,0,0.4)] md:shadow-[-8px_0_32px_rgba(0,0,0,0.4)]" : "bg-white border-t border-black/8 md:border-t-0 md:border-l md:border-black/8 shadow-[0_-8px_32px_rgba(0,0,0,0.1)] md:shadow-[-8px_0_32px_rgba(0,0,0,0.1)]"} ${drawerOpen && selectedFacility ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-full"}`}
      >
        {selectedFacility && (
          <>
            <div className="flex justify-center pt-2 pb-0 md:hidden">
              <div className={`w-10 h-1 rounded-full ${darkMode ? "bg-white/20" : "bg-black/15"}`} />
            </div>
            <div className={`px-6 pt-4 md:pt-5 pb-4 border-b flex items-start justify-between gap-3 ${darkMode ? "border-white/8" : "border-black/8"}`}>
              <div className="min-w-0">
                <h2 className={`text-xl font-semibold tracking-tight leading-tight truncate ${darkMode ? "text-white" : "text-black"}`}>{operator}</h2>
                <div className={`mt-1.5 flex items-center gap-2 text-xs ${darkMode ? "text-white/50" : "text-black/50"}`}>
                  {selectedFacility.status === "under-construction" ? (
                    <StatusLoader />
                  ) : (
                    <span className={`inline-block w-[6px] h-[6px] rounded-full shrink-0 ${selectedFacility.status === "proposed" ? "bg-[#BF5AF2]" : "bg-[#0A84FF]"}`} />
                  )}
                  <span>{STATUS_LABEL[selectedFacility.status]}</span>
                  {capacity && (
                    <>
                      <span aria-hidden className={darkMode ? "text-white/20" : "text-black/20"}>·</span>
                      <span>{capacity}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setDrawerOpen(false); drawerOpenRef.current = false; setTimeout(() => setSelectedFacility(null), 300); }}
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${darkMode ? "text-white/40 hover:text-white hover:bg-white/8" : "text-black/40 hover:text-black hover:bg-black/8"}`}
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-6 flex flex-col gap-5">
                {selectedFacility.notes && (
                  <p className={`text-[13px] leading-relaxed ${darkMode ? "text-white/60" : "text-black/60"}`}>{selectedFacility.notes}</p>
                )}
                {details.length > 0 && (
                  <dl className="flex flex-col">
                    {details.map((d, i) => (
                      <div key={d.label} className={`flex items-start justify-between gap-4 py-2.5 text-[13px] ${i === 0 ? "" : `border-t ${darkMode ? "border-white/6" : "border-black/6"}`}`}>
                        <dt className={darkMode ? "text-white/40" : "text-black/40"}>{d.label}</dt>
                        <dd className={`font-medium text-right tracking-tight ${darkMode ? "text-white/90" : "text-black/90"}`}>{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {selectedFacility.concerns && selectedFacility.concerns.length > 0 && (
                  <div>
                    <h3 className={`text-[13px] font-medium mb-2 ${darkMode ? "text-white/80" : "text-black/80"}`}>Community concerns</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedFacility.concerns.map((c) => (
                        <span key={c} className={`text-[11px] px-2 py-1 rounded-full tracking-tight ${darkMode ? "bg-white/6 text-white/60" : "bg-black/6 text-black/60"}`}>
                          {c.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className={`text-[11px] pt-2 ${darkMode ? "text-white/30" : "text-black/30"}`}>
                  {selectedFacility.source === "epoch-ai" ? "Data from Epoch AI (CC-BY)" : "Sourced from public reporting"}
                </p>
              </div>
            </div>

            <div className={`px-6 py-4 border-t pb-[max(1rem,env(safe-area-inset-bottom))] ${darkMode ? "border-white/6" : "border-black/6"}`}>
              <Link href="/datacenters" className={`text-[13px] transition-colors ${darkMode ? "text-white/40 hover:text-white/80" : "text-black/40 hover:text-black/80"}`}>
                View all facilities →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
