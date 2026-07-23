"use client";

import { useEffect, useMemo, useState, Fragment } from "react";

// Fetched at runtime from /news-summaries.json (copied from
// data/news/summaries.json by the `prebuild` script). Static-importing
// this file used to inline ~298 KB of JSON into the homepage bundle for
// every visitor. Runtime fetch lets the browser cache it separately and
// keeps the JS chunk lean.
interface NewsSummariesShape {
  generatedAt?: string;
  regional?: Record<
    string,
    { summary?: string; highlights?: Highlight[]; generatedAt?: string }
  >;
}

type RegionKey = "na" | "eu" | "asia";

const REGION_LABEL: Record<RegionKey, string> = {
  na: "North America",
  eu: "Europe",
  asia: "Asia-Pacific",
};

const TAB_ORDER: RegionKey[] = ["na", "eu", "asia"];
const TAB_LABEL: Record<RegionKey, string> = {
  na: "NA",
  eu: "EU",
  asia: "AP",
};

function formatRelative(iso: string | undefined): string {
  if (!iso) return "recently";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Curated highlights ──────────────────────────────────────────────
//
// Hand-picked phrases that carry the key insight of each clause.
// Matched by exact substring so only what matters gets colored.

type Topic = "legislation" | "infrastructure" | "cooperation";

const TOPIC_COLOR: Record<Topic, string> = {
  legislation: "rgba(10, 132, 255, 0.18)",
  infrastructure: "rgba(255, 149, 0, 0.18)",
  cooperation: "rgba(88, 86, 214, 0.18)",
};

interface Highlight {
  text: string;
  topic: Topic;
}

const CURATED: Record<string, Highlight[]> = {
  na: [
    { text: "establish a uniform federal standard and preempt conflicting state AI laws", topic: "legislation" },
    { text: "data-center moratorium bills swept at least 12 state legislatures", topic: "infrastructure" },
    { text: "freeze all AI data-center construction nationally", topic: "infrastructure" },
    { text: "enacted new AI laws covering chatbots, content provenance, and frontier-model safety", topic: "legislation" },
    { text: "pivoted to infrastructure-first policy", topic: "infrastructure" },
    { text: "sovereign AI data centres exceeding 100 MW", topic: "infrastructure" },
  ],
  eu: [
    { text: "delay and simplify key AI Act deadlines", topic: "legislation" },
    { text: "entered trilogue, targeting a final deal by 28 April", topic: "cooperation" },
    { text: "EU-wide Data Centre Rating Scheme", topic: "infrastructure" },
    { text: "Data Centre Energy Efficiency Package", topic: "infrastructure" },
    { text: "endorsed the New Delhi Declaration", topic: "cooperation" },
    { text: "alongside 91 nations", topic: "cooperation" },
  ],
  asia: [
    { text: "first country in the region to enforce a comprehensive AI law", topic: "legislation" },
    { text: "establishing risk tiers, transparency mandates, and a national AI safety research institute", topic: "legislation" },
    { text: "removes opt-in consent requirements to unlock data for AI training", topic: "legislation" },
    { text: "bringing AI provisions into national law", topic: "legislation" },
    { text: "mandate AI content labeling", topic: "legislation" },
    { text: "Model AI Governance Framework for Agentic AI", topic: "legislation" },
    { text: "without yet enacting binding legislation", topic: "cooperation" },
  ],
};

interface HighlightSpan {
  start: number;
  end: number;
  topic: Topic;
}

function findHighlights(
  text: string,
  regionKey: string,
  dynamic?: Highlight[],
): HighlightSpan[] {
  // Prefer dynamically-generated highlights (from the news pipeline) so
  // the underlines track regenerated prose. Fall back to the hand-curated
  // list only when no dynamic ones are present AND none of them matched.
  const source = dynamic && dynamic.length > 0 ? dynamic : (CURATED[regionKey] ?? []);
  const spans: HighlightSpan[] = [];
  for (const h of source) {
    const idx = text.indexOf(h.text);
    if (idx >= 0) {
      spans.push({ start: idx, end: idx + h.text.length, topic: h.topic });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  return spans;
}

function renderHighlighted(
  text: string,
  regionKey: string,
  keyPrefix: string,
  dynamic?: Highlight[],
) {
  const spans = findHighlights(text, regionKey, dynamic);
  if (spans.length === 0) return text;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let idx = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      out.push(
        <Fragment key={`${keyPrefix}-t-${idx}`}>
          {text.slice(cursor, span.start)}
        </Fragment>,
      );
    }
    const delay = 80 + idx * 100;
    out.push(
      <mark
        key={`${keyPrefix}-h-${idx}`}
        className="highlight-sweep font-medium text-ink"
        style={{
          ["--sweep-delay" as string]: `${delay}ms`,
          ["--sweep-color" as string]: TOPIC_COLOR[span.topic],
          backgroundColor: "transparent",
          color: "inherit",
        }}
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
    idx++;
  }
  if (cursor < text.length) {
    out.push(
      <Fragment key={`${keyPrefix}-tail`}>{text.slice(cursor)}</Fragment>,
    );
  }
  return out;
}

// Split on sentence boundaries but protect common abbreviations
// (Sen., Rep., Dr., Mr., Mrs., Ms., St., Jr., Sr., No., Vol., etc.)
// so "Rep. Alexandria" doesn't become a line break.
function splitSentences(text: string): string[] {
  const ABBR =
    /(?:Sen|Rep|Dr|Mr|Mrs|Ms|St|Jr|Sr|No|Vol|Inc|Corp|Ltd|Gov|Gen|Prof|Sgt|Cpl|vs|etc|approx|dept|est)\./gi;
  const placeholder = "\u0000";
  const safe = text.replace(ABBR, (m) => m.slice(0, -1) + placeholder);
  const sentences = safe
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .flatMap((s) => {
      const trimmed = s.replace(new RegExp(placeholder, "g"), ".").trim();
      return trimmed ? [trimmed] : [];
    });
  return sentences;
}

interface RegionalSummary {
  key: RegionKey;
  label: string;
  sentences: string[];
  highlights?: Highlight[];
  generatedAt?: string;
}

export default function AIOverview() {
  const [activeTab, setActiveTab] = useState<RegionKey>("na");
  const [newsSummaries, setNewsSummaries] = useState<NewsSummariesShape>({});

  // One-shot fetch on mount. Errors are silent — the section already has
  // an empty-state path when no regional summaries are present.
  useEffect(() => {
    let cancelled = false;
    fetch("/news-summaries.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setNewsSummaries(data as NewsSummariesShape);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const regional = (newsSummaries.regional ?? {}) as Record<
    string,
    {
      summary?: string;
      highlights?: Highlight[];
      generatedAt?: string;
    } | undefined
  >;

  const allRegions: RegionalSummary[] = useMemo(() => {
    const out: RegionalSummary[] = [];
    for (const k of TAB_ORDER) {
      const block = regional[k];
      const summary = block?.summary;
      if (!summary) continue;
      out.push({
        key: k,
        label: REGION_LABEL[k],
        sentences: splitSentences(summary),
        highlights: block?.highlights,
        generatedAt: block?.generatedAt,
      });
    }
    return out;
  }, [regional]);

  // Prefer the ACTIVE region's regeneration timestamp so the label tracks
  // the thing being read; fall back to the file-level generatedAt.
  const activeGeneratedAt =
    allRegions.find((r) => r.key === activeTab)?.generatedAt ??
    newsSummaries.generatedAt;
  const updated = formatRelative(activeGeneratedAt);

  const visibleRegion = allRegions.find((r) => r.key === activeTab);

  return (
    <div className="bg-black/[.02] rounded-3xl p-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-[13px] font-medium text-muted tracking-tight flex items-center gap-1.5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="#F5C518"
            aria-hidden
            className="flex-shrink-0"
          >
            <path d="M7 0L8.27 5.73L14 7L8.27 8.27L7 14L5.73 8.27L0 7L5.73 5.73Z" />
          </svg>
          AI overview · Updated {updated}
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-black/[.04]">
          {TAB_ORDER.map((k) => {
            const active = activeTab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setActiveTab(k)}
                className={`text-xs font-medium px-3.5 py-1.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                  active
                    ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-muted hover:text-ink"
                }`}
              >
                {TAB_LABEL[k]}
              </button>
            );
          })}
        </div>
      </div>

      {!visibleRegion ? (
        <p className="text-sm text-muted mt-6">
          No overview available yet. Run scripts/sync/news.ts to generate one.
        </p>
      ) : (
        <div key={activeTab} className="mt-5 animate-fade-rise">
          <div className="flex flex-col gap-3 max-w-3xl">
            {visibleRegion.sentences.map((s, i) => (
              <p
                key={`${visibleRegion.key}-${i}`}
                className="text-[15px] text-ink/75 leading-[1.75]"
              >
                {renderHighlighted(
                  s,
                  visibleRegion.key,
                  `${visibleRegion.key}-${i}`,
                  visibleRegion.highlights,
                )}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
