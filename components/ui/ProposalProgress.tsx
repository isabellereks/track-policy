"use client";

import type { ProposalGate, ProposalGateStatus } from "@/types";

/**
 * Horizontal dot-row showing a proposal's approval pipeline.
 *
 * Kept deliberately small so it fits both a hover tooltip (tight) and the
 * pinned side panel (generous). Uses the site's stance palette for color
 * so it slots into the rest of the map legend without introducing a new
 * signal system:
 *   done     → favorable green (an affirmative step)
 *   pending  → muted grey outline
 *   blocked  → restrictive red
 *
 * Typography / spacing mirror the hover card's existing rows — 10.5–11px
 * labels, tabular-nums counter, ~0.08em tracking on the heading.
 */
interface ProposalProgressProps {
  process: ProposalGate[];
  /** Dense = tooltip mode (dots only). Full = detail panel (dots + labels). */
  variant?: "dense" | "full";
}

const DOT_BASE =
  "inline-block w-[7px] h-[7px] rounded-full flex-shrink-0 transition-colors";

const DOT_STYLE: Record<ProposalGateStatus, string> = {
  done: "bg-stance-favorable",
  pending: "border border-black/25",
  blocked: "bg-stance-restrictive",
};

const GATE_COPY: Record<ProposalGateStatus, string> = {
  done: "Cleared",
  pending: "Pending",
  blocked: "Blocked",
};

export function ProposalProgress({
  process,
  variant = "dense",
}: ProposalProgressProps) {
  if (!process || process.length === 0) return null;
  const done = process.filter((g) => g.status === "done").length;
  const total = process.length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-medium text-muted tracking-tight">
          Progress
        </span>
        <span className="text-[11px] text-muted tabular-nums">
          {done} / {total}
        </span>
      </div>

      {variant === "dense" ? (
        // Tooltip: dots only, with native hover title so curious users can
        // still see the labels without blowing up the card.
        <div className="flex items-center gap-[7px]">
          {process.map((g, i) => (
            <span
              key={`${g.label}-${i}`}
              className={`${DOT_BASE} ${DOT_STYLE[g.status]}`}
              title={`${g.label} — ${GATE_COPY[g.status]}${g.date ? ` · ${g.date}` : ""}`}
            />
          ))}
        </div>
      ) : (
        // Detail panel: a vertical list of (dot, label) rows. Horizontal
        // with labels underneath each dot looked crunched — truncated at
        // "Site acq…" and friends. A stack breathes: each gate gets a
        // full-width line with its date on the right.
        <ul className="flex flex-col gap-1.5">
          {process.map((g, i) => (
            <li
              key={`${g.label}-${i}`}
              className="flex items-center gap-2 text-[12px] tracking-tight"
            >
              <span
                className={`${DOT_BASE} ${DOT_STYLE[g.status]}`}
                aria-hidden
              />
              <span
                className={`flex-1 min-w-0 leading-snug ${
                  g.status === "pending" ? "text-muted" : "text-ink/85"
                }`}
              >
                {g.label}
              </span>
              {g.date && (
                <span className="text-[11px] text-muted tracking-tight whitespace-nowrap">
                  {g.date}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
