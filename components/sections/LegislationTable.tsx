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
import BillExpanded from "@/components/panel/BillExpanded";

interface LegislationTableProps {
  dimension: Dimension;
  onNavigateToEntity: (target: ViewTarget) => void;
}

interface BillRow {
  bill: Legislation;
  entity: Entity;
  target: ViewTarget;
}

// "data-center" is a virtual filter that merges siting + energy bills
// into one chip (the underlying categories stay distinct in the data
// for dimension scoring; this is purely a UI grouping).
type CategoryFilter =
  | "all"
  | "data-center"
  | Exclude<
      LegislationCategory,
      "data-center-siting" | "data-center-energy"
    >;

const CATEGORY_FILTERS: CategoryFilter[] = [
  "all",
  "data-center",
  "ai-governance",
  "synthetic-media",
  "ai-healthcare",
  "ai-workforce",
  "ai-education",
  "ai-government",
  "data-privacy",
  "ai-criminal-justice",
];

const CATEGORY_FILTER_LABEL: Record<CategoryFilter, string> = {
  all: "All",
  "data-center": "Data Centers",
  "ai-governance": CATEGORY_LABEL["ai-governance"],
  "synthetic-media": CATEGORY_LABEL["synthetic-media"],
  "ai-healthcare": CATEGORY_LABEL["ai-healthcare"],
  "ai-workforce": CATEGORY_LABEL["ai-workforce"],
  "ai-education": CATEGORY_LABEL["ai-education"],
  "ai-government": CATEGORY_LABEL["ai-government"],
  "data-privacy": CATEGORY_LABEL["data-privacy"],
  "ai-criminal-justice": CATEGORY_LABEL["ai-criminal-justice"],
};

function billMatchesCategoryFilter(
  category: LegislationCategory,
  filter: CategoryFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "data-center") {
    return category === "data-center-siting" || category === "data-center-energy";
  }
  return category === filter;
}

type SortKey = "recent" | "oldest" | "stage" | "state";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "oldest", label: "Oldest" },
  { key: "stage", label: "Stage" },
  { key: "state", label: "State" },
];

type JurisdictionFilter = "all" | "us-federal" | "us-states" | "international";

const JURISDICTION_OPTIONS: { key: JurisdictionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "us-federal", label: "US Federal" },
  { key: "us-states", label: "US States" },
  { key: "international", label: "International" },
];

function matchesJurisdiction(entity: Entity, j: JurisdictionFilter): boolean {
  if (j === "all") return true;
  if (j === "us-federal") {
    return (
      entity.region === "na" &&
      entity.level === "federal" &&
      entity.geoId === "840"
    );
  }
  if (j === "us-states") {
    return entity.region === "na" && entity.level === "state";
  }
  // international: anything that isn't US federal or a US state
  return !(
    entity.region === "na" &&
    (entity.level === "state" ||
      (entity.level === "federal" && entity.geoId === "840"))
  );
}

const STAGE_ORDER: Record<Stage, number> = {
  Enacted: 5,
  Floor: 4,
  Committee: 3,
  Filed: 2,
  "Carried Over": 1,
  Dead: 0,
};

type StatusFilter = "all" | "proposed" | "voting" | "passed" | "dead";

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "proposed", label: "Proposed" },
  { key: "voting", label: "About to vote" },
  { key: "passed", label: "Passed into law" },
  { key: "dead", label: "Dead or stalled" },
];

function matchesStatus(stage: Stage, s: StatusFilter): boolean {
  if (s === "all") return true;
  if (s === "proposed") return stage === "Filed" || stage === "Committee";
  if (s === "voting") return stage === "Floor";
  if (s === "passed") return stage === "Enacted";
  return stage === "Dead" || stage === "Carried Over";
}

function rowMatchesQuery(row: BillRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    row.bill.billCode.toLowerCase().includes(needle) ||
    row.bill.title.toLowerCase().includes(needle) ||
    row.bill.summary.toLowerCase().includes(needle) ||
    row.entity.name.toLowerCase().includes(needle)
  );
}

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
  const [activeJurisdiction, setActiveJurisdiction] =
    useState<JurisdictionFilter>("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [expanded, setExpanded] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const allRows = useMemo(() => buildRows(), []);

  const filtered = useMemo(() => {
    let rows = allRows;

    if (activeJurisdiction !== "all") {
      rows = rows.filter((r) =>
        matchesJurisdiction(r.entity, activeJurisdiction),
      );
    }

    if (activeCategory !== "all") {
      rows = rows.filter((r) =>
        billMatchesCategoryFilter(r.bill.category, activeCategory),
      );
    }

    if (activeStatus !== "all") {
      rows = rows.filter((r) => matchesStatus(r.bill.stage, activeStatus));
    }

    if (dimension !== "overall") {
      const dimensionTags = new Set(DIMENSION_TAGS[dimension]);
      rows = rows.filter((r) =>
        r.bill.impactTags.some((t) => dimensionTags.has(t)),
      );
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      rows = rows.filter((r) => rowMatchesQuery(r, trimmedQuery));
    }

    return [...rows].sort((a, b) => compareRows(a, b, sortKey));
  }, [
    allRows,
    activeCategory,
    activeJurisdiction,
    activeStatus,
    dimension,
    sortKey,
    query,
  ]);

  // Pre-compute counts per jurisdiction (under the current category +
  // dimension filters) so the chip badges are live.
  const jurisdictionCounts = useMemo(() => {
    let rows = allRows;
    if (activeCategory !== "all") {
      rows = rows.filter((r) =>
        billMatchesCategoryFilter(r.bill.category, activeCategory),
      );
    }
    if (dimension !== "overall") {
      const dimensionTags = new Set(DIMENSION_TAGS[dimension]);
      rows = rows.filter((r) =>
        r.bill.impactTags.some((t) => dimensionTags.has(t)),
      );
    }
    const counts: Record<JurisdictionFilter, number> = {
      all: rows.length,
      "us-federal": 0,
      "us-states": 0,
      international: 0,
    };
    for (const r of rows) {
      if (matchesJurisdiction(r.entity, "us-federal")) counts["us-federal"] += 1;
      else if (matchesJurisdiction(r.entity, "us-states")) counts["us-states"] += 1;
      else counts.international += 1;
    }
    return counts;
  }, [allRows, activeCategory, dimension]);

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
      return dimensionFilteredRows.some((r) =>
        billMatchesCategoryFilter(r.bill.category, c),
      );
    });
  }, [dimensionFilteredRows]);

  const hasMore = filtered.length > PREVIEW_COUNT;
  const visible = expanded ? filtered : filtered.slice(0, PREVIEW_COUNT);

  return (
    <div>
      {/* Search input */}
      <div className="mb-6">
        <div className="max-w-md flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white border border-black/[.06] focus-within:border-black/20 transition-colors">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="text-muted flex-shrink-0"
          >
            <circle
              cx="6"
              cy="6"
              r="4.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M9.5 9.5L12.5 12.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by bill code, title, summary, or state…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none min-w-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-muted hover:text-ink flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 3L9 9M9 3L3 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Jurisdiction row — US Federal / US States / International */}
      <div className="mb-4">
        <div className="text-[13px] font-medium text-muted tracking-tight mb-2">
          Scope
        </div>
        <div className="flex flex-wrap gap-2">
          {JURISDICTION_OPTIONS.map((opt) => {
            const active = opt.key === activeJurisdiction;
            const count = jurisdictionCounts[opt.key];
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setActiveJurisdiction(opt.key)}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "border border-black/[.06] text-muted hover:text-ink"
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`text-[10px] ${active ? "text-white/70" : "text-muted"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic row */}
      <div className="mb-4">
        <div className="text-[13px] font-medium text-muted tracking-tight mb-2">
          Topic
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
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
                  {CATEGORY_FILTER_LABEL[c]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status row */}
      <div className="mb-4">
        <div className="text-[13px] font-medium text-muted tracking-tight mb-2">
          Status
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.key === activeStatus;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setActiveStatus(opt.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "border border-black/[.06] text-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sort dropdown */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-[13px] font-medium text-muted tracking-tight">
          Sort
        </span>
        <div className="relative">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="appearance-none rounded-full bg-black/[.04] text-ink text-xs font-medium pl-3 pr-7 py-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
          >
            <path
              d="M2.5 3.75L5 6.25L7.5 3.75"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
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
              const rowId = `${entity.id}-${bill.id}`;
              const isOpen = openRowId === rowId;
              const stateCode =
                entity.level === "federal" && entity.geoId === "840"
                  ? "US"
                  : undefined;
              return (
                <div
                  key={rowId}
                  className="bg-bg/60 hover:bg-bg rounded-2xl p-5 transition-colors"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => setOpenRowId(isOpen ? null : rowId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenRowId(isOpen ? null : rowId);
                      }
                    }}
                    className="w-full text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ink/20 rounded-lg"
                  >
                    <div className="flex items-baseline gap-2 text-xs text-muted">
                      <span>{bill.billCode}</span>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateToEntity(target);
                        }}
                        className="underline underline-offset-2 decoration-muted/40 hover:decoration-ink hover:text-ink transition-colors"
                      >
                        {entity.name}
                      </button>
                    </div>
                    <div className="text-sm font-medium text-ink tracking-tight mt-1">
                      {bill.title}
                    </div>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed line-clamp-2">
                      {bill.summary}
                    </p>
                    <BillTimeline stage={bill.stage} />
                  </div>

                  {/* Expand/collapse — animates height (grid-template-rows
                      0fr ↔ 1fr trick) plus opacity + a tiny lift so the
                      content feels like it slides in from the card body
                      instead of popping. BillExpanded stays mounted in
                      both states so the close direction has something
                      to animate from. */}
                  <div
                    className="grid transition-[grid-template-rows,opacity,transform] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                      gridTemplateRows: isOpen ? "1fr" : "0fr",
                      opacity: isOpen ? 1 : 0,
                      transform: isOpen ? "translateY(0)" : "translateY(-4px)",
                    }}
                    aria-hidden={!isOpen}
                  >
                    <div className="overflow-hidden min-h-0">
                      <BillExpanded bill={bill} stateCode={stateCode} />
                    </div>
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
