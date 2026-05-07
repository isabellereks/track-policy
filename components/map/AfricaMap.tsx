"use client";

import { geoMercator } from "d3-geo";
import {
  ComposableMap,
  Geographies,
  Geography,
  type ProjectionFunction,
} from "react-simple-maps";
import { getEntityColorForDimension } from "@/lib/dimensions";
import {
  NEUTRAL_FILL,
  NEUTRAL_STROKE,
  type SetTooltip,
} from "@/lib/map-utils";
import { getEntity } from "@/lib/placeholder-data";
import type { DataCenter, Dimension, DimensionLens } from "@/types";

interface AfricaMapProps {
  onSelectEntity: (geoId: string) => void;
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

const africaProj = geoMercator()
  .center([20, 1])
  .scale(430)
  .translate([480, 300]) as unknown as ProjectionFunction;

const WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const AFRICA_CODES = new Set<number>([
  12, 24, 72, 108, 120, 132, 140, 148, 174, 178, 180, 204, 226, 231, 232,
  262, 266, 270, 288, 324, 384, 404, 426, 430, 434, 450, 454, 466, 478, 480,
  504, 508, 516, 562, 566, 646, 686, 690, 694, 706, 710, 716, 728, 729, 732,
  748, 768, 788, 800, 818, 834, 854, 894,
]);

const BLOB_STYLE = {
  fill: NEUTRAL_FILL,
  stroke: NEUTRAL_FILL,
  strokeWidth: 0,
  outline: "none",
  pointerEvents: "none" as const,
};

export default function AfricaMap({
  onSelectEntity,
  selectedGeoId,
  setTooltip,
  dimension = "overall",
  lens = "datacenter",
}: AfricaMapProps) {
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
        projection={africaProj}
        style={{
          width: "100%",
          height: "100%",
          shapeRendering: "geometricPrecision",
        }}
      >
        <Geographies geography={WORLD_URL}>
          {({ geographies }) =>
            geographies
              .filter((g) => AFRICA_CODES.has(parseInt(g.id, 10)))
              .sort((a, b) => {
                const aSel = (a.id as string) === selectedGeoId;
                const bSel = (b.id as string) === selectedGeoId;
                return aSel === bSel ? 0 : aSel ? 1 : -1;
              })
              .map((geo) => {
                const id = geo.id as string;
                const name = geo.properties.name as string;
                const ent = getEntity(id, "africa");
                const interactive = ent !== null;
                const isSelected = selectedGeoId === id;

                if (!interactive) {
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: BLOB_STYLE,
                        hover: BLOB_STYLE,
                        pressed: BLOB_STYLE,
                      }}
                    />
                  );
                }

                const fill = getEntityColorForDimension(ent, dimension, lens);
                const base = {
                  fill,
                  stroke: isSelected ? "#FFFFFF" : NEUTRAL_STROKE,
                  strokeWidth: isSelected ? 4 : 1.5,
                  strokeLinejoin: "round" as const,
                  strokeLinecap: "round" as const,
                  outline: "none",
                  cursor: "pointer",
                  transition: "stroke 200ms, stroke-width 200ms, filter 200ms",
                  filter: isSelected
                    ? "drop-shadow(0 4px 12px rgba(0,0,0,0.15))"
                    : undefined,
                };

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={(e) =>
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        label: name,
                        geoId: id,
                        region: "africa",
                      })
                    }
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => onSelectEntity(id)}
                    style={{
                      default: base,
                      hover: {
                        ...base,
                        filter: isSelected
                          ? "drop-shadow(0 4px 12px rgba(0,0,0,0.18)) brightness(0.94)"
                          : "brightness(0.94)",
                      },
                      pressed: base,
                    }}
                  />
                );
              })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}
