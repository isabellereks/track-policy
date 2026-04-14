"use client";

import type { DataCenter } from "@/types";
import { DC_COLOR } from "./DataCenterDots";
import { ProposalProgress } from "@/components/ui/ProposalProgress";

interface DataCenterCardProps {
  facility: DataCenter;
  x: number;
  y: number;
  /** If > 1, this card is showing the largest facility in a cluster. */
  clusterSize?: number;
}

function formatMW(mw: number | undefined): string | null {
  if (!mw) return null;
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw)} MW`;
}

function formatCost(n: number | undefined): string | null {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n}`;
}

function formatH100e(n: number | undefined): string | null {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${Math.round(n)}`;
}

function stripConfidence(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(/\s*#\w+/g, "").trim();
}

const STATUS_LABEL: Record<DataCenter["status"], string> = {
  operational: "Operational",
  "under-construction": "Under construction",
  proposed: "Proposed",
};

/**
 * Glance card shown on dot hover. Designed for scan-in-one-second
 * reading: bold labels with right-aligned values, status badge up top,
 * "View details" footer that reinforces the click affordance. Rows
 * are conditional — never show an empty field.
 */
export default function DataCenterCard({
  facility,
  x,
  y,
  clusterSize = 1,
}: DataCenterCardProps) {
  const operator = stripConfidence(facility.operator) ?? facility.operator;
  const user = stripConfidence(facility.primaryUser);
  const capacity = formatMW(facility.capacityMW);
  const cost = formatCost(facility.costUSD);
  const compute = formatH100e(facility.computeH100e);
  const color = DC_COLOR[facility.status];
  const isProposed = facility.status === "proposed";
  const isCluster = clusterSize > 1;

  // Location: prefer "City, State/Country", but skip the qualifier when
  // it's already in the raw location string.
  const rawLocation = stripConfidence(facility.location);
  const qualifier = facility.state ?? facility.country;
  const locationLine =
    rawLocation && qualifier && !rawLocation.toLowerCase().includes(qualifier.toLowerCase())
      ? `${rawLocation}, ${qualifier}`
      : (rawLocation ?? qualifier ?? null);

  const showUser = !!user;
  const rows: Array<{ label: string; value: string }> = [];
  if (showUser) rows.push({ label: "User", value: user! });
  if (capacity) rows.push({ label: "Power", value: capacity });
  if (cost) rows.push({ label: "Cost", value: cost });
  if (compute) rows.push({ label: "Compute", value: `${compute} H100e` });
  if (locationLine) rows.push({ label: "Location", value: locationLine });

  // Edge-aware positioning so the card never spills off-viewport. Height
  // estimate grows when optional sections render — without this the
  // bottom of the card clips when a proposal block is present near the
  // viewport edge.
  const cardWidth = 260;
  const hasProposalBlock =
    !!facility.proposal?.process && facility.proposal.process.length > 0;
  const estHeight =
    120 + // header
    rows.length * 22 + // rows
    (hasProposalBlock ? 70 : 0) +
    36; // footer
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const flipRight = x > vw - cardWidth - 24;
  const flipDown = y > vh - estHeight - 24;
  const left = flipRight ? x - cardWidth - 16 : x + 16;
  const top = flipDown ? Math.max(16, y - estHeight + 16) : y + 16;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left, top, width: cardWidth }}
      aria-hidden
    >
      <div
        className="rounded-2xl bg-white/95 backdrop-blur-2xl border border-black/[.04] overflow-hidden"
        style={{
          boxShadow:
            "0 12px 36px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        {/* Type scale (shared with the map tooltip):
              13/600 ink     — title
              12/400 ink     — body / values
              11/500 muted   — labels (key column, status, footer)
              11/400 muted   — captions  */}
        <div className="px-3.5 pt-3 pb-2.5">
          <div className="text-[13px] font-semibold text-ink tracking-tight leading-tight">
            {operator}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bg/80">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: isProposed ? "transparent" : color,
                border: isProposed ? `1.25px solid ${color}` : "none",
              }}
            />
            <span className="text-[11px] font-medium text-ink tracking-tight">
              {STATUS_LABEL[facility.status]}
            </span>
          </div>
        </div>

        {rows.length > 0 && (
          <dl className="mx-3.5 pt-2 pb-2.5 border-t border-black/[.05] flex flex-col gap-0.5">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="text-[11px] font-medium text-muted tracking-tight flex-shrink-0">
                  {r.label}
                </dt>
                <dd className="text-[12px] text-ink text-right tracking-tight truncate min-w-0">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {facility.proposal?.process && facility.proposal.process.length > 0 && (
          <div className="px-3.5 pt-2.5 pb-2.5 border-t border-black/[.05]">
            <ProposalProgress process={facility.proposal.process} variant="dense" />
            {facility.proposal.nextDecision && (
              <div className="mt-2">
                <div className="text-[11px] font-medium text-muted tracking-tight mb-0.5">
                  Next
                </div>
                <div className="text-[12.5px] text-ink tracking-tight leading-snug">
                  {facility.proposal.nextDecision.what}
                </div>
                {(facility.proposal.nextDecision.body ||
                  facility.proposal.nextDecision.date) && (
                  <div className="text-[11px] text-muted tracking-tight mt-0.5">
                    {facility.proposal.nextDecision.body}
                    {facility.proposal.nextDecision.body &&
                      facility.proposal.nextDecision.date && (
                        <span aria-hidden> · </span>
                      )}
                    {facility.proposal.nextDecision.date}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="px-3.5 pb-3 pt-1.5 border-t border-black/[.05] flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted tracking-tight">
            {isCluster
              ? `+ ${clusterSize - 1} more nearby`
              : "View details"}
          </span>
          <span className="text-[11px] text-muted tracking-tight" aria-hidden>
            →
          </span>
        </div>
      </div>
    </div>
  );
}
