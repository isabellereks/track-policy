"use client";

import { useMemo, useState, Fragment } from "react";
import newsSummaries from "@/data/news/summaries.json";

type RegionKey = "all" | "na" | "eu" | "asia";

const REGION_LABEL: Record<Exclude<RegionKey, "all">, string> = {
  na: "North America",
  eu: "Europe",
  asia: "Asia-Pacific",
};

const TAB_ORDER: RegionKey[] = ["all", "na", "eu", "asia"];
const TAB_LABEL: Record<RegionKey, string> = {
  all: "Global",
  na: "North America",
  eu: "Europe",
  asia: "Asia-Pacific",
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

// ─── Topic-based highlight system ────────────────────────────────────
//
// Three topic colors, each with narrow patterns that only fire on
// genuinely meaningful phrases. The goal is clarity, not coverage —
// a few well-placed highlights beat a wall of bold.

type Topic = "legislation" | "infrastructure" | "cooperation";

const TOPIC_COLOR: Record<Topic, string> = {
  legislation: "rgba(10, 132, 255, 0.22)",    // blue — bills, acts, laws
  infrastructure: "rgba(255, 149, 0, 0.22)",  // amber — data centers, energy
  cooperation: "rgba(88, 86, 214, 0.22)",     // indigo — summits, agreements
};

interface TopicPattern {
  topic: Topic;
  pattern: RegExp;
}

// Patterns are deliberately narrow. They match the language of policy
// reporting, not general English.
const TOPIC_PATTERNS: TopicPattern[] = [
  // ── Legislation (blue) ──
  // Named acts, bills, and frameworks — require a policy keyword at the end
  // preceded by at least one capitalized word.
  {
    topic: "legislation",
    pattern:
      /\b(?:National|Federal|Digital|Personal|AI|Data|Generative)\s+(?:[A-Z][A-Za-z-]+\s+){0,5}(?:Act|Bill|Framework|Directive|Regulation|Order|Code|Law|Package|Guidelines|Rules|Amendments?)\b(?:\s*\([^)]+\))?/g,
  },
  // Specific short-form references: "Bill C-27", "AIDA", "COM(...)"
  {
    topic: "legislation",
    pattern: /\b(?:Bill\s+[A-Z]-\d+(?:\/[A-Z]+)?|AIDA)\b/g,
  },
  // "enacted", "took effect", "approved" + context — the verdict phrases
  {
    topic: "legislation",
    pattern:
      /\b(?:enacted|took effect|entered into force|approved a landmark|enacting binding)\b/gi,
  },

  // ── Infrastructure (amber) ──
  // Data center + action combos: moratorium, construction, freeze, capacity
  {
    topic: "infrastructure",
    pattern:
      /\bdata[- ]cent(?:er|re)s?\s+(?:moratorium|construction|freeze|capacity|rating|energy|efficiency|siting)\b/gi,
  },
  // Reverse: "moratorium bills", "sovereign AI data centres"
  {
    topic: "infrastructure",
    pattern:
      /\b(?:moratorium bills?|sovereign AI data cent(?:er|re)s?)\b/gi,
  },
  // Power figures: "100 MW", "1.2 GW"
  {
    topic: "infrastructure",
    pattern: /\b\d+(?:\.\d+)?\s*(?:MW|GW|TWh|megawatt|gigawatt)s?\b/gi,
  },

  // ── Cooperation (indigo) ──
  // Named summits, declarations, international agreements
  {
    topic: "cooperation",
    pattern:
      /\b(?:New Delhi|Paris|Hiroshima|Bletchley|Seoul)\s+(?:Declaration|Summit|Agreement|Statement)\b/g,
  },
  {
    topic: "cooperation",
    pattern: /\bAI (?:Impact |Safety |Action )?Summit\b/g,
  },
  // "alongside N nations/countries"
  {
    topic: "cooperation",
    pattern: /\b(?:alongside|among)\s+\d+\s+(?:nations?|countries?)\b/gi,
  },
  // Trilogue, public consultation — procedural milestones
  {
    topic: "cooperation",
    pattern: /\b(?:entered? trilogue|public consultation)\b/gi,
  },
];

interface HighlightSpan {
  start: number;
  end: number;
  topic: Topic;
}

function findHighlights(text: string): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  for (const { topic, pattern } of TOPIC_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length, topic });
      if (m[0].length === 0) pattern.lastIndex++;
    }
  }
  // Sort by start, then longest wins on overlap.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: HighlightSpan[] = [];
  for (const s of spans) {
    const prev = merged[merged.length - 1];
    if (prev && s.start < prev.end) {
      if (s.end - s.start > prev.end - prev.start) {
        merged[merged.length - 1] = s;
      }
    } else {
      merged.push(s);
    }
  }
  return merged;
}

function renderHighlighted(text: string, keyPrefix: string) {
  const spans = findHighlights(text);
  if (spans.length === 0) return text;
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let highlightIdx = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      out.push(
        <Fragment key={`${keyPrefix}-t-${highlightIdx}`}>
          {text.slice(cursor, span.start)}
        </Fragment>,
      );
    }
    const delay = 100 + highlightIdx * 80;
    const color = TOPIC_COLOR[span.topic];
    out.push(
      <strong
        key={`${keyPrefix}-h-${highlightIdx}`}
        className="font-semibold text-ink highlight-sweep"
        style={{
          ["--sweep-delay" as string]: `${delay}ms`,
          ["--sweep-color" as string]: color,
        }}
      >
        {text.slice(span.start, span.end)}
      </strong>,
    );
    cursor = span.end;
    highlightIdx++;
  }
  if (cursor < text.length) {
    out.push(
      <Fragment key={`${keyPrefix}-tail`}>{text.slice(cursor)}</Fragment>,
    );
  }
  return out;
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space + capital letter,
  // keeping the punctuation with its sentence.
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface RegionalSummary {
  key: Exclude<RegionKey, "all">;
  label: string;
  sentences: string[];
}

export default function AIOverview() {
  const [tab, setTab] = useState<RegionKey>("all");

  const regional = (newsSummaries.regional ?? {}) as Record<
    string,
    { summary?: string } | undefined
  >;
  const updated = formatRelative(newsSummaries.generatedAt);

  const allRegions: RegionalSummary[] = useMemo(() => {
    const order: Array<Exclude<RegionKey, "all">> = ["na", "eu", "asia"];
    return order
      .map((k) => {
        const summary = regional[k]?.summary;
        if (!summary) return null;
        return {
          key: k,
          label: REGION_LABEL[k],
          sentences: splitSentences(summary),
        };
      })
      .filter((r): r is RegionalSummary => r !== null);
  }, [regional]);

  const visibleRegions =
    tab === "all" ? allRegions : allRegions.filter((r) => r.key === tab);

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

        <div className="flex items-center gap-1 bg-black/[.04] rounded-full p-0.5">
          {TAB_ORDER.map((k) => {
            const active = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-full tracking-tight transition-colors ${
                  active
                    ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-muted hover:text-ink"
                }`}
              >
                {TAB_LABEL[k]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend — quick key for the three highlight topics */}
      <div className="mt-4 flex items-center gap-4 text-[10px] text-muted tracking-tight">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: TOPIC_COLOR.legislation }}
          />
          Legislation
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: TOPIC_COLOR.infrastructure }}
          />
          Infrastructure
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: TOPIC_COLOR.cooperation }}
          />
          Cooperation
        </span>
      </div>

      {visibleRegions.length === 0 ? (
        <p className="text-sm text-muted mt-6">
          No overview available yet. Run scripts/sync/news.ts to generate one.
        </p>
      ) : (
        <div key={tab} className="mt-6 flex flex-col gap-8 animate-fade-rise">
          {visibleRegions.map((region) => (
            <div key={region.key}>
              {tab === "all" && (
                <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.08em] mb-3">
                  {region.label}
                </div>
              )}
              <div className="flex flex-col gap-3.5 max-w-3xl">
                {region.sentences.map((s, i) => (
                  <p
                    key={`${region.key}-${i}`}
                    className="text-[15px] text-ink/80 leading-[1.7]"
                  >
                    {renderHighlighted(s, `${region.key}-${i}`)}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
