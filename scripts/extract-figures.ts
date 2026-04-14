/**
 * Extract AI / data-center relevant key figures from the gov-simulator
 * government-profiles.json source file.
 *
 * Reads: data/sources/government-profiles.json
 * Writes: data/figures/federal.json
 *         data/figures/states/{stateCode}.json   (per-state pull of that state's delegation)
 *
 * No API calls. Safe to re-run. Deterministic.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Chamber = "senate" | "house" | "executive" | "scotus";

type StanceType = "restrictive" | "concerning" | "review" | "none" | "favorable";

interface SimMember {
  name: string;
  state?: string;
  party?: string;
  committees?: string[];
  seniority?: number;
  leadership?: string | null;
  class?: string;
  issues?: Record<string, number>;
  behavior?: Record<string, number>;
  electoral?: {
    seat_safety?: string;
    last_margin?: number;
  };
  personality?: {
    known_for?: string;
    pressure_point?: string;
    interests?: string[];
  };
  biography?: {
    age?: number;
    education?: string;
    career_before_politics?: string;
  };
  lobbying?: {
    top_industries?: string[];
    total_raised?: string;
  };
}

interface KeyFigure {
  id: string;
  name: string;
  role: string;
  party: string;
  state: string;
  chamber: Chamber;
  committees: string[];
  stance: StanceType;
  techRegScore: number;
  lobbying: {
    topIndustries: string[];
    totalRaised: string;
  };
  biography: {
    age: number;
    education: string;
    careerBeforePolitics: string;
  };
  seatSafety: string;
}

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "data/sources/government-profiles.json");
const OUT_FEDERAL = join(ROOT, "data/figures/federal.json");
const OUT_STATES_DIR = join(ROOT, "data/figures/states");

const RELEVANT_COMMITTEES = [
  "Commerce",
  "Commerce, Science",
  "Energy",
  "Energy and Commerce",
  "Energy and Natural Resources",
  "Judiciary",
  "Science",
  "Science, Space, and Technology",
  "Intelligence",
  "Innovation",
  "Homeland Security",
];

/**
 * Hand-curated "must include" list. These names are always placed at the
 * front of the federal output regardless of their algorithmic relevance
 * score, so the US entity surfaces a deliberately diverse cross-section
 * of figures actively shaping AI / data-center policy, not just whichever
 * members score highest on tech_regulation. Names that aren't found in
 * the source data are silently skipped.
 */
const MUST_INCLUDE_NAMES = [
  // Senate leadership + AI-relevant chairs / ranking members
  "Chuck Schumer",
  "Mitch McConnell",
  "John Thune",
  "Maria Cantwell",
  "Ted Cruz",
  "Mark Warner",
  "Amy Klobuchar",
  "Josh Hawley",
  "Cory Booker",
  "Todd Young",
  "Marsha Blackburn",
  "Bernie Sanders",
  "Elizabeth Warren",
  "Lisa Murkowski",
  // House leadership + notable AI / tech voices
  "Hakeem Jeffries",
  "Mike Johnson",
  "Steve Scalise",
  "Elise Stefanik",
  "Jim Jordan",
  "Pramila Jayapal",
  "Ro Khanna",
  "Ted Lieu",
  "Alexandria Ocasio-Cortez",
  "Don Beyer",
  "Yvette Clarke",
  "Ritchie Torres",
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isRelevantCommittee(name: string): boolean {
  const n = name.toLowerCase();
  return RELEVANT_COMMITTEES.some((k) => n.includes(k.toLowerCase()));
}

function hasAnyRelevantCommittee(committees: string[] | undefined): boolean {
  if (!committees) return false;
  return committees.some(isRelevantCommittee);
}

function deriveStance(m: SimMember): StanceType {
  const techReg = m.issues?.tech_regulation ?? 0.5;
  const bipartisan = m.behavior?.bipartisan_index ?? 0.3;
  const party = (m.party ?? "").toUpperCase();
  const isR = party.startsWith("R");
  const isD = party.startsWith("D");
  const hasLeadership = !!m.leadership;
  const hasRelevantCommittee = hasAnyRelevantCommittee(m.committees);

  // Strong tech-regulation engagement drives the most decisive stances.
  if (techReg > 0.75) {
    if (isR) return "favorable";
    if (isD) return techReg > 0.85 ? "restrictive" : "concerning";
  }
  // Leadership OR relevant committee membership → at least "review".
  // Keeps known figures (Schumer, Cantwell, Cruz, etc.) from defaulting
  // to "No Activity" just because tech_regulation isn't their top score.
  if (hasLeadership || hasRelevantCommittee) return "review";
  // Bipartisan moderates
  if (bipartisan > 0.55) return "review";
  // Low/mid tech engagement without committee signal
  if (techReg < 0.4) return "none";
  if (techReg < 0.6) return "review";
  return isR ? "favorable" : "concerning";
}

function buildRole(m: SimMember, chamber: Chamber): string {
  const parts: string[] = [];
  if (chamber === "senate") parts.push("Senator");
  else if (chamber === "house") parts.push("Representative");
  else if (chamber === "executive") parts.push("Executive");
  else if (chamber === "scotus") parts.push("Justice");

  if (m.leadership) parts.push(`· ${m.leadership}`);
  else if (m.committees?.length) {
    const relevant = m.committees.find(isRelevantCommittee);
    if (relevant) parts.push(`· ${relevant}`);
  }
  return parts.join(" ");
}

function buildFigure(m: SimMember, chamber: Chamber): KeyFigure {
  const state = m.state ?? "";
  const partyLetter = (m.party ?? "").charAt(0).toUpperCase();
  return {
    id: slugify(m.name),
    name: m.name,
    role: buildRole(m, chamber),
    party: state ? `${partyLetter}-${state}` : partyLetter,
    state,
    chamber,
    committees: m.committees ?? [],
    stance: deriveStance(m),
    techRegScore: m.issues?.tech_regulation ?? 0,
    lobbying: {
      topIndustries: m.lobbying?.top_industries ?? [],
      totalRaised: m.lobbying?.total_raised ?? "",
    },
    biography: {
      age: m.biography?.age ?? 0,
      education: m.biography?.education ?? "",
      careerBeforePolitics: m.biography?.career_before_politics ?? "",
    },
    seatSafety: m.electoral?.seat_safety ?? "",
  };
}

function relevanceScore(m: SimMember): number {
  const techReg = m.issues?.tech_regulation ?? 0;
  const committeeBoost = hasAnyRelevantCommittee(m.committees) ? 0.3 : 0;
  const leadershipBoost = m.leadership ? 0.15 : 0;
  return techReg + committeeBoost + leadershipBoost;
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`[extract-figures] missing source file: ${SRC}`);
    process.exit(1);
  }
  const raw = readFileSync(SRC, "utf8");
  const data = JSON.parse(raw) as {
    senate?: SimMember[];
    house?: SimMember[];
    executive?: SimMember[];
    scotus?: SimMember[];
  };

  const senate = data.senate ?? [];
  const house = data.house ?? [];

  // Federal list — curated must-include names FIRST (deliberately diverse),
  // then the algorithmic top-by-relevance backfill for the remaining slots.
  const allMembers: { m: SimMember; chamber: Chamber }[] = [
    ...senate.map((m) => ({ m, chamber: "senate" as const })),
    ...house.map((m) => ({ m, chamber: "house" as const })),
  ];

  const byLowerName = new Map<string, { m: SimMember; chamber: Chamber }>();
  for (const entry of allMembers) {
    byLowerName.set(entry.m.name.toLowerCase(), entry);
  }

  const curated: { m: SimMember; chamber: Chamber }[] = [];
  const usedNames = new Set<string>();
  const missingNames: string[] = [];
  for (const name of MUST_INCLUDE_NAMES) {
    const hit = byLowerName.get(name.toLowerCase());
    if (hit) {
      curated.push(hit);
      usedNames.add(hit.m.name);
    } else {
      missingNames.push(name);
    }
  }

  if (missingNames.length) {
    console.log(
      `[extract-figures] must-include names not found in source (skipped): ${missingNames.join(", ")}`,
    );
  }

  const algorithmic = allMembers
    .filter(({ m }) => !usedNames.has(m.name))
    .filter(({ m }) => relevanceScore(m) > 0.55)
    .sort((a, b) => relevanceScore(b.m) - relevanceScore(a.m));

  const combined = [...curated, ...algorithmic].slice(0, 80);
  const federalFigures = combined.map(({ m, chamber }) =>
    buildFigure(m, chamber),
  );

  mkdirSync(join(ROOT, "data/figures"), { recursive: true });
  writeFileSync(OUT_FEDERAL, JSON.stringify(federalFigures, null, 2));
  console.log(
    `[extract-figures] wrote ${federalFigures.length} federal figures → data/figures/federal.json`,
  );

  // Per-state figures — group senate+house members by state
  const byState: Record<string, KeyFigure[]> = {};
  for (const { m, chamber } of allMembers) {
    const state = m.state;
    if (!state || chamber === "executive" || chamber === "scotus") continue;
    if (!byState[state]) byState[state] = [];
    byState[state].push(buildFigure(m, chamber));
  }

  mkdirSync(OUT_STATES_DIR, { recursive: true });
  let stateCount = 0;
  for (const [state, figures] of Object.entries(byState)) {
    // Sort by tech-reg score desc within state
    figures.sort((a, b) => b.techRegScore - a.techRegScore);
    const slug = slugify(state);
    writeFileSync(
      join(OUT_STATES_DIR, `${slug}.json`),
      JSON.stringify(figures, null, 2),
    );
    stateCount++;
  }
  console.log(
    `[extract-figures] wrote ${stateCount} state figure files → data/figures/states/`,
  );
}

main();
