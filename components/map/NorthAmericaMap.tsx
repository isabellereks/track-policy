"use client";

import {
  ComposableMap,
  Geographies,
  Geography,
  type ProjectionFunction,
} from "react-simple-maps";
import { naProjection } from "@/lib/projections";
import { getEntity } from "@/lib/placeholder-data";
import { getEntityColorForDimension } from "@/lib/dimensions";
import {
  NEUTRAL_FILL,
  NEUTRAL_STROKE,
  STANCE_HEX,
  type SetTooltip,
} from "@/lib/map-utils";
import { ALL_FACILITIES } from "@/lib/datacenters";
import type { DataCenter, Dimension, DimensionLens } from "@/types";
import DataCenterDots from "./DataCenterDots";

interface NorthAmericaMapProps {
  onSelectEntity: (geoId: string) => void;
  onDoubleClickEntity?: (geoId: string) => void;
  /** Click handler for a specific US state — navigates to the states view. */
  onSelectUsState?: (stateName: string) => void;
  /** Double-click on a US state — drill directly into counties. */
  onDoubleClickUsState?: (stateName: string) => void;
  selectedGeoId: string | null;
  setTooltip: SetTooltip;
  dimension?: Dimension;
  lens?: DimensionLens;
  showDataCenters?: boolean;
  onHoverFacility?: (
    dc: DataCenter,
    x: number,
    y: number,
    clusterSize: number,
  ) => void;
  onLeaveFacility?: () => void;
  onSelectFacility?: (dc: DataCenter) => void;
}

const naProj = naProjection as unknown as ProjectionFunction;

const WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const STATES_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// Americas — interactive countries (have stablecoin policy entities).
const INTERACTIVE_IDS = new Set(["124", "304", "484", "076", "032", "152"]);
// geoId → display name for tooltip fallback
const COUNTRY_NAMES: Record<string, string> = {
  "124": "Canada",
  "304": "Greenland",
  "484": "Mexico",
  "076": "Brazil",
  "032": "Argentina",
  "152": "Chile",
};
// Each country's region as stored in ENTITIES
const COUNTRY_REGION: Record<string, "na" | "latam"> = {
  "124": "na",
  "304": "na",
  "484": "latam",
  "076": "latam",
  "032": "latam",
  "152": "latam",
};
// South/Central American countries rendered as neutral context so the map
// doesn't look amputated south of Mexico.
const CONTEXT_IDS = new Set([
  "068", "170", "188", "192", "218", "222", "328", "332", "340", "388",
  "558", "591", "600", "604", "630", "740", "756", "858", "862",
]);

const US_FEDERAL_FILL = STANCE_HEX.favorable;
const US_TRACKED_PATTERN_ID = "us-stablecoin-state-stripes";

export default function NorthAmericaMap({
  onSelectEntity,
  onDoubleClickEntity,
  onSelectUsState,
  onDoubleClickUsState,
  selectedGeoId,
  setTooltip,
  dimension = "overall",
  lens = "datacenter",
  showDataCenters = false,
  onHoverFacility,
  onLeaveFacility,
  onSelectFacility,
}: NorthAmericaMapProps) {
  return (
    <div
      className="relative w-full h-full"
      onMouseMove={(e) =>
        setTooltip((current) =>
          current ? { ...current, x: e.clientX, y: e.clientY } : current,
        )
      }
      onMouseLeave={() => setTooltip(null)}
    >
      <ComposableMap
        width={960}
        height={600}
        projection={naProj}
        style={{
          width: "100%",
          height: "100%",
          // Force high-quality vector rendering. Without this, mobile
          // WebKit may pick optimizeSpeed for small primitives like the
          // data-center dots, which is what makes them look pixelated
          // when the parent layer is CSS-scaled for pinch-zoom.
          shapeRendering: "geometricPrecision",
        }}
      >
        <defs>
          <pattern
            id={US_TRACKED_PATTERN_ID}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(135)"
          >
            <rect width="8" height="8" fill={US_FEDERAL_FILL} />
            <rect width="2" height="8" fill="rgba(125, 125, 125, 0.36)" />
          </pattern>
        </defs>
        {/* Layer 1 — Americas: interactive countries + neutral context shapes */}
        <Geographies geography={WORLD_URL}>
          {({ geographies }) => {
            const features = geographies.filter(
              (g) => INTERACTIVE_IDS.has(g.id as string) || CONTEXT_IDS.has(g.id as string),
            );
            // Render selected last so its stroke sits on top of neighbours.
            features.sort((a, b) => {
              const aSel = (a.id as string) === selectedGeoId;
              const bSel = (b.id as string) === selectedGeoId;
              return aSel === bSel ? 0 : aSel ? 1 : -1;
            });
            return features.map((geo) => {
              const id = geo.id as string;
              // Neutral context shapes (countries we don't track yet)
              if (CONTEXT_IDS.has(id)) {
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{
                      default: { fill: NEUTRAL_FILL, stroke: NEUTRAL_FILL, strokeWidth: 0, outline: "none", pointerEvents: "none" },
                      hover:   { fill: NEUTRAL_FILL, stroke: NEUTRAL_FILL, strokeWidth: 0, outline: "none", pointerEvents: "none" },
                      pressed: { fill: NEUTRAL_FILL, outline: "none" },
                    }}
                  />
                );
              }
              // Interactive country
              const ent = getEntity(id, COUNTRY_REGION[id] ?? "na");
              if (!ent) return null;
              const isSelected = selectedGeoId === id;
              const fill = getEntityColorForDimension(ent, dimension, lens);
              const stroke = isSelected ? "#FFFFFF" : NEUTRAL_STROKE;
              const strokeWidth = isSelected ? 4 : 1.5;
              const base = {
                fill,
                stroke,
                strokeWidth,
                strokeLinejoin: "round" as const,
                strokeLinecap: "round" as const,
                outline: "none",
                cursor: "pointer",
                transition: "stroke 200ms, stroke-width 200ms, filter 200ms",
                filter: isSelected ? "drop-shadow(0 4px 12px rgba(0,0,0,0.15))" : undefined,
              };
              const hoverFilter = isSelected
                ? "drop-shadow(0 4px 12px rgba(0,0,0,0.18)) brightness(0.94)"
                : "brightness(0.94)";
              const label = COUNTRY_NAMES[id] ?? ent.name;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(e) =>
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      label,
                      geoId: id,
                      region: COUNTRY_REGION[id] ?? "na",
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => onSelectEntity(id)}
                  onDoubleClick={() => onDoubleClickEntity?.(id)}
                  style={{
                    default: base,
                    hover: { ...base, filter: hoverFilter },
                    pressed: base,
                  }}
                />
              );
            });
          }}
        </Geographies>

        {/* Layer 2 — US states, rendered at the continental zoom so the US
            shows its per-state stance breakdown instead of a single blob. */}
        <Geographies geography={STATES_URL}>
          {({ geographies }) => {
            return geographies
              .slice()
              .sort((a, b) => {
                const aSel =
                  (a.properties.name as string) === selectedGeoId;
                const bSel =
                  (b.properties.name as string) === selectedGeoId;
                return aSel === bSel ? 0 : aSel ? 1 : -1;
              })
              .map((geo) => {
                const name = geo.properties.name as string;
                const ent = getEntity(name, "na");
                const isSelected = selectedGeoId === name;
                if (!ent) {
                  if (lens === "stablecoin") {
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        style={{
                          default: {
                            fill: US_FEDERAL_FILL,
                            stroke: NEUTRAL_STROKE,
                            strokeWidth: 0.6,
                            outline: "none",
                            pointerEvents: "none",
                          },
                          hover: {
                            fill: US_FEDERAL_FILL,
                            outline: "none",
                            pointerEvents: "none",
                          },
                          pressed: {
                            fill: US_FEDERAL_FILL,
                            outline: "none",
                          },
                        }}
                      />
                    );
                  }
                  // Unmapped states (e.g. territories) render as neutral fill
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: {
                          fill: NEUTRAL_FILL,
                          stroke: NEUTRAL_STROKE,
                          strokeWidth: 0.5,
                          outline: "none",
                          pointerEvents: "none",
                        },
                        hover: {
                          fill: NEUTRAL_FILL,
                          outline: "none",
                          pointerEvents: "none",
                        },
                        pressed: {
                          fill: NEUTRAL_FILL,
                          outline: "none",
                        },
                      }}
                    />
                  );
                }
                const isTrackedStablecoinState =
                  lens === "stablecoin" &&
                  ent.legislation.some((bill) => bill.category.startsWith("stablecoin-"));
                const fill =
                  lens === "stablecoin"
                    ? isTrackedStablecoinState
                      ? `url(#${US_TRACKED_PATTERN_ID})`
                      : US_FEDERAL_FILL
                    : ent
                      ? STANCE_HEX[ent.stance ?? ent.stanceDatacenter ?? "none"]
                      : NEUTRAL_FILL;
                const stroke = isSelected ? "#FFFFFF" : NEUTRAL_STROKE;
                const strokeWidth = isSelected ? 3 : 0.6;
                const base = {
                  fill,
                  stroke,
                  strokeWidth,
                  strokeLinejoin: "round" as const,
                  strokeLinecap: "round" as const,
                  outline: "none",
                  cursor: "pointer",
                  transition:
                    "stroke 200ms, stroke-width 200ms, filter 200ms",
                  filter: isSelected
                    ? "drop-shadow(0 4px 12px rgba(0,0,0,0.15))"
                    : undefined,
                };
                const hoverFilter = isSelected
                  ? "drop-shadow(0 4px 12px rgba(0,0,0,0.18)) brightness(0.94)"
                  : "brightness(0.94)";
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={(e) =>
                      setTooltip({ x: e.clientX, y: e.clientY, label: name, geoId: name, region: "na" })
                    }
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => onSelectUsState?.(name)}
                    onDoubleClick={() => onDoubleClickUsState?.(name)}
                    style={{
                      default: base,
                      hover: { ...base, filter: hoverFilter },
                      pressed: base,
                    }}
                  />
                );
              });
          }}
        </Geographies>

        {showDataCenters && onHoverFacility && onLeaveFacility && (
          <DataCenterDots projection={naProjection as unknown as (c: [number, number]) => [number, number] | null}
            facilities={ALL_FACILITIES}
            onHoverFacility={onHoverFacility}
            onLeaveFacility={onLeaveFacility}
            onSelectFacility={onSelectFacility}
          />
        )}
      </ComposableMap>
    </div>
  );
}
