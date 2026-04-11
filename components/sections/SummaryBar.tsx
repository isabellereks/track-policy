"use client";

import { useState } from "react";
import { ENTITIES } from "@/lib/placeholder-data";
import type { Entity, StanceType } from "@/types";

interface Bucket {
  key: StanceType;
  label: string;
  color: string;
  textColor: string;
}

const BUCKETS: Bucket[] = [
  {
    key: "restrictive",
    label: "Active Bans / Moratoriums",
    color: "var(--color-stance-restrictive)",
    textColor: "#1D1D1F",
  },
  {
    key: "concerning",
    label: "Legislation Advancing",
    color: "var(--color-stance-concerning)",
    textColor: "#1D1D1F",
  },
  {
    key: "review",
    label: "Under Discussion",
    color: "var(--color-stance-review)",
    textColor: "#1D1D1F",
  },
  {
    key: "none",
    label: "No Action",
    color: "var(--color-stance-none)",
    textColor: "#1D1D1F",
  },
  {
    key: "favorable",
    label: "Favorable / Incentives",
    color: "var(--color-stance-favorable)",
    textColor: "#1D1D1F",
  },
];

export default function SummaryBar() {
  const [hovered, setHovered] = useState<StanceType | null>(null);

  const states = ENTITIES.filter(
    (e) => e.region === "na" && e.level === "state",
  );

  const grouped: Record<StanceType, Entity[]> = {
    restrictive: [],
    concerning: [],
    review: [],
    favorable: [],
    none: [],
  };
  for (const s of states) grouped[s.stance].push(s);

  const restrictingCount =
    grouped.restrictive.length + grouped.concerning.length;
  const incentivesCount = grouped.favorable.length;
  const totalStates = 50;

  const activeBucket = hovered
    ? (BUCKETS.find((b) => b.key === hovered) ?? null)
    : null;
  const activeStates = hovered ? grouped[hovered] : [];

  return (
    <div className="relative">
      {/* Legend row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-8">
        {BUCKETS.map((b) => {
          const count = grouped[b.key].length;
          return (
            <div key={b.key} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-[4px] flex-shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <span className="text-sm font-medium text-ink tracking-tight">
                {b.label}
              </span>
              <span className="text-sm text-muted">({count})</span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 mb-4 text-sm sm:text-base">
        <div className="text-muted leading-snug">
          <span className="font-semibold text-ink">{restrictingCount}</span> of{" "}
          {totalStates} states restricting or considering restrictions
        </div>
        <div className="text-muted leading-snug sm:text-right">
          <span className="font-semibold text-ink">{incentivesCount}</span>{" "}
          states with incentives
        </div>
      </div>

      {/* Segmented bar */}
      <div
        className="flex h-8 rounded-full overflow-hidden"
        onMouseLeave={() => setHovered(null)}
      >
        {BUCKETS.map((bucket) => {
          const count = grouped[bucket.key].length;
          if (count === 0) return null;
          const isDimmed = hovered !== null && hovered !== bucket.key;
          return (
            <div
              key={bucket.key}
              onMouseEnter={() => setHovered(bucket.key)}
              className="flex items-center justify-center text-sm font-semibold cursor-default transition-opacity duration-200"
              style={{
                flexGrow: count,
                flexBasis: 0,
                backgroundColor: bucket.color,
                color: bucket.textColor,
                opacity: isDimmed ? 0.35 : 1,
              }}
            >
              {count}
            </div>
          );
        })}
      </div>

      {/* Below the bar — help text OR active bucket detail */}
      <div className="mt-4 min-h-[3.5rem]">
        {activeBucket ? (
          <div>
            <div
              className="text-sm font-semibold tracking-tight mb-1"
              style={{ color: activeBucket.color }}
            >
              {activeBucket.label} — {activeStates.length} states
            </div>
            <div className="text-xs text-muted leading-relaxed">
              {activeStates.map((s) => s.name).join(", ")}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">
            <span className="hidden sm:inline">Hover over</span>
            <span className="sm:hidden">Tap</span> a segment to see which states
            fall into each category.
          </p>
        )}
      </div>
    </div>
  );
}
