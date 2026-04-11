"use client";

import { useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  IMPACT_TAG_LABEL,
  type Dimension,
  type Entity,
  type Legislation,
  type LegislationCategory,
  type Stage,
  type ViewTarget,
} from "@/types";
import { ENTITIES } from "@/lib/placeholder-data";
import { DIMENSION_TAGS } from "@/lib/dimensions";
import BillTimeline from "@/components/ui/BillTimeline";

interface LegislationTableProps {
  dimension: Dimension;
  onNavigateToEntity: (target: ViewTarget) => void;
}

interface BillRow {
  bill: Legislation;
  entity: Entity;
  target: ViewTarget;
}

type CategoryFilter = LegislationCategory | "all";

const CATEGORY_FILTERS: CategoryFilter[] = [
  "all",
  "data-center-siting",
  "data-center-energy",
  "ai-governance",
  "synthetic-media",
  "ai-healthcare",
  "ai-workforce",
  "ai-education",
  "ai-government",
  "data-privacy",
  "ai-criminal-justice",
];

type SortKey = "recent" | "oldest" | "stage" | "state";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "oldest", label: "Oldest" },
  { key: "stage", label: "Stage" },
  { key: "state", label: "State" },
];

const STAGE_ORDER: Record<Stage, number> = {
  Enacted: 5,
  Floor: 4,
  Committee: 3,
  Filed: 2,
  "Carried Over": 1,
  Dead: 0,
};

const PREVIEW_COUNT = 10;

function buildRows(): BillRow[] {
  const rows: BillRow[] = [];
  for (const entity of ENTITIES) {
    const target: ViewTarget = {
      region: entity.region,
      naView: entity.level === "state" ? "states" : "countries",
      selectedGeoId: entity.isOverview ? null : entity.geoId,
    };
    for (const bill of entity.legislation) {
      rows.push({ bill, entity, target });
    }
  }
  return rows;
}

function compareRows(a: BillRow, b: BillRow, sort: SortKey): number {
  switch (sort) {
    case "recent":
      return b.bill.updatedDate.localeCompare(a.bill.updatedDate);
    case "oldest":
      return a.bill.updatedDate.localeCompare(b.bill.updatedDate);
    case "stage": {
      const delta = STAGE_ORDER[b.bill.stage] - STAGE_ORDER[a.bill.stage];
      if (delta !== 0) return delta;
      return b.bill.updatedDate.localeCompare(a.bill.updatedDate);
    }
    case "state": {
      const delta = a.entity.name.localeCompare(b.entity.name);
      if (delta !== 0) return delta;
      return b.bill.updatedDate.localeCompare(a.bill.updatedDate);
    }
  }
}

export default function LegislationTable({
  dimension,
  onNavigateToEntity,
}: LegislationTableProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [expanded, setExpanded] = useState(false);

  const allRows = useMemo(() => buildRows(), []);

  const filtered = useMemo(() => {
    let rows = allRows;

    if (activeCategory !== "all") {
      rows = rows.filter((r) => r.bill.category === activeCategory);
    }

    if (dimension !== "overall") {
      const dimensionTags = new Set(DIMENSION_TAGS[dimension]);
      rows = rows.filter((r) =>
        r.bill.impactTags.some((t) => dimensionTags.has(t)),
      );
    }

    return [...rows].sort((a, b) => compareRows(a, b, sortKey));
  }, [allRows, activeCategory, dimension, sortKey]);

  const billCount = filtered.length;
  const entityCount = new Set(filtered.map((r) => r.entity.id)).size;

  // Hide categories that have zero bills under the current dimension filter,
  // but always keep "all" visible.
  const dimensionFilteredRows = useMemo(() => {
    if (dimension === "overall") return allRows;
    const dimensionTags = new Set(DIMENSION_TAGS[dimension]);
    return allRows.filter((r) =>
      r.bill.impactTags.some((t) => dimensionTags.has(t)),
    );
  }, [allRows, dimension]);

  const visibleCategories = useMemo(() => {
    return CATEGORY_FILTERS.filter((c) => {
      if (c === "all") return true;
      return dimensionFilteredRows.some((r) => r.bill.category === c);
    });
  }, [dimensionFilteredRows]);

  const hasMore = filtered.length > PREVIEW_COUNT;
  const visible = expanded ? filtered : filtered.slice(0, PREVIEW_COUNT);

  return (
    <div>
      {/* Filter chips + counts */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-2">
          {visibleCategories.map((c) => {
            const active = c === activeCategory;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCategory(c)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "border border-black/[.06] text-muted hover:text-ink"
                }`}
              >
                {c === "all" ? "All" : CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted whitespace-nowrap">
          <span className="font-semibold text-ink">{billCount}</span> bills ·{" "}
          <span className="font-semibold text-ink">{entityCount}</span> entities
        </div>
      </div>

      {/* Sort row */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-[11px] uppercase tracking-widest text-muted mr-1">
          Sort
        </span>
        {SORT_OPTIONS.map((opt) => {
          const active = opt.key === sortKey;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortKey(opt.key)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-black/[.08] text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">
          No bills match this filter.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {visible.map(({ bill, entity, target }) => {
              const href = bill.legiscanUrl ?? bill.sourceUrl;
              return (
              <div
                key={`${entity.id}-${bill.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onNavigateToEntity(target)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNavigateToEntity(target);
                  }
                }}
                className="cursor-pointer w-full text-left bg-bg/60 hover:bg-bg rounded-2xl p-5 transition-colors"
              >
                <div className="flex items-baseline gap-3">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-muted hover:text-ink underline underline-offset-2 decoration-transparent hover:decoration-current transition-colors"
                    >
                      {bill.billCode} ↗
                    </a>
                  ) : (
                    <span className="text-xs text-muted">{bill.billCode}</span>
                  )}
                  <span className="text-xs text-muted ml-auto">
                    {entity.name}
                  </span>
                </div>
                <div className="text-sm font-medium text-ink tracking-tight mt-1">
                  {bill.title}
                </div>
                {bill.impactTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {bill.impactTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] bg-black/[.04] text-muted px-2 py-0.5 rounded-full"
                      >
                        {IMPACT_TAG_LABEL[tag]}
                      </span>
                    ))}
                  </div>
                )}
                <BillTimeline stage={bill.stage} />
                <div className="text-[11px] text-muted mt-2 flex items-center gap-3">
                  {bill.partyOrigin && (
                    <span>
                      {bill.partyOrigin === "B"
                        ? "Bipartisan"
                        : bill.partyOrigin === "D"
                          ? "Democrat"
                          : "Republican"}
                    </span>
                  )}
                  <span>Updated {bill.updatedDate}</span>
                </div>
              </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-full border border-black/[.06] text-muted hover:text-ink px-5 py-2 text-xs font-medium transition-colors"
              >
                {expanded
                  ? "Show less"
                  : `Show all ${filtered.length} bills →`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
