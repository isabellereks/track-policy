"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Legislator } from "@/types";
import PoliticianCard from "@/components/politicians/PoliticianCard";
import PoliticianFilters, {
  type FilterState,
  type SortKey,
} from "@/components/politicians/PoliticianFilters";

export default function PoliticiansClient({ all }: { all: Legislator[] }) {
  const params = useSearchParams();
  const billFilter = params.get("bill");
  const focusedId = params.get("id");

  // Default to US — most readers are American and the dataset has the
  // densest coverage there. Other countries surface their own parties
  // when picked.
  const initialCountry = (params.get("country") as FilterState["country"]) ?? "US";
  const initialChamber = params.get("chamber") ?? "all";
  const initialParty = params.get("party") ?? "all";
  const initialSort = (params.get("sort") as SortKey) ?? "relevance";

  const [state, setState] = useState<FilterState>({
    country: initialCountry,
    chamber: initialChamber,
    party: initialParty,
    sort: initialSort,
    search: "",
  });

  const PAGE = 75;
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [state, billFilter]);

  const filtered = useMemo(() => {
    let list = all;
    if (billFilter) {
      list = list.filter((p) => p.votes?.some((v) => v.billId === billFilter));
    }
    if (state.country !== "all") list = list.filter((p) => p.country === state.country);
    if (state.chamber !== "all") list = list.filter((p) => p.chamber === state.chamber);
    if (state.party !== "all") list = list.filter((p) => partyKey(p.party) === state.party);
    if (state.search.trim()) {
      list = list.filter((p) => matchesQuery(p, state.search));
    }

    const sorted = [...list].sort((a, b) => {
      switch (state.sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "votes":
          return (b.votes?.length ?? 0) - (a.votes?.length ?? 0);
        case "capture":
          return (b.captureScore ?? -1) - (a.captureScore ?? -1);
        case "alignment": {
          const aHas = a.alignment ? 1 : 0;
          const bHas = b.alignment ? 1 : 0;
          if (aHas !== bHas) return bHas - aHas;
          return (b.alignment?.score ?? 0) - (a.alignment?.score ?? 0);
        }
        case "relevance":
        default: {
          const diff = relevanceScore(b) - relevanceScore(a);
          if (diff) return diff;
          return a.name.localeCompare(b.name);
        }
      }
    });
    return sorted;
  }, [all, state, billFilter]);

  // Deep links via ?id=… should always land on the target card, even
  // when it sits beyond the current page.
  useEffect(() => {
    if (!focusedId) return;
    const idx = filtered.findIndex((p) => p.id === focusedId);
    if (idx >= visible) {
      setVisible(Math.ceil((idx + 1) / PAGE) * PAGE);
    }
  }, [focusedId, filtered, visible]);

  return (
    <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-10">
      <aside className="sticky top-20 self-start flex flex-col gap-4 rounded-2xl bg-white/90 backdrop-blur-2xl border border-black/[.04] shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] p-5">
        {billFilter && (
          <div className="rounded-xl bg-stance-concerning/10 p-3 text-[11px] leading-snug">
            <div className="font-medium text-ink">Filtered by bill</div>
            <div className="text-muted">{billFilter}</div>
          </div>
        )}
        <PoliticianFilters all={all} state={state} onChange={setState} />
      </aside>

      <div className="flex flex-col gap-3">
        <div className="text-xs text-muted">
          {filtered.length === 0
            ? "No politicians match these filters"
            : `Showing ${Math.min(visible, filtered.length)} of ${filtered.length}`}
        </div>
        {filtered.slice(0, visible).map((p) => (
          <PoliticianCard key={p.id} politician={p} defaultOpen={p.id === focusedId} />
        ))}
        {visible < filtered.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="self-center mt-2 text-xs text-muted hover:text-ink px-4 py-2 rounded-full bg-black/[.04] hover:bg-black/[.08] transition-colors"
          >
            Show {Math.min(PAGE, filtered.length - visible)} more
          </button>
        )}
      </div>
    </div>
  );
}

function partyKey(party: string): string {
  const m = party.match(/^([DRI])-[A-Z]{2}$/);
  return m ? m[1] : party;
}

// ── Search ─────────────────────────────────────────────────────────
//
// Multi-signal match: name tokens, common nicknames (AOC → Ocasio-Cortez),
// and US state names ↔ codes (CA ⇔ California). Tokenized so "ca senate"
// surfaces California senators.

const NICKNAMES: Record<string, string[]> = {
  aoc: ["alexandria", "ocasio-cortez", "ocasio"],
  bernie: ["sanders"],
  "the squad": ["ocasio-cortez", "omar", "tlaib", "pressley", "bowman", "bush"],
  rfk: ["kennedy"],
  potus: ["president"],
  speaker: ["speaker"],
};

const US_STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas",
  CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware",
  FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho",
  IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas",
  KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi",
  MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada",
  NH: "new hampshire", NJ: "new jersey", NM: "new mexico", NY: "new york",
  NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma",
  OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina",
  SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah",
  VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia",
  WI: "wisconsin", WY: "wyoming",
};

const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([code, name]) => [name, code]),
);

function expandQueryToken(token: string): string[] {
  const lower = token.toLowerCase();
  const out = new Set<string>([lower]);
  if (NICKNAMES[lower]) NICKNAMES[lower].forEach((n) => out.add(n));
  // 2-letter state code → full name as alt
  if (lower.length === 2 && US_STATES[lower.toUpperCase()]) {
    out.add(US_STATES[lower.toUpperCase()]);
    out.add(`-${lower}`); // matches "D-CA" pattern
  }
  // State name → code (so typing "california" matches "D-CA")
  if (STATE_NAME_TO_CODE[lower]) {
    out.add(STATE_NAME_TO_CODE[lower].toLowerCase());
    out.add(`-${STATE_NAME_TO_CODE[lower].toLowerCase()}`);
  }
  return Array.from(out);
}

function searchableText(p: Legislator): string {
  return [
    p.name,
    p.role,
    p.party,
    p.constituency,
    p.country === "US" && p.constituency
      ? `${p.constituency} ${US_STATES[p.constituency] ?? ""}`
      : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesQuery(p: Legislator, query: string): boolean {
  const haystack = searchableText(p);
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  // Multi-word query: handle "alexandria ocasio" as a phrase fallback in
  // case the haystack has a hyphen. Also handle "AOC" as a single nickname
  // token that expands to multiple candidates — match on any.
  return tokens.every((t) => {
    const candidates = expandQueryToken(t);
    return candidates.some((c) => haystack.includes(c));
  });
}

/**
 * Relevance = how much useful information we have about this person.
 * Weights pick out the signals that make a card worth looking at:
 * a curated profile, an alignment score, a voting record, donor flags,
 * and a verified photo. No single signal dominates — the combination
 * is what matters.
 */
// Hand-picked priority — pin the politicians anyone would expect to see
// when they open the page. Same set as the homepage 9-tile preview.
const PRIORITY_NAMES = new Set(
  [
    "donald trump",
    "xi jinping",
    "mike johnson",
    "chuck schumer",
    "john thune",
    "bernie sanders",
    "alexandria ocasio-cortez",
    "josh hawley",
    "ted cruz",
  ].map((n) => n.toLowerCase()),
);

function relevanceScore(p: Legislator): number {
  let s = 0;
  if (PRIORITY_NAMES.has(p.name.toLowerCase())) s += 50;

  // Heads of state and chamber leaders read first to most readers.
  if (p.chamber === "executive") s += 20;
  const role = p.role?.toLowerCase() ?? "";
  if (/president|prime minister|general secretary|speaker/.test(role)) s += 15;
  if (/leader|chair|ranking member|rapporteur|shadow/.test(role)) s += 6;

  // Strongest signal: an actual researched AI summary. That's someone
  // who's shaped a named bill, given a floor speech, or led a committee.
  if (p.summary && p.summary.length > 80) s += 30;
  s += Math.min(p.keyPoints?.length ?? 0, 4) * 2;

  const curated = p.role?.includes("·") ?? false;
  if (curated) s += 8;
  if (p.stance && p.stance !== "none") s += 4;

  if (p.alignment) s += 6;
  s += Math.min(p.votes?.length ?? 0, 6) * 1.2;

  // Suspicious votes have a noisy long tail — cap hard.
  s += Math.min(p.suspiciousVotes?.length ?? 0, 4) * 0.3;

  if (p.photoUrl) s += 1;
  if (p.captureScore != null) s += Math.min(p.captureScore, 100) / 100;
  return s;
}
