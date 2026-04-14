"use client";

import { useState } from "react";
import Image from "next/image";
import type {
  Legislator,
  StanceType,
  VoteRecord,
  VotePosition,
} from "@/types";
import {
  BILLS_BY_ID,
  donorAmountFromIndustry,
  relevantIndustryForBill,
  sponsoredBillsForPolitician,
  type BillLookupEntry,
} from "@/lib/politicians-data";

interface Props {
  politician: Legislator;
  defaultOpen?: boolean;
}

export default function PoliticianCard({ politician: p, defaultOpen }: Props) {
  const [isOpen, setOpen] = useState(Boolean(defaultOpen));
  const stance = p.stance ?? "none";
  const story = STANCE_STORY[stance];
  const sponsored = p.country === "US" ? sponsoredBillsForPolitician(p) : [];
  const inferred = inferStanceFromBills(sponsored);
  const aiRole = extractRoleChip(p.role);

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={isOpen}
      aria-controls={`pol-${p.id}`}
      className={`w-full text-left rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isOpen
          ? "bg-white shadow-[0_6px_20px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)]"
          : "bg-bg/60 hover:bg-white hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.04),0_1px_4px_rgba(0,0,0,0.03)]"
      }`}
    >
      {/* Header — always visible */}
      <div className="flex items-start gap-4 p-5">
        <Avatar name={p.name} photoUrl={p.photoUrl} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-ink tracking-tight leading-tight">
            {p.name}
          </div>
          <div className="text-xs text-muted mt-1 leading-snug">
            {formatHeaderMeta(p)}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {aiRole ? (
              <StanceTag story={story} label={aiRole} tone="stated" />
            ) : stance !== "none" ? (
              // No concrete role to pin to — render the dot alone with
              // a tooltip carrying the meaning. Better silent than vague.
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                title={`${story.chip} — ${story.line}`}
                aria-label={story.chip}
                style={{ background: `var(--color-stance-${stance})` }}
              />
            ) : null}
            {inferred &&
              inferred.stance !== stance &&
              inferred.stance !== "review" &&
              inferred.stance !== "none" && (
                <StanceTag
                  story={STANCE_STORY[inferred.stance]}
                  label={STANCE_STORY[inferred.stance].chip}
                  tone="inferred"
                  hint={`from ${inferred.count} sponsored bills`}
                />
              )}
          </div>
        </div>
        <Chevron open={isOpen} />
      </div>

      {/* Expand — keep <Expanded> mounted so the grid-row collapse has
          something to animate against on close. */}
      <div
        id={`pol-${p.id}`}
        className="grid transition-[grid-template-rows] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div
          className={`overflow-hidden transition-opacity duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isOpen ? "opacity-100 delay-100" : "opacity-0"
          }`}
          aria-hidden={!isOpen}
        >
          <Expanded p={p} />
        </div>
      </div>
    </button>
  );
}

// ── Header helpers ───────────────────────────────────────────────────

function formatHeaderMeta(p: Legislator): React.ReactNode {
  // "Senator · Majority Leader · R-SD"  (US)
  // "MEP · AI Act Rapporteur · S&D · Italy"  (EU, national party hidden)
  const parts: string[] = [p.role];
  if (p.party && p.party.trim() && p.party.trim() !== "—") parts.push(p.party);
  if (p.constituency && p.country !== "US") parts.push(p.constituency);
  return parts.join(" · ");
}

function Avatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  const [errored, setErrored] = useState(false);
  if (photoUrl && !errored) {
    return (
      <Image
        src={photoUrl}
        alt=""
        width={44}
        height={44}
        className="w-11 h-11 rounded-full object-cover flex-shrink-0 bg-black/[.04]"
        unoptimized
        onError={() => setErrored(true)}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <div className="w-11 h-11 rounded-full bg-black/[.04] flex items-center justify-center text-[13px] font-medium text-muted flex-shrink-0">
      {initials}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={`flex-shrink-0 mt-2 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M3 4.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Stance narrative ─────────────────────────────────────────────────

function StanceTag({
  story,
  label,
  tone,
  hint,
}: {
  story: { chip: string; dot: string };
  label: string;
  tone: "stated" | "inferred";
  hint?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${story.dot}`} aria-hidden />
      <span className="text-[11px] text-ink">{label}</span>
      {tone === "inferred" && (
        <span className="text-[11px] text-muted">
          · inferred{hint ? ` ${hint}` : ""}
        </span>
      )}
    </span>
  );
}

/**
 * Guess a legislator's AI/DC stance from their sponsored bills. Useful
 * when the stated stance is "none" (uncurated) — authorship is usually
 * the cleanest positional signal we have. Returns null when sponsorships
 * don't lean clearly in one direction.
 */
function inferStanceFromBills(
  bills: Array<{ stance?: StanceType }>,
): { stance: StanceType; count: number } | null {
  if (bills.length < 2) return null;
  const tally: Partial<Record<StanceType, number>> = {};
  for (const b of bills) {
    if (!b.stance || b.stance === "none") continue;
    tally[b.stance] = (tally[b.stance] ?? 0) + 1;
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1]! - a[1]!);
  if (ranked.length === 0) return null;
  const [topStance, topCount] = ranked[0];
  // Require at least half of classified bills + 2 minimum before we
  // claim a direction; otherwise the signal is too thin.
  const total = Object.values(tally).reduce((n, v) => n + (v ?? 0), 0);
  if ((topCount as number) < 2 || (topCount as number) / total < 0.5) return null;
  return { stance: topStance as StanceType, count: topCount as number };
}


const STANCE_STORY: Record<StanceType, { chip: string; line: string; dot: string }> = {
  restrictive: {
    chip: "Pushing for tighter AI rules",
    line: "Pushes for stricter guardrails on AI and data-centre development.",
    dot: "bg-stance-restrictive",
  },
  concerning: {
    chip: "Flagging AI risks",
    line: "Publicly raises risks in AI or data-centre policy, stops short of a ban.",
    dot: "bg-stance-concerning",
  },
  review: {
    chip: "Shaping AI policy",
    line: "Actively shaping AI and data-centre policy across party lines rather than taking a hard for/against position.",
    dot: "bg-stance-review",
  },
  favorable: {
    chip: "Innovation-first on AI",
    line: "Favours letting AI and data-centre industries expand with light-touch oversight.",
    dot: "bg-stance-favorable",
  },
  none: {
    chip: "No public AI position",
    line: "No public record of a stated position on AI or data-centre policy.",
    dot: "bg-stance-none",
  },
};

/**
 * Pick the most descriptive segment of a politician's role string for the
 * stance chip. Prefer AI-specific titles, then committee leadership, then
 * committee membership. Falls back to null when nothing concrete exists —
 * caller should drop the text and just show the colored dot rather than
 * surfacing a vague label like "Shaping AI policy".
 */
const AI_KEYWORDS = /(ai|artificial intelligence|deepfake|data centre|data center)/i;
const LEADERSHIP_KEYWORDS =
  /(chair|co-chair|vice chair|ranking member|founder|rapporteur|leader|speaker|whip|host|sponsor)/i;
const COMMITTEE_KEYWORDS =
  /(committee|caucus|task force|working group|subcommittee|forum)/i;

function extractRoleChip(role?: string): string | null {
  if (!role) return null;
  const segments = role
    .split(/\s*·\s*/)
    .map((s) => s.replace(/\s*\([^)]*\)\s*$/, "").trim())
    // Skip the title prefix ("Senator (D-VT)", "Representative (D-NY-14)").
    .filter((s) => !/^(senator|representative|mp|mep)\b/i.test(s));

  // Tier 1: AI-named roles with a leadership word ("AI Task Force Co-Chair").
  for (const seg of segments) {
    if (AI_KEYWORDS.test(seg) && LEADERSHIP_KEYWORDS.test(seg)) return seg;
  }
  // Tier 2: any AI-named segment ("AI Working Group member", "AI Caucus").
  for (const seg of segments) {
    if (AI_KEYWORDS.test(seg)) return seg;
  }
  // Tier 3: leadership in a relevant committee ("Senate Commerce Chair").
  for (const seg of segments) {
    if (LEADERSHIP_KEYWORDS.test(seg) && COMMITTEE_KEYWORDS.test(seg)) return seg;
  }
  // Tier 4: any leadership title ("Senate Minority Leader").
  for (const seg of segments) {
    if (LEADERSHIP_KEYWORDS.test(seg)) return seg;
  }
  // Tier 5: any committee/caucus segment ("Senate Commerce Committee").
  for (const seg of segments) {
    if (COMMITTEE_KEYWORDS.test(seg)) return seg;
  }
  return null;
}

function positionLabel(pos: VotePosition): string {
  if (pos === "not-voting") return "Did not vote";
  return pos[0].toUpperCase() + pos.slice(1);
}

function positionColor(pos: VotePosition): string {
  if (pos === "yea") return "text-stance-favorable";
  if (pos === "nay") return "text-stance-restrictive";
  return "text-muted";
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function formatVoteDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${day}, ${y}`;
}

function trimToSentences(text: string, max: number): string {
  // Match the first `max` sentence-ending punctuation marks. Keeps
  // everything up to and including the Nth period/question/exclamation.
  const matches = text.match(/[^.!?]+[.!?]/g);
  if (!matches || matches.length <= max) return text.trim();
  return matches.slice(0, max).join("").trim();
}

function shortenPacName(name: string): string {
  // PAC names from FEC data are noisy: "X POLITICAL ACTION COMMITTEE (ALIAS)".
  // The organisation name is whatever's before the first occurrence of
  // "POLITICAL ACTION COMMITTEE", "PAC", or a slash/semicolon continuation.
  const cut = name.match(
    /^(.*?)(?:\s+(?:political action committee|pac)\b|[/;])/i,
  );
  let s = (cut ? cut[1] : name).trim();
  s = s.replace(/[,.\s]+$/g, "");
  return s
    .split(/\s+/)
    .map((w) => {
      if (w.length <= 3) return w;
      if (/^[A-Z]+$/.test(w)) return w[0] + w.slice(1).toLowerCase();
      return w;
    })
    .join(" ");
}

// ── Vote & sponsor rows ─────────────────────────────────────────────

function BillRow({
  billCode,
  title,
  summary,
  metaLeft,
  rightTag,
  rightTagColor,
  sourceUrl,
}: {
  billCode: string;
  title: string;
  summary?: string;
  metaLeft?: string;
  rightTag?: string;
  rightTagColor?: string;
  sourceUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasExpand = Boolean(summary);
  return (
    <li className="border-b border-hairline/60 last:border-0">
      <div
        role={hasExpand ? "button" : undefined}
        tabIndex={hasExpand ? 0 : undefined}
        onClick={(e) => {
          if (!hasExpand) return;
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (!hasExpand) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen((o) => !o);
          }
        }}
        className={`flex items-start gap-4 py-3 ${hasExpand ? "cursor-pointer" : ""}`}
        aria-expanded={hasExpand ? open : undefined}
      >
        <span className="text-[11px] font-medium text-ink tracking-tight shrink-0 w-16 pt-[2px] tabular-nums">
          {billCode}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm text-ink leading-snug ${open ? "" : "truncate"}`} title={title}>
            {title}
          </p>
          {metaLeft && (
            <p className="text-[11px] text-muted mt-0.5 truncate">{metaLeft}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0 min-w-[60px]">
          {rightTag && (
            <span className={`text-[11px] font-medium ${rightTagColor ?? "text-muted"}`}>
              {rightTag}
            </span>
          )}
          {hasExpand && (
            <span className="text-[11px] text-muted">
              {open ? "Hide" : "What's this?"}
            </span>
          )}
        </div>
      </div>
      {open && summary && (
        <div className="pb-3 pl-[80px] pr-2 flex flex-col gap-2">
          <p className="text-[13px] text-ink/80 leading-[1.55] max-w-prose">
            {summary}
          </p>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="self-start text-[11px] text-muted hover:text-ink"
            >
              Read full bill →
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function billRoleLabel(role: string): { label: string; color: string } {
  const r = role.toLowerCase();
  if (r === "sponsor") return { label: "Sponsor", color: "text-ink" };
  if (r === "cosponsor") return { label: "Co-sponsor", color: "text-muted" };
  if (r === "champion") return { label: "Champion", color: "text-stance-restrictive" };
  if (r === "vote-yea") return { label: "Voted Yea", color: "text-stance-favorable" };
  if (r === "vote-nay") return { label: "Voted Nay", color: "text-stance-restrictive" };
  return { label: role, color: "text-muted" };
}

function ResearchedBillRow({
  bill,
}: {
  bill: { code: string; title: string; role: string; year: number; summary?: string };
}) {
  const tag = billRoleLabel(bill.role);
  return (
    <BillRow
      billCode={bill.code}
      title={bill.title}
      summary={bill.summary}
      metaLeft={String(bill.year)}
      rightTag={tag.label}
      rightTagColor={tag.color}
    />
  );
}

function VoteRow({ v, politicianId }: { v: VoteRecord; politicianId: string }) {
  const bill = BILLS_BY_ID[v.billId];
  const title = bill?.title ?? v.billCode;
  const industry = bill ? relevantIndustryForBill(bill) : undefined;
  const donorAmount = industry
    ? donorAmountFromIndustry(politicianId, industry)
    : 0;
  const meta = [
    formatVoteDate(v.voteDate),
    donorAmount > 0 ? `${formatMoney(donorAmount)} from ${industry}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <BillRow
      billCode={v.billCode}
      title={title}
      metaLeft={meta}
      rightTag={positionLabel(v.position)}
      rightTagColor={positionColor(v.position)}
      sourceUrl={v.sourceUrl}
    />
  );
}

function SponsorRow({
  bill,
  politicianId,
}: {
  bill: BillLookupEntry & { id: string };
  politicianId: string;
}) {
  const industry = relevantIndustryForBill(bill);
  const donorAmount = industry
    ? donorAmountFromIndustry(politicianId, industry)
    : 0;
  const meta = donorAmount > 0 ? `${formatMoney(donorAmount)} from ${industry}` : undefined;
  return (
    <BillRow
      billCode={bill.billCode}
      title={bill.title}
      summary={bill.summary}
      metaLeft={meta}
      rightTag={bill.stance && bill.stance !== "none" ? stanceShort(bill.stance) : undefined}
      sourceUrl={bill.sourceUrl}
    />
  );
}

function stanceShort(stance: StanceType): string {
  if (stance === "favorable") return "Pro-industry";
  if (stance === "restrictive") return "Pro-regulation";
  if (stance === "concerning") return "Mixed";
  if (stance === "review") return "In review";
  return "";
}

// ── DIME ideology spectrum ──────────────────────────────────────────

function dimeLabel(score: number): string {
  if (score <= -1) return "Strongly liberal";
  if (score < -0.3) return "Liberal";
  if (score <= 0.3) return "Centrist";
  if (score < 1) return "Conservative";
  return "Strongly conservative";
}

function DimeSpectrum({ score }: { score: number }) {
  const clamped = Math.max(-2, Math.min(2, score));
  const pct = ((clamped + 2) / 4) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[11px] text-muted">
        <span>Liberal</span>
        <span>Centrist</span>
        <span>Conservative</span>
      </div>
      <div className="relative h-1 rounded-full bg-black/[.06]">
        <div
          className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-ink -translate-y-1/2 -translate-x-1/2 ring-2 ring-white"
          style={{ left: `${pct}%` }}
          aria-label={`DIME ${score.toFixed(2)} — ${dimeLabel(score)}`}
        />
      </div>
      <div className="text-[11px] text-muted leading-snug">
        {dimeLabel(score)} ({score > 0 ? "+" : ""}
        {score.toFixed(2)}). Based on the DIME score — who gives them
        money across all campaigns, mapped to a liberal-to-conservative axis.
      </div>
    </div>
  );
}

function AISparkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className="text-[#B8893E]"
    >
      <path
        d="M7 0.5L8.3 5.2L13 6.5L8.3 7.8L7 12.5L5.7 7.8L1 6.5L5.7 5.2L7 0.5Z"
        fill="currentColor"
      />
      <path
        d="M11.5 9L11.9 10.4L13.3 10.8L11.9 11.2L11.5 12.6L11.1 11.2L9.7 10.8L11.1 10.4L11.5 9Z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}

// ── Expanded sections ───────────────────────────────────────────────

function Expanded({ p }: { p: Legislator }) {
  const stance = p.stance ?? "none";
  const story = STANCE_STORY[stance];
  const sponsored = p.country === "US" ? sponsoredBillsForPolitician(p) : [];
  const inferred = inferStanceFromBills(sponsored);
  const hasVotes = (p.votes?.length ?? 0) > 0;
  const hasSponsored = sponsored.length > 0;
  const flagged = p.alignment?.flaggedVotes ?? [];
  const keyPoints = p.keyPoints ?? [];

  return (
    <div className="px-5 pb-5 pt-1 flex flex-col gap-7 border-t border-hairline">
      {/* AI overview — priority reading */}
      <section className="pt-5">
        <div className="rounded-2xl bg-gradient-to-br from-[#FFF8EC] to-[#FFF4E0] border border-[#EAD9B2]/40 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AISparkIcon />
            <span className="text-[11px] font-medium text-[#8B6914] tracking-tight">
              AI overview
            </span>
          </div>
          <p className="text-[15px] leading-[1.55] text-ink max-w-prose">
            {trimToSentences(p.summary ?? story.line, 2)}
          </p>
          {inferred && inferred.stance !== stance && (
            <p className="mt-3 text-sm text-ink/75 leading-snug max-w-prose">
              Their sponsored record leans{" "}
              <span className="text-ink font-medium">
                {STANCE_STORY[inferred.stance].chip.toLowerCase()}
              </span>
              {` — ${inferred.count} of ${sponsored.length} bills push in that direction.`}
            </p>
          )}
          {keyPoints.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {keyPoints.map((pt, i) => (
                <li key={i} className="flex gap-3 text-sm text-ink/85 leading-snug">
                  <span className="mt-[.6em] w-1 h-1 rounded-full bg-[#B8893E] shrink-0" aria-hidden />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Bills — prefer researched bills (richer + all mentioned in
          summary), fall back to formally-tracked sponsorships. */}
      {(p.researchedBills?.length ?? 0) > 0 ? (
        <Section title={`Bills they've worked on (${p.researchedBills!.length})`}>
          <ul className="flex flex-col">
            {p.researchedBills!.map((b, i) => (
              <ResearchedBillRow key={`${b.code}-${i}`} bill={b} />
            ))}
          </ul>
        </Section>
      ) : hasSponsored ? (
        <Section title="Sponsored">
          <ul className="flex flex-col">
            {sponsored.map((b) => (
              <SponsorRow key={b.id} bill={b} politicianId={p.id} />
            ))}
          </ul>
        </Section>
      ) : null}

      {hasVotes && (
        <Section
          title="Recorded votes"
          subtitle={
            p.alignment
              ? `${p.alignment.alignedVotes} of ${p.alignment.totalVotes} line up with their stance.`
              : undefined
          }
        >
          <ul className="flex flex-col">
            {p.votes!.map((v, i) => (
              <VoteRow key={`${v.billId}-${i}`} v={v} politicianId={p.id} />
            ))}
          </ul>
        </Section>
      )}

      {flagged.length > 0 && (
        <Section title="Votes that clash with their stance">
          <ul className="flex flex-col gap-1">
            {flagged.map((f, i) => (
              <li
                key={`${f.billId}-${i}`}
                className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-baseline py-2"
              >
                <span className="text-[11px] font-medium text-ink">{f.billCode}</span>
                <span className="text-[11px] text-muted">{f.reason}</span>
                <span className="text-[11px] text-muted">
                  Expected {positionLabel(f.expectedPosition)} · voted {positionLabel(f.actualPosition)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Donors — relevant only */}
      {(() => {
        const donors = p.topDonors ?? [];
        const relevant = donors.filter(
          (d) => d.industry === "technology" || d.industry === "energy",
        );
        if (relevant.length === 0) return null;
        const otherTotal = donors
          .filter((d) => d.industry !== "technology" && d.industry !== "energy")
          .reduce((n, d) => n + d.amount, 0);
        return (
          <Section title="Donors relevant to AI & data centres">
            <ul className="flex flex-col">
              {relevant.slice(0, 6).map((d, i) => (
                <li
                  key={`${d.name}-${i}`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 items-baseline py-2.5 border-b border-hairline/60 last:border-0"
                >
                  <span className="text-sm text-ink truncate" title={d.name}>
                    {shortenPacName(d.name)}
                  </span>
                  <span className="text-sm text-ink tabular-nums">
                    {formatMoney(d.amount)}
                  </span>
                  <span className="text-[11px] text-stance-concerning">
                    {d.industry}
                  </span>
                </li>
              ))}
            </ul>
            {otherTotal > 0 && (
              <p className="text-[11px] text-muted mt-2">
                + {formatMoney(otherTotal)} from other industries (finance,
                healthcare, labour, etc.).
              </p>
            )}
          </Section>
        );
      })()}

      {/* Numbers */}
      <NumberStrip p={p} />

      {/* Ideology — skip when dimeScore is exactly 0, which in this
          dataset usually means "not in the DIME database" rather than
          genuinely centrist. */}
      {p.dimeScore != null && Math.abs(p.dimeScore) >= 0.05 && (
        <Section title="Ideology">
          <DimeSpectrum score={p.dimeScore} />
        </Section>
      )}

      {/* Revolving door */}
      {(p.formerLobbyist || (p.revolvingDoorConnections?.length ?? 0) > 0) && (
        <Section title="Revolving door">
          <ul className="flex flex-col gap-1 text-sm text-ink/85 leading-snug">
            {p.formerLobbyist && (
              <li>Worked as a registered lobbyist before holding office.</li>
            )}
            {(p.revolvingDoorConnections ?? []).map((c, i) => (
              <li key={`${c.name}-${i}`}>
                {c.name}
                {c.firm && <span className="text-muted"> · {c.firm}</span>}
                {c.industry && <span className="text-muted"> · {c.industry}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!hasVotes && !hasSponsored && stance === "none" && !p.summary && (
        <p className="text-sm text-muted leading-snug max-w-prose">
          No public stance, sponsored bills, or recorded floor votes on AI
          or data-centre policy on file. Most members of Congress sit
          outside the few committees that have actively legislated on
          these topics.
        </p>
      )}
    </div>
  );
}

function NumberStrip({ p }: { p: Legislator }) {
  const items: Array<{ label: string; value: string; sub?: string }> = [];
  if (p.totalRaised != null && p.totalRaised > 0)
    items.push({ label: "Raised", value: formatMoney(p.totalRaised) });
  if (p.captureScore != null)
    items.push({
      label: "Donor capture",
      value: `${Math.round(p.captureScore)}/100`,
      sub:
        p.captureScore >= 66
          ? "High — votes often follow donors"
          : p.captureScore >= 33
            ? "Moderate"
            : "Low — record tracks weakly with donors",
    });
  if ((p.yearsInOffice ?? 0) > 0)
    items.push({ label: "In office", value: `${p.yearsInOffice}y` });
  if ((p.lobbyistBundled ?? 0) > 0)
    items.push({
      label: "Lobbyist-bundled",
      value: formatMoney(p.lobbyistBundled!),
    });
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-6 border-y border-hairline py-4">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col">
          <span className="text-[11px] text-muted">{it.label}</span>
          <span className="text-lg font-medium text-ink tracking-tight mt-0.5 tabular-nums">
            {it.value}
          </span>
          {it.sub && (
            <span className="text-[11px] text-muted leading-snug mt-0.5">
              {it.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h3 className="text-xs font-medium text-muted tracking-tight">
          {title}
        </h3>
        {subtitle && <span className="text-[11px] text-muted">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}
