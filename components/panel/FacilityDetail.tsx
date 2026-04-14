"use client";

import { useState } from "react";
import type { DataCenter, ImpactTag, MunicipalAction } from "@/types";
import { IMPACT_TAG_LABEL } from "@/types";
import { DC_COLOR } from "@/components/map/DataCenterDots";
import { ProposalProgress } from "@/components/ui/ProposalProgress";
import { findActionsForFacility } from "@/lib/action-facility-link";
import { getMunicipalitiesByState } from "@/lib/municipal-data";
import { STANCE_HEX } from "@/lib/map-utils";
import type { StanceType } from "@/types";

const ACTION_STATUS_STANCE: Record<MunicipalAction["status"], StanceType> = {
  enacted: "restrictive",
  "under-review": "concerning",
  proposed: "review",
  failed: "none",
};

const ACTION_STATUS_LABEL: Record<MunicipalAction["status"], string> = {
  enacted: "Enacted",
  "under-review": "Under review",
  proposed: "Proposed",
  failed: "Failed",
};

interface FacilityDetailProps {
  facility: DataCenter;
}

function formatMW(mw: number | undefined): string | null {
  if (!mw) return null;
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw)} MW`;
}

function formatH100e(n: number | undefined): string | null {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M H100e`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k H100e`;
  return `${Math.round(n)} H100e`;
}

function formatCost(n: number | undefined): string | null {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n}`;
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
 * Pinned facility detail shown inside the side panel. Intentionally
 * minimal — matches the entity panel's rhythm (header + blurb + simple
 * definition list) instead of the busy pill-heavy treatment it had
 * before.
 */
function prettyConcern(tag: string): string {
  return (
    IMPACT_TAG_LABEL[tag as ImpactTag] ??
    tag
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export default function FacilityDetail({
  facility,
}: FacilityDetailProps) {
  const [issuesOpen, setIssuesOpen] = useState(true);
  const operator = stripConfidence(facility.operator) ?? facility.operator;
  const user = stripConfidence(facility.primaryUser);

  // Reverse link: find county actions whose title/summary name this
  // facility. Limited to municipalities in the facility's own state to
  // keep the match tight.
  const relatedActions: Array<MunicipalAction & { municipalityName: string }> =
    facility.state
      ? findActionsForFacility(
          facility,
          getMunicipalitiesByState(facility.state).flatMap((m) =>
            m.actions.map((a) => ({ ...a, municipalityName: m.name })),
          ),
        )
      : [];
  const capacity = formatMW(facility.capacityMW);
  const compute = formatH100e(facility.computeH100e);
  const cost = formatCost(facility.costUSD);
  const color = DC_COLOR[facility.status];
  const isProposed = facility.status === "proposed";
  const showUser = !!user;

  const details: Array<{ label: string; value: string }> = [];
  if (showUser) details.push({ label: "Primary user", value: user! });
  if (capacity) details.push({ label: "Capacity", value: capacity });
  if (compute) details.push({ label: "Compute", value: compute });
  if (cost) details.push({ label: "Invested", value: cost });
  if (facility.yearBuilt)
    details.push({ label: "Built", value: String(facility.yearBuilt) });
  else if (facility.yearProposed)
    details.push({ label: "Proposed", value: String(facility.yearProposed) });
  details.push({ label: "Location", value: facility.location });

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header — mirrors the entity panel (h2 + small status line) */}
      <div className="px-6 pt-1 pb-5 border-b border-black/[.06]">
        <h2 className="text-2xl font-semibold text-ink tracking-tight leading-[1.1]">
          {operator}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: isProposed ? "transparent" : color,
              border: isProposed ? `1.25px solid ${color}` : "none",
            }}
          />
          <span>{STATUS_LABEL[facility.status]}</span>
          {capacity && (
            <>
              <span aria-hidden>·</span>
              <span>{capacity}</span>
            </>
          )}
        </div>
      </div>

      <div className="p-6 flex flex-col gap-5">
        {/* Notes paragraph — equivalent of ContextBlurb for facilities */}
        {facility.notes && (
          <p className="text-sm text-muted leading-relaxed">
            {facility.notes}
          </p>
        )}

        {/* Simple definition list — no pills, no cards, just key/value */}
        {details.length > 0 && (
          <dl className="flex flex-col">
            {details.map((d, i) => (
              <div
                key={d.label}
                className={`flex items-start justify-between gap-4 py-2.5 text-[13px] ${
                  i === 0 ? "" : "border-t border-black/[.04]"
                }`}
              >
                <dt className="text-muted flex-shrink-0">{d.label}</dt>
                <dd className="text-ink font-medium text-right tracking-tight">
                  {d.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* Proposal status — only for facilities with structured proposal
            data. Every sub-section is conditional; nothing empty renders. */}
        {facility.proposal &&
          (facility.proposal.process?.length ||
            facility.proposal.nextDecision ||
            facility.proposal.powerSource ||
            facility.proposal.waterSource ||
            facility.proposal.opposition?.length ||
            facility.proposal.requirements?.length) && (
            <section className="flex flex-col gap-4 py-4 border-t border-black/[.06]">
              <h3 className="text-[11px] font-medium tracking-tight text-muted">
                Proposal status
              </h3>

              {facility.proposal.process && facility.proposal.process.length > 0 && (
                <ProposalProgress
                  process={facility.proposal.process}
                  variant="full"
                />
              )}

              {facility.proposal.nextDecision && (
                <div>
                  <div className="text-[11px] text-muted mb-1">Next decision</div>
                  <div className="text-[13px] text-ink tracking-tight leading-snug">
                    {facility.proposal.nextDecision.what}
                  </div>
                  <div className="text-[11.5px] text-muted mt-0.5">
                    {facility.proposal.nextDecision.body}
                    {facility.proposal.nextDecision.date && (
                      <>
                        <span aria-hidden>{" · "}</span>
                        {facility.proposal.nextDecision.date}
                      </>
                    )}
                  </div>
                </div>
              )}

              {(facility.proposal.powerSource || facility.proposal.waterSource) && (
                <dl className="flex flex-col">
                  {facility.proposal.powerSource && (
                    <div className="flex items-start justify-between gap-4 py-2 text-[13px] border-t border-black/[.04] first:border-t-0">
                      <dt className="text-muted flex-shrink-0">Power</dt>
                      <dd className="text-ink text-right tracking-tight">
                        {facility.proposal.powerSource}
                      </dd>
                    </div>
                  )}
                  {facility.proposal.waterSource && (
                    <div className="flex items-start justify-between gap-4 py-2 text-[13px] border-t border-black/[.04]">
                      <dt className="text-muted flex-shrink-0">Water</dt>
                      <dd className="text-ink text-right tracking-tight">
                        {facility.proposal.waterSource}
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {facility.proposal.requirements &&
                facility.proposal.requirements.length > 0 && (
                  <div>
                    <div className="text-[11px] text-muted mb-1.5">
                      Still to clear
                    </div>
                    <ul className="flex flex-col gap-1">
                      {facility.proposal.requirements.map((r, i) => (
                        <li
                          key={i}
                          className="text-[13px] text-ink/85 leading-snug pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-1 before:h-1 before:rounded-full before:bg-black/30"
                        >
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {facility.proposal.opposition &&
                facility.proposal.opposition.length > 0 && (
                  <div>
                    <div className="text-[11px] text-muted mb-1.5">Opposition</div>
                    <ul className="flex flex-wrap gap-1.5">
                      {facility.proposal.opposition.map((o, i) => (
                        <li
                          key={i}
                          className="text-[11.5px] px-2 py-1 rounded-full bg-black/[.04] text-ink/80 tracking-tight"
                        >
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </section>
          )}

        {/* Issues dropdown — collapsible list of concern tags */}
        {facility.concerns && facility.concerns.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setIssuesOpen((o) => !o)}
              aria-expanded={issuesOpen}
              className="w-full flex items-center justify-between py-2 text-[13px] font-medium text-ink hover:text-ink/70 transition-colors"
            >
              <span>
                Issues{" "}
                <span className="text-muted font-normal">
                  ({facility.concerns.length})
                </span>
              </span>
              <span
                aria-hidden
                className="text-muted text-[11px] transition-transform"
                style={{
                  transform: issuesOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              >
                ▾
              </span>
            </button>
            {issuesOpen && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {facility.concerns.map((c) => (
                  <li
                    key={c}
                    className="text-[11.5px] px-2 py-1 rounded-full bg-black/[.04] text-ink/80 tracking-tight"
                  >
                    {prettyConcern(c)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Local actions — reverse link. County-level legislation
            mentioning this facility by operator or location. Kept tight
            to match the issues-list rhythm above: small header, stance
            dot + title, date + municipality as muted meta. */}
        {relatedActions.length > 0 && (
          <section className="flex flex-col gap-2 py-4 border-t border-black/[.06]">
            <h3 className="text-[11px] font-medium tracking-tight text-muted">
              Local actions
            </h3>
            <ul className="flex flex-col gap-2">
              {relatedActions.slice(0, 5).map((a, i) => {
                const stance = ACTION_STATUS_STANCE[a.status];
                const color = STANCE_HEX[stance];
                return (
                  <li
                    key={`${a.title}-${i}`}
                    className="flex items-start gap-2 text-[12px] leading-snug"
                  >
                    <span
                      className="mt-[6px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      {a.sourceUrl ? (
                        <a
                          href={a.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink/85 tracking-tight hover:text-ink hover:underline underline-offset-2 decoration-black/20"
                        >
                          {a.title}
                        </a>
                      ) : (
                        <div className="text-ink/85 tracking-tight">
                          {a.title}
                        </div>
                      )}
                      <div className="text-[11px] text-muted mt-0.5 tracking-tight">
                        {ACTION_STATUS_LABEL[a.status]}
                        <span aria-hidden> · </span>
                        {a.municipalityName}
                        {a.date && (
                          <>
                            <span aria-hidden> · </span>
                            {a.date}
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Source attribution — single muted line, not a badge */}
        <p className="text-[11px] text-muted/80">
          {facility.source === "epoch-ai"
            ? "Data from Epoch AI (CC-BY)"
            : "Sourced from public reporting"}
        </p>
      </div>
    </div>
  );
}
