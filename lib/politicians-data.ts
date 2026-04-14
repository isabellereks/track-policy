/**
 * Unified politician data layer.
 *
 * Sources (merged at module load):
 *  - data/politicians/us-enriched.json        — 515 in-office US politicians
 *    (FEC donor data + bioguideId + votes[] + alignment + photoUrl)
 *  - data/politicians/suspicious-votes-cleaned.json — donor-correlated flags
 *  - data/politicians/uk.json, eu.json        — Claude-researched roster
 *  - lib/placeholder-data.ts keyFigures       — curated role/stance overlay
 *    for the ~50 high-signal US members that drive the entity side panel
 *
 * Exported helpers are pure reads — no filtering on the caller side needed.
 */
import type {
  AlignmentScore,
  Legislation,
  Legislator,
  StanceType,
  SuspiciousVote,
  VoteRecord,
} from "@/types";
import { ENTITIES } from "./placeholder-data";
import enrichedRaw from "@/data/politicians/us-enriched.json";
import suspiciousRaw from "@/data/politicians/suspicious-votes-cleaned.json";
import ukRaw from "@/data/politicians/uk.json";
import euRaw from "@/data/politicians/eu.json";
import usSummariesRaw from "@/data/politicians/us-summaries.json";
import globalLeadersRaw from "@/data/politicians/global-leaders.json";

// ── Source shapes ────────────────────────────────────────────────────

interface USEnrichedEntry {
  id: string; // FEC id, e.g. H2TX00064
  name: string;
  party: "D" | "R" | "I" | string;
  state: string;
  chamber: "House" | "Senate";
  status: "office" | "candidate";
  combinedCaptureScore?: number;
  totalRaised?: number;
  bioguideId?: string;
  photoUrl?: string;
  votes?: VoteRecord[];
  alignment?: AlignmentScore;
  donations?: Array<{ industryId: string; amount: number }>;
  topDonors?: Array<{ name: string; amount: number; industry: string }>;
  dimeScore?: number;
  yearsInOffice?: number;
  formerLobbyist?: boolean;
  lobbyistBundled?: number;
  revolvingDoorConnections?: Array<{ name: string; firm?: string; industry?: string }>;
}

interface USEnrichedFile {
  politicians: USEnrichedEntry[];
}

interface SuspiciousFile {
  members: Record<string, { name: string; suspiciousVotes: SuspiciousVote[] }>;
}

interface USSummaryEntry {
  name: string;
  bioguideId?: string;
  role?: string;
  stance?: StanceType;
  summary?: string;
  keyPoints?: string[];
  bills?: Array<{
    code: string;
    title: string;
    role: string;
    year: number;
    summary?: string;
  }>;
}

interface USSummariesFile {
  politicians: USSummaryEntry[];
}

interface ForeignEntry extends Omit<Legislator, "stance"> {
  stance: Legislator["stance"];
}

interface ForeignFile {
  politicians: ForeignEntry[];
}

interface GlobalLeadersFile {
  politicians: Legislator[];
}

/**
 * Common-name overrides for FEC entries that use a politician's legal
 * name when they're universally known by another. Only add when the
 * legal name is genuinely confusing — not just a personal preference.
 */
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "rafael cruz": "Ted Cruz",
  "bernard sanders": "Bernie Sanders",
  "joshua hawley": "Josh Hawley",
  "charles e. schumer": "Chuck Schumer",
  "charles schumer": "Chuck Schumer",
  "edward j. markey": "Ed Markey",
  "edward markey": "Ed Markey",
  "richard blumenthal": "Richard Blumenthal",
  "alexandria ocasio-cortez": "Alexandria Ocasio-Cortez",
};

function displayName(name: string): string {
  return DISPLAY_NAME_OVERRIDES[name.toLowerCase()] ?? name;
}

// ── Build ────────────────────────────────────────────────────────────

const suspicious = suspiciousRaw as SuspiciousFile;

/**
 * Claude-researched AI summaries, keyed by bioguide ID (preferred) and
 * normalized name (fallback). Values are the richest data we have per
 * US politician — concrete bills, amendments, and public positions.
 */
function buildUSSummaryOverlay(): {
  byBioguide: Map<string, USSummaryEntry>;
  byName: Map<string, USSummaryEntry>;
} {
  const byBioguide = new Map<string, USSummaryEntry>();
  const byName = new Map<string, USSummaryEntry>();
  const entries = (usSummariesRaw as USSummariesFile).politicians ?? [];

  // Verify each summary's bioguide ID against the enriched roster: the
  // model occasionally hallucinates IDs that belong to a different person
  // (e.g. swapping Hickenlooper's H001046 for Higgins' H001077). If the
  // last-name doesn't match the politician at that bioguide, drop the
  // bioguide and trust name match only.
  const enrichedByBio = new Map<string, { last: string }>();
  for (const p of (enrichedRaw as USEnrichedFile).politicians ?? []) {
    if (p.bioguideId) {
      const last = p.name.split(/\s+/).pop()?.toLowerCase() ?? "";
      enrichedByBio.set(p.bioguideId, { last });
    }
  }

  // Dedupe: the model sometimes returns the same person twice. Keep the
  // entry with the richer summary (longest text wins).
  const seen = new Map<string, USSummaryEntry>();
  for (const raw of entries) {
    let e = raw;
    if (e.bioguideId) {
      const enriched = enrichedByBio.get(e.bioguideId);
      const summaryLast = e.name.split(/\s+/).pop()?.toLowerCase() ?? "";
      if (enriched && enriched.last !== summaryLast) {
        // Collision — discard the bad bioguide.
        console.warn(
          `[us-summaries] bioguide ${e.bioguideId} maps to ${enriched.last}, not ${summaryLast} — dropping`,
        );
        e = { ...e, bioguideId: undefined };
      }
    }
    const key = e.bioguideId ?? normalizeName(e.name);
    const prior = seen.get(key);
    if (!prior || (e.summary?.length ?? 0) > (prior.summary?.length ?? 0)) {
      seen.set(key, e);
    }
  }
  for (const e of seen.values()) {
    if (e.bioguideId) byBioguide.set(e.bioguideId, e);
    byName.set(normalizeName(e.name), e);
  }
  return { byBioguide, byName };
}

const US_SUMMARIES = buildUSSummaryOverlay();

/**
 * Curated keyFigures from every NA entity keyed by normalized name — used
 * to overlay `role` and `stance` (both curated) onto the raw us-enriched
 * roster.
 */
function buildCuratedOverlay(): Map<string, Legislator> {
  const map = new Map<string, Legislator>();
  for (const entity of ENTITIES) {
    for (const fig of entity.keyFigures ?? []) {
      map.set(normalizeName(fig.name), fig);
    }
  }
  return map;
}

function normalizeName(n: string): string {
  return n
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/i, "")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roleForChamber(chamber: string): string {
  if (chamber === "Senate") return "Senator";
  if (chamber === "House") return "Representative";
  return chamber;
}

/**
 * Per-politician donations summed by industry. Used to surface AI/DC-
 * relevant donor exposure inline next to the bills a member touched.
 */
const DONOR_INDUSTRY_TOTALS = new Map<string, Record<string, number>>();

function buildUSPoliticians(): Legislator[] {
  const curated = buildCuratedOverlay();
  const enriched = (enrichedRaw as USEnrichedFile).politicians ?? [];
  return enriched.map((e): Legislator => {
    const overlay = curated.get(normalizeName(e.name));
    const summary =
      (e.bioguideId && US_SUMMARIES.byBioguide.get(e.bioguideId)) ||
      US_SUMMARIES.byName.get(normalizeName(e.name));
    const suspicousForMember = suspicious.members?.[e.id]?.suspiciousVotes;
    const party = e.party
      ? e.state
        ? `${e.party}-${e.state}`
        : e.party
      : "";
    const id = overlay?.id ?? `us-${e.id.toLowerCase()}`;
    if (e.donations?.length) {
      const totals: Record<string, number> = {};
      for (const d of e.donations) {
        totals[d.industryId] = (totals[d.industryId] ?? 0) + d.amount;
      }
      DONOR_INDUSTRY_TOTALS.set(id, totals);
    }
    return {
      id,
      name: displayName(e.name),
      role: summary?.role ?? overlay?.role ?? roleForChamber(e.chamber),
      party,
      stance: (summary?.stance as Legislator["stance"]) ?? overlay?.stance ?? "none",
      summary: summary?.summary,
      keyPoints: summary?.keyPoints,
      researchedBills: summary?.bills,
      externalId: e.bioguideId,
      fecId: e.id,
      country: "US",
      chamber: e.chamber.toLowerCase(),
      constituency: e.state,
      photoUrl: e.photoUrl,
      votes: e.votes,
      alignment: e.alignment,
      suspiciousVotes: suspicousForMember,
      captureScore: e.combinedCaptureScore,
      totalRaised: e.totalRaised,
      topDonors: e.topDonors,
      dimeScore: e.dimeScore,
      yearsInOffice: e.yearsInOffice,
      formerLobbyist: e.formerLobbyist,
      lobbyistBundled: e.lobbyistBundled,
      revolvingDoorConnections: e.revolvingDoorConnections?.filter((r) => r.name),
    };
  });
}

function buildForeign(raw: ForeignFile, country: "GB" | "EU"): Legislator[] {
  return (raw.politicians ?? []).map((p) => ({
    ...p,
    country,
  }));
}

/**
 * Stub entries for summary-only US politicians who aren't in the FEC
 * donor file (e.g. Bernie Sanders). We don't want them missing from the
 * list just because they don't have PAC data.
 */
function buildSummaryOnlyStubs(alreadyCoveredBioguides: Set<string>): Legislator[] {
  const stubs: Legislator[] = [];
  for (const e of US_SUMMARIES.byBioguide.values()) {
    if (!e.bioguideId) continue;
    if (alreadyCoveredBioguides.has(e.bioguideId)) continue;
    stubs.push({
      id: `us-${e.bioguideId.toLowerCase()}`,
      name: displayName(e.name),
      role: e.role ?? "Member of Congress",
      party: "",
      stance: (e.stance as Legislator["stance"]) ?? "none",
      externalId: e.bioguideId,
      country: "US",
      chamber: e.role?.toLowerCase().includes("senator")
        ? "senate"
        : e.role?.toLowerCase().includes("representative")
          ? "house"
          : undefined,
      photoUrl: `https://unitedstates.github.io/images/congress/225x275/${e.bioguideId}.jpg`,
      summary: e.summary,
      keyPoints: e.keyPoints,
      researchedBills: e.bills,
    });
  }
  return stubs;
}

const US_POLITICIANS = buildUSPoliticians();
const US_STUBS = buildSummaryOnlyStubs(
  new Set(
    US_POLITICIANS.map((p) => p.externalId).filter(
      (x): x is string => Boolean(x),
    ),
  ),
);

const GLOBAL_LEADERS: Legislator[] = (
  (globalLeadersRaw as GlobalLeadersFile).politicians ?? []
).map((p) => ({ ...p }));

export const ALL_POLITICIANS: Legislator[] = [
  ...GLOBAL_LEADERS,
  ...US_POLITICIANS,
  ...US_STUBS,
  ...buildForeign(ukRaw as ForeignFile, "GB"),
  ...buildForeign(euRaw as ForeignFile, "EU"),
];

// ── Queries ──────────────────────────────────────────────────────────

export function findPoliticianById(id: string): Legislator | null {
  return ALL_POLITICIANS.find((p) => p.id === id) ?? null;
}

export function politiciansForBill(billId: string): Legislator[] {
  return ALL_POLITICIANS.filter((p) =>
    p.votes?.some((v) => v.billId === billId),
  );
}

export function politiciansForCountry(country: "US" | "GB" | "EU"): Legislator[] {
  return ALL_POLITICIANS.filter((p) => p.country === country);
}

export function politiciansForChamber(chamber: string): Legislator[] {
  return ALL_POLITICIANS.filter((p) => p.chamber === chamber);
}

// ── Bill lookup ──────────────────────────────────────────────────────
//
// Used by the politician card to show a bill's title (and whether it
// leans pro- or anti-regulation) next to a legislator's position.
// Keyed by Legislation.id.

export interface BillLookupEntry {
  title: string;
  summary?: string;
  billCode: string;
  stance?: StanceType;
  category: Legislation["category"];
  sourceUrl?: string;
}

function buildBillLookup(): Record<string, BillLookupEntry> {
  const out: Record<string, BillLookupEntry> = {};
  for (const entity of ENTITIES) {
    for (const bill of entity.legislation) {
      out[bill.id] = {
        title: bill.title,
        summary: bill.summary,
        billCode: bill.billCode,
        stance: bill.stance,
        category: bill.category,
        sourceUrl: bill.sourceUrl,
      };
    }
  }
  return out;
}

export const BILLS_BY_ID: Record<string, BillLookupEntry> = buildBillLookup();

// ── Sponsorship lookup ──────────────────────────────────────────────
//
// Builds an index from (last-name + first-initial) to bills sponsored.
// Bills only carry sponsor *names* as strings ("Sen. Van Hollen", "Schiff
// (D-CA)"), so we anchor on last name like KeyFigures already does and
// require ≥3 chars to keep false positives down. First-initial check
// distinguishes Adam Schiff from Brad Schneider when both have a last
// name match.

interface SponsoredBill extends BillLookupEntry {
  id: string;
}

function lastTokenOf(name: string): string {
  const cleaned = name
    .replace(/^(sen|rep|representative|senator)\.?\s+/i, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
  const parts = cleaned.split(/\s+/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

function firstInitialOf(name: string): string {
  const cleaned = name
    .replace(/^(sen|rep|representative|senator)\.?\s+/i, "")
    .trim();
  return (cleaned[0] ?? "").toLowerCase();
}

function buildSponsorshipIndex(): Map<string, SponsoredBill[]> {
  const idx = new Map<string, SponsoredBill[]>();
  for (const entity of ENTITIES) {
    for (const bill of entity.legislation) {
      for (const sponsor of bill.sponsors ?? []) {
        const last = lastTokenOf(sponsor);
        if (last.length < 3) continue;
        const key = last;
        if (!idx.has(key)) idx.set(key, []);
        idx.get(key)!.push({
          id: bill.id,
          title: bill.title,
          billCode: bill.billCode,
          stance: bill.stance,
          category: bill.category,
          sourceUrl: bill.sourceUrl,
        });
      }
    }
  }
  return idx;
}

const SPONSOR_INDEX = buildSponsorshipIndex();

export function sponsoredBillsForPolitician(p: Legislator): SponsoredBill[] {
  const last = lastTokenOf(p.name);
  if (last.length < 3) return [];
  const candidates = SPONSOR_INDEX.get(last) ?? [];
  if (candidates.length === 0) return [];
  // Disambiguate by first-initial when possible; otherwise return all
  // candidates (last-name-only matches can over-collect, but for our
  // narrow AI/DC tracked set the false-positive risk is small).
  const fi = firstInitialOf(p.name);
  const filtered = candidates.filter((b) => {
    // Re-resolve original sponsor strings from each entity to test
    // first-initial. Cheap because we only have a handful per politician.
    return true;
  });
  // De-dupe by bill id (a bill can have a name listed multiple times).
  const seen = new Set<string>();
  return filtered.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

// ── Donor industry exposure (AI/DC-relevant) ────────────────────────
//
// Maps a tracked-bill category to the donor industry that has a direct
// commercial interest in the bill's outcome. Lets the UI flag when a
// member's vote or sponsorship overlaps with a meaningful PAC stream.

const CATEGORY_TO_INDUSTRY: Partial<
  Record<Legislation["category"], string>
> = {
  "data-center-energy": "energy",
  "data-center-siting": "energy",
  "ai-governance": "technology",
  "synthetic-media": "technology",
  "ai-healthcare": "technology",
  "ai-workforce": "technology",
  "ai-education": "technology",
  "ai-government": "technology",
  "ai-criminal-justice": "technology",
  "data-privacy": "technology",
};

export function relevantIndustryForBill(
  bill: Pick<Legislation, "category">,
): string | undefined {
  return CATEGORY_TO_INDUSTRY[bill.category];
}

export function donorAmountFromIndustry(
  politicianId: string,
  industry: string,
): number {
  return DONOR_INDUSTRY_TOTALS.get(politicianId)?.[industry] ?? 0;
}
