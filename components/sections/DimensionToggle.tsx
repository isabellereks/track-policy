"use client";

import { DIMENSION_LABEL, type Dimension } from "@/types";
import { DIMENSION_COLOR, DIMENSION_TEXT } from "@/lib/dimensions";

interface DimensionToggleProps {
  dimension: Dimension;
  onChange: (d: Dimension) => void;
}

const DIMENSIONS: Dimension[] = [
  "overall",
  "environmental",
  "energy",
  "community",
  "land-use",
];

export default function DimensionToggle({
  dimension,
  onChange,
}: DimensionToggleProps) {
  return (
    <div>
      <div className="text-[13px] font-medium text-muted tracking-tight mb-3">
        Color map by
      </div>
      <div className="flex flex-wrap gap-2">
        {DIMENSIONS.map((d) => {
          const active = d === dimension;
          let activeStyle: React.CSSProperties | undefined;
          if (active) {
            if (d === "overall") {
              activeStyle = {
                backgroundColor: "#1D1D1F",
                borderColor: "#1D1D1F",
                color: "#FFFFFF",
              };
            } else {
              activeStyle = {
                backgroundColor: DIMENSION_COLOR[d],
                borderColor: DIMENSION_COLOR[d],
                color: DIMENSION_TEXT[d],
              };
            }
          }
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(d)}
              style={activeStyle}
              className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-medium transition-colors ${
                active
                  ? "border-transparent"
                  : "border-black/[.06] text-muted hover:text-ink"
              }`}
            >
              {DIMENSION_LABEL[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
