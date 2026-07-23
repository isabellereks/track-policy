/**
 * Classify ingested bills into the app's Legislation shape.
 *
 * Reads:   data/raw/legiscan/bills/{STATE}.json
 * Writes:  data/legislation/{stateCode}.json  (states)
 *          data/legislation/federal.json      (US)
 *
 * The classification is heuristic — keyword matches in title + description
 * drive category + impactTags + stance. A later pass can upgrade this with
 * Claude if needed, but heuristics give decent coverage for free.
 *
 * The LegiScan progress events are mapped to our Stage enum:
 *   1 = Introduced        -> "Filed"
 *   2 = Engrossed         -> "Floor"
 *   3 = Enrolled          -> "Floor"
 *   4 = Passed            -> "Enacted"
 *   5 = Vetoed            -> "Dead"
 *   6 = Failed / Died     -> "Dead"
 *   7 = Override          -> "Enacted"
 *   8 = Chaptered         -> "Enacted"
 *   9 = Refer/Committee   -> "Committee"
 *   10= Report Pass       -> "Committee"
 *   11= Report DNP        -> "Dead"
 *   12= Draft             -> "Filed"
 *  otherwise -> "Filed" (safe default)
 */

import "../env.js";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Dimension,
  ImpactTag,
  Legislation,
  LegislationCategory,
  Stage,
  StanceType,
} from "../../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const RAW_BILLS_DIR = join(ROOT, "data/raw/legiscan/bills");
const CLAUDE_CACHE_PATH = join(ROOT, "data/raw/claude/classifications.json");
const DIM_STANCE_CACHE_PATH = join(
  ROOT,
  "data/raw/claude/dimension-stances.json",
);
const OUT_DIR = join(ROOT, "data/legislation");
const OUT_STATES_DIR = join(OUT_DIR, "states");
const SUPPLEMENTAL_PATH = join(OUT_DIR, "supplemental.json");

interface ClaudeClassification {
  category: LegislationCategory;
  impactTags: ImpactTag[];
  stance: StanceType;
  summary: string;
  classifiedAt: string;
}

const claudeCache: Record<string, ClaudeClassification> = existsSync(
  CLAUDE_CACHE_PATH,
)
  ? JSON.parse(readFileSync(CLAUDE_CACHE_PATH, "utf8"))
  : {};

type DimKey = Exclude<Dimension, "overall">;
const dimStanceCache: Record<
  string,
  Partial<Record<DimKey, StanceType>>
> = existsSync(DIM_STANCE_CACHE_PATH)
  ? JSON.parse(readFileSync(DIM_STANCE_CACHE_PATH, "utf8"))
  : {};

interface RawBill {
  bill_id: number;
  bill_number: string;
  title: string;
  description?: string;
  state?: string;
  url?: string;
  state_link?: string;
  session?: { session_name?: string; year_start?: number };
  status?: number;
  status_date?: string;
  progress?: Array<{ date: string; event: number }>;
  history?: Array<{ date: string; action: string }>;
  sponsors?: Array<{
    name: string;
    party?: string;
    role?: string;
  }>;
  subjects?: Array<{ subject_name: string }>;
}

interface OutFile {
  state: string;
  stateCode: string;
  region: "na";
  /** Overall / lens-agnostic stance. Max severity of DC + AI so a state
   *  that has clearly acted on AI doesn't read as "No Action" just
   *  because its bills didn't touch data-center tags. */
  stance: StanceType;
  stanceDatacenter: StanceType;
  stanceAI: StanceType;
  lastUpdated: string;
  contextBlurb: string;
  legislation: Legislation[];
}

/**
 * LegiScan only covers bills. Keep executive orders and other material
 * statewide actions in a small, source-backed supplement so they survive
 * every automated reclassification pass.
 */
const supplementalLegislation: Record<string, Legislation[]> = existsSync(
  SUPPLEMENTAL_PATH,
)
  ? JSON.parse(readFileSync(SUPPLEMENTAL_PATH, "utf8"))
  : {};

const STANCE_SEVERITY: Record<StanceType, number> = {
  restrictive: 4,
  concerning: 3,
  review: 2,
  favorable: 1,
  none: 0,
};

function overallStance(dc: StanceType, ai: StanceType): StanceType {
  return STANCE_SEVERITY[dc] >= STANCE_SEVERITY[ai] ? dc : ai;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};

function mapStage(bill: RawBill): Stage {
  // Some legislatures report a terminal action in history without adding a
  // matching progress event (South Dakota is a recurring example). Recognize
  // only explicit terminal phrases so a failed amendment does not kill an
  // otherwise live bill.
  const recentHistory = (bill.history ?? [])
    .slice(-6)
    .map((item) => item.action)
    .join(" ");
  if (
    /placed in (?:the )?legislative files?\.? \(dead\)|deferred to the 41st legislative day|do pass(?: amended)?, failed|tabled, passed/i.test(
      recentHistory,
    )
  ) {
    return "Dead";
  }

  // Walk progress events backward to find the latest meaningful one
  const events = bill.progress ?? [];
  if (!events.length) return "Filed";
  const latest = events[events.length - 1];
  switch (latest.event) {
    case 4:
    case 7:
    case 8:
      return "Enacted";
    case 2:
    case 3:
      return "Floor";
    case 9:
    case 10:
      return "Committee";
    case 5:
    case 6:
    case 11:
      return "Dead";
    case 1:
    case 12:
    default:
      return "Filed";
  }
}

// Keyword rules → impact tags. A bill gets every tag whose keywords
// appear in its title or description. Tags are lowercase-matched.
const TAG_RULES: Array<{ tag: ImpactTag; kw: RegExp }> = [
  { tag: "water-consumption", kw: /\b(water consumption|water use|cooling|chiller)\b/i },
  { tag: "water-infrastructure", kw: /\b(water supply|water infrastructure|aquifer|municipal water)\b/i },
  { tag: "carbon-emissions", kw: /\b(emissions|greenhouse gas|carbon|ghg)\b/i },
  { tag: "protected-land", kw: /\b(national park|state park|wildlife|protected land|forest)\b/i },
  { tag: "environmental-review", kw: /\b(environmental (impact|review|study)|EIS|eis|NEPA|nepa)\b/i },
  { tag: "renewable-energy", kw: /\b(renewable|solar|wind|clean energy|green energy)\b/i },
  { tag: "grid-capacity", kw: /\b(grid|load|capacity|transmission|peaker)\b/i },
  { tag: "energy-rates", kw: /\b(rate|ratepayer|utility cost|cost shift|tariff)\b/i },
  { tag: "noise-vibration", kw: /\b(noise|vibration|decibel)\b/i },
  { tag: "local-zoning", kw: /\bzoning|setback|siting\b/i },
  { tag: "local-control", kw: /\b(local control|municipal (authority|control)|county authority)\b/i },
  { tag: "residential-proximity", kw: /\b(proximity|distance|residential|near schools|near homes)\b/i },
  { tag: "property-values", kw: /\bproperty (value|tax)|assessment\b/i },
  { tag: "tax-incentives", kw: /\b(tax (credit|incentive|exemption|abate)|sales tax)\b/i },
  { tag: "job-creation", kw: /\b(job (creation|training)|workforce|employment requirement)\b/i },
  { tag: "economic-development", kw: /\b(economic development|investment|growth)\b/i },
  { tag: "nda-transparency", kw: /\b(non-?disclosure|NDA|nda|transparency)\b/i },
  { tag: "algorithmic-transparency", kw: /\b(algorithm|automated decision|explainab)/i },
  { tag: "ai-safety", kw: /\b(AI (safety|risk)|artificial intelligence (safety|risk)|red team)\b/i },
  { tag: "deepfake-regulation", kw: /\b(deepfake|synthetic media|digital replica)\b/i },
  { tag: "ai-in-healthcare", kw: /\b(medical AI|AI (in|for) healthcare|health decision|therapy bot|therapeutic chatbot)\b/i },
  { tag: "ai-in-employment", kw: /\b(hiring algorithm|workplace (surveillance|monitoring)|employment (screen|algorithm))\b/i },
  { tag: "ai-in-education", kw: /\b(AI in (school|education)|student (AI|data)|education technology)\b/i },
  { tag: "child-safety", kw: /\b(minor|child|children|student|chatbot safety|age verification)\b/i },
  { tag: "data-privacy", kw: /\b(data privacy|personal data|consumer data|training data|privacy)\b/i },
];

const CATEGORY_RULES: Array<{ cat: LegislationCategory; kw: RegExp }> = [
  { cat: "data-center-siting", kw: /\b(data center (moratorium|siting|ban|construction|prohibit|setback|zoning))\b/i },
  { cat: "data-center-energy", kw: /\b(data center (energy|power|grid|cooling|water use)|data center reporting)\b/i },
  { cat: "synthetic-media", kw: /\b(deepfake|synthetic media|digital replica|political advert)\b/i },
  { cat: "ai-healthcare", kw: /\b(AI (in|for) health|medical AI|therapy bot|healthcare artificial intelligence)\b/i },
  { cat: "ai-workforce", kw: /\b(hiring algorithm|workplace monitoring|employment AI|automated employment decision)\b/i },
  { cat: "ai-education", kw: /\b(AI in (school|education|classroom)|student data|education AI)\b/i },
  { cat: "ai-government", kw: /\b(government AI|agency AI|procurement|public sector AI)\b/i },
  { cat: "ai-criminal-justice", kw: /\b(facial recognition|predictive policing|law enforcement AI|biometric surveillance)\b/i },
  { cat: "data-privacy", kw: /\b(consumer data protection|data privacy|personal data|consumer privacy)\b/i },
  { cat: "ai-governance", kw: /\b(artificial intelligence|AI (framework|governance|oversight|regulation))\b/i },
];

const VALID_IMPACT_TAGS = new Set<ImpactTag>(
  TAG_RULES.map(({ tag }) => tag),
);
const VALID_CATEGORIES = new Set<LegislationCategory>([
  "data-center-siting",
  "data-center-energy",
  "ai-governance",
  "synthetic-media",
  "ai-healthcare",
  "ai-workforce",
  "ai-education",
  "ai-government",
  "data-privacy",
  "ai-criminal-justice",
]);

function classifyCategory(text: string): LegislationCategory {
  for (const { cat, kw } of CATEGORY_RULES) {
    if (kw.test(text)) return cat;
  }
  return "ai-governance";
}

function classifyTags(text: string): ImpactTag[] {
  const tags: ImpactTag[] = [];
  for (const { tag, kw } of TAG_RULES) {
    if (kw.test(text)) tags.push(tag);
  }
  return tags.slice(0, 5); // keep display manageable
}

function deriveStance(
  bill: RawBill,
  stage: Stage,
  category: LegislationCategory,
): StanceType {
  const text = `${bill.title} ${bill.description ?? ""}`.toLowerCase();
  const isMoratorium = /moratorium|prohibit|ban\b/.test(text);
  const isIncentive = /incentive|exempt|credit|fast.?track/.test(text);
  const isStudy = /study|commission|task force|working group|review/.test(text);

  if (isMoratorium && stage === "Enacted") return "restrictive";
  if (isMoratorium && (stage === "Floor" || stage === "Committee")) return "concerning";
  if (isIncentive) return "favorable";
  if (isStudy) return "review";

  // Category-driven defaults
  if (category === "ai-governance" || category === "ai-criminal-justice") {
    if (stage === "Enacted" || stage === "Floor") return "concerning";
    return "review";
  }
  if (category === "data-center-siting" || category === "data-center-energy") {
    if (stage === "Enacted") return "concerning";
    return "review";
  }
  return "review";
}

function stateStance(bills: Legislation[]): StanceType {
  const tally: Record<StanceType, number> = {
    restrictive: 0,
    concerning: 0,
    review: 0,
    favorable: 0,
    none: 0,
  };
  // Track ENACTED restrictive bills separately. A single filed moratorium
  // bill (e.g. Sanders/AOC at the federal level, or a long-shot state
  // proposal) shouldn't be enough to flip the whole jurisdiction to
  // "restrictive" — only bills that actually became law should lock
  // that bucket. This was the federal-level bug: one filed moratorium
  // overrode the prevailing innovation-friendly federal posture.
  let enactedRestrictive = 0;

  for (const b of bills) {
    const s: StanceType =
      b.stance ??
      (/\bmoratorium|prohibit|ban\b/i.test(b.title) && b.stage === "Enacted"
        ? "restrictive"
        : /\bmoratorium|prohibit|ban\b/i.test(b.title)
          ? "concerning"
          : /\bincentive|exempt|credit\b/i.test(b.title)
            ? "favorable"
            : "review");
    tally[s] += 1;
    if (s === "restrictive" && b.stage === "Enacted") enactedRestrictive++;
  }

  // Only an enacted restrictive bill (real moratorium that became law)
  // can lock the jurisdiction as restrictive.
  if (enactedRestrictive >= 1) return "restrictive";

  // Filed/committee restrictive bills count toward the concerning bucket
  // for tally purposes, since they signal regulatory pressure without
  // having become law yet.
  const opposition = tally.concerning + tally.restrictive;

  // One advanced restriction, or a pair of live opposition bills (often
  // House/Senate companions), is enough to show meaningful policy pressure.
  // The old threshold of three understated active 2026 moratorium efforts.
  const advancedOpposition = bills.filter(
    (b) =>
      (b.stance === "restrictive" || b.stance === "concerning") &&
      (b.stage === "Floor" || b.stage === "Enacted"),
  ).length;
  if (advancedOpposition >= 1 || opposition >= 2) return "concerning";

  // More incentive bills than opposition AND at least 2 → favorable
  if (tally.favorable >= 2 && tally.favorable >= opposition) return "favorable";

  // Single incentive vs no opposition → still favorable
  if (tally.favorable >= 1 && opposition === 0) return "favorable";

  // Some opposition but not enough to dominate, plus discussion → review
  if (opposition >= 1 || tally.review >= 1) return "review";

  return "none";
}

const DC_DIMENSION_TAGS: ImpactTag[] = [
  "water-consumption",
  "carbon-emissions",
  "protected-land",
  "environmental-review",
  "renewable-energy",
  "grid-capacity",
  "energy-rates",
  "water-infrastructure",
  "noise-vibration",
  "local-zoning",
  "local-control",
  "residential-proximity",
  "property-values",
];

const AI_DIMENSION_TAGS: ImpactTag[] = [
  "algorithmic-transparency",
  "ai-safety",
  "data-privacy",
  "child-safety",
  "ai-in-employment",
  "ai-in-healthcare",
  "ai-in-education",
  "deepfake-regulation",
];

const DC_DIMS: DimKey[] = ["environmental", "energy", "community", "land-use"];
const AI_DIMS: DimKey[] = [
  "ai-governance-dim",
  "ai-consumer",
  "ai-workforce",
  "ai-public",
  "ai-synthetic",
];

function lensStance(bills: Legislation[], lens: "datacenter" | "ai"): StanceType {
  const lensTags = lens === "ai" ? AI_DIMENSION_TAGS : DC_DIMENSION_TAGS;
  const lensDims = lens === "ai" ? AI_DIMS : DC_DIMS;
  const tagSet = new Set(lensTags);

  // Build a synthetic bill list whose `stance` is the lens-scoped stance:
  // if dimensionStances has entries for any lens dim, aggregate those;
  // else, if tags match the lens, use bill-level stance; else skip.
  const lensBills: Legislation[] = [];
  for (const b of bills) {
    const dimVotes = lensDims
      .map((d) => b.dimensionStances?.[d])
      .filter((s): s is StanceType => !!s);
    const categoryMatch =
      lens === "datacenter"
        ? b.category.startsWith("data-center-")
        : !b.category.startsWith("data-center-");
    const tagMatch =
      categoryMatch || (b.impactTags ?? []).some((t) => tagSet.has(t));
    if (dimVotes.length > 0) {
      // Pick the most severe stance across the lens's dimensions for this bill
      const severity: Record<StanceType, number> = {
        restrictive: 4,
        concerning: 3,
        review: 2,
        favorable: 1,
        none: 0,
      };
      let pick: StanceType = dimVotes[0];
      for (const v of dimVotes) if (severity[v] > severity[pick]) pick = v;
      lensBills.push({ ...b, stance: pick });
    } else if (tagMatch) {
      lensBills.push(b);
    }
  }
  return stateStance(lensBills);
}

function derivePartyOrigin(bill: RawBill): "R" | "D" | "B" | undefined {
  const parties = new Set<string>();
  for (const s of bill.sponsors ?? []) {
    if (s.party) parties.add(s.party);
  }
  if (parties.size > 1) return "B";
  if (parties.has("R")) return "R";
  if (parties.has("D")) return "D";
  return undefined;
}

function lastActionDate(bill: RawBill): string {
  const dates = [
    bill.status_date,
    ...(bill.progress ?? []).map((item) => item.date),
    ...(bill.history ?? []).map((item) => item.date),
  ].filter((date): date is string => Boolean(date));
  return dates.sort().at(-1) ?? new Date().toISOString().slice(0, 10);
}

function officialSourceUrl(bill: RawBill): string | undefined {
  return bill.state_link ?? undefined;
}

function toLegislation(bill: RawBill): Legislation {
  const text = `${bill.title} ${bill.description ?? ""}`;
  const stage = mapStage(bill);

  // Prefer Claude's semantic classification if we have it; fall back to
  // the keyword heuristics for bills that Claude hasn't been run on
  // (or that failed JSON parsing).
  const claude = claudeCache[String(bill.bill_id)];
  const category =
    claude?.category && VALID_CATEGORIES.has(claude.category)
      ? claude.category
      : classifyCategory(text);
  const tags = (claude?.impactTags ?? classifyTags(text)).filter((tag) =>
    VALID_IMPACT_TAGS.has(tag),
  );
  const summary =
    claude?.summary ??
    (bill.description
      ? bill.description.length > 280
        ? bill.description.slice(0, 277) + "..."
        : bill.description
      : bill.title);

  // Claude returns its own stance. Trust it when present; otherwise use
  // the heuristic `deriveStance` which considers stage, category, and
  // moratorium/incentive cues.
  const stance: StanceType =
    claude?.stance ?? deriveStance(bill, stage, category);

  const dimensionStances = dimStanceCache[String(bill.bill_id)];

  return {
    id: `${bill.state}-${bill.bill_number}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-"),
    billCode: bill.bill_number,
    title: bill.title,
    summary,
    stage,
    stance,
    ...(dimensionStances && Object.keys(dimensionStances).length > 0
      ? { dimensionStances }
      : {}),
    impactTags: tags,
    category,
    updatedDate: lastActionDate(bill),
    partyOrigin: derivePartyOrigin(bill),
    sourceUrl: officialSourceUrl(bill),
    legiscanUrl: bill.url,
    legiscanId: bill.bill_id,
    sponsors: (bill.sponsors ?? []).map((s) => s.name).slice(0, 4),
  };
}

const STANCE_PHRASE: Record<StanceType, string> = {
  restrictive: "leaning restrictive",
  concerning: "advancing regulation",
  review: "under discussion",
  favorable: "leaning innovation-friendly",
  none: "no action",
};

function lensSlice(
  bills: Legislation[],
  lens: "datacenter" | "ai",
): Legislation[] {
  const tagSet = new Set<ImpactTag>(
    lens === "ai" ? AI_DIMENSION_TAGS : DC_DIMENSION_TAGS,
  );
  const dims = lens === "ai" ? AI_DIMS : DC_DIMS;
  return bills.filter((b) => {
    if (b.stance === "none") return false;
    const categoryMatch =
      lens === "datacenter"
        ? b.category.startsWith("data-center-")
        : !b.category.startsWith("data-center-");
    if (categoryMatch) return true;
    if (dims.some((d) => b.dimensionStances?.[d])) return true;
    return (b.impactTags ?? []).some((t) => tagSet.has(t));
  });
}

const STAGE_RANK: Record<string, number> = {
  Enacted: 5,
  Floor: 4,
  Committee: 3,
  Filed: 2,
  "Carried Over": 1,
  Dead: 0,
};

const STANCE_WEIGHT: Record<StanceType, number> = {
  restrictive: 4,
  concerning: 3,
  favorable: 3,
  review: 1,
  none: 0,
};

/**
 * Rank bills by a combination of stage (enacted outranks filed) and stance
 * intensity (restrictive/concerning/favorable all beat review), breaking
 * ties on recency. The top bill is what we highlight in the blurb.
 */
function rankBills(bills: Legislation[]): Legislation[] {
  return [...bills].sort((a, b) => {
    const as = STAGE_RANK[a.stage] ?? 0;
    const bs = STAGE_RANK[b.stage] ?? 0;
    if (as !== bs) return bs - as;
    const aw = STANCE_WEIGHT[a.stance ?? "review"];
    const bw = STANCE_WEIGHT[b.stance ?? "review"];
    if (aw !== bw) return bw - aw;
    return (b.updatedDate ?? "").localeCompare(a.updatedDate ?? "");
  });
}

const STAGE_VERB: Record<string, string> = {
  Enacted: "enacted",
  Floor: "on the floor",
  Committee: "in committee",
  Filed: "filed",
  "Carried Over": "carried over",
  Dead: "dead",
};

/**
 * First clean sentence of a bill summary, trimmed to ~140 chars. Summaries
 * from Claude are already plain language, so we just need to clip them.
 */
function highlight(bill: Legislation): string {
  let raw = (bill.summary ?? bill.title).trim();
  // Bills whose summary is still the raw legalese "To <verb>..." haven't
  // been re-summarized by Claude. Fall back to the title — often cleaner.
  if (/^to\s+\w/i.test(raw) && bill.title) {
    raw = bill.title.trim();
  }
  // Prefer the first sentence; truncate only if it runs long.
  const firstSentence = raw.match(/^[^.!?]+[.!?]/)?.[0] ?? raw;
  const trimmed =
    firstSentence.length > 200
      ? firstSentence.slice(0, 197).replace(/[.…\s]+$/, "") + "…"
      : firstSentence.replace(/[.…\s]+$/, "");
  // Strip redundant "This bill" / "This <qualifier> bill" leads — the
  // framing is already clear from the "On data centers: / On AI:" prefix.
  const cleaned = trimmed
    .replace(/^This\s+(?:\w+\s+)?bill\s+/i, "")
    .replace(/^The\s+bill\s+/i, "");
  const body = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const terminal = body.endsWith("…") ? "" : ".";
  return `${bill.billCode} (${STAGE_VERB[bill.stage] ?? bill.stage.toLowerCase()}) — ${body}${terminal}`;
}

function writeContextBlurb(
  state: string,
  stateFull: string,
  bills: Legislation[],
  stanceDatacenter: StanceType,
  stanceAI: StanceType,
): string {
  const name = state === "US" ? "The US federal government" : stateFull;
  const relevant = bills.filter((b) => b.stance !== "none");
  if (relevant.length === 0) {
    return `${name} has no AI or data-center legislation currently tracked.`;
  }

  // Dead bills are noise for a highlight — they're neither shaping policy
  // nor advancing. Rank only from the live set.
  const liveDC = lensSlice(bills, "datacenter").filter((b) => b.stage !== "Dead");
  const liveAI = lensSlice(bills, "ai").filter((b) => b.stage !== "Dead");
  const dcBills = rankBills(liveDC);
  const aiBills = rankBills(liveAI);

  const parts: string[] = [];

  // Lead — per-lens posture in one sentence. Collapse matching stances so
  // we don't read "advancing regulation on data centers and advancing
  // regulation on AI" — unify into "across both data centers and AI".
  if (dcBills.length > 0 && aiBills.length > 0) {
    if (stanceDatacenter === stanceAI) {
      parts.push(
        `${name} is ${STANCE_PHRASE[stanceDatacenter]} across both data centers and AI.`,
      );
    } else {
      parts.push(
        `${name} is ${STANCE_PHRASE[stanceDatacenter]} on data centers and ${STANCE_PHRASE[stanceAI]} on AI.`,
      );
    }
  } else if (dcBills.length > 0) {
    parts.push(
      `${name} is ${STANCE_PHRASE[stanceDatacenter]} on data centers, with no AI legislation currently tracked.`,
    );
  } else if (aiBills.length > 0) {
    parts.push(
      `${name} is ${STANCE_PHRASE[stanceAI]} on AI, with no data-center legislation currently tracked.`,
    );
  }

  // Highlight the most consequential bill per lens.
  if (dcBills.length > 0) {
    parts.push(`On data centers: ${highlight(dcBills[0])}`);
  }
  if (aiBills.length > 0) {
    parts.push(`On AI: ${highlight(aiBills[0])}`);
  }

  return parts.join(" ");
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_STATES_DIR, { recursive: true });

  const files = readdirSync(RAW_BILLS_DIR).filter((f) => f.endsWith(".json"));
  let totalBills = 0;
  let totalJurisdictions = 0;

  for (const file of files) {
    const state = file.replace(".json", "");
    const raw = JSON.parse(readFileSync(join(RAW_BILLS_DIR, file), "utf8")) as RawBill[];
    // Keyword searches intentionally cast a wide net. Keep semantically
    // rejected matches in the raw/cache layers for auditability, but do not
    // surface them as tracked policy in the product.
    const classifiedBills = raw
      .map(toLegislation)
      .filter((bill) => bill.stance !== "none");
    const legislation = [...(supplementalLegislation[state] ?? []), ...classifiedBills]
      .filter(
        (bill, index, bills) =>
          bills.findIndex((candidate) => candidate.id === bill.id) === index,
      )
      .sort((a, b) => b.updatedDate.localeCompare(a.updatedDate));
    const stateFull = state === "US" ? "United States" : STATE_NAMES[state] ?? state;
    const stanceDatacenter = lensStance(legislation, "datacenter");
    const stanceAI = lensStance(legislation, "ai");
    const stance = overallStance(stanceDatacenter, stanceAI);

    const target =
      state === "US"
        ? join(OUT_DIR, "federal.json")
        : join(OUT_STATES_DIR, `${stateFull.toLowerCase().replace(/\s+/g, "-")}.json`);

    // Preserve hand-written blurbs: if the target already has a
    // `contextBlurb`, keep it. The template-generated blurb is only a
    // fallback for fresh jurisdictions. Prior runs of this script were
    // overwriting editorial prose on every reclassify — we'd rather
    // occasionally ship a stale blurb than silently nuke someone's
    // writing. To force regeneration, delete the field in the JSON
    // first or pass `--force-blurbs` (see below).
    let contextBlurb: string | null = null;
    if (existsSync(target) && !process.argv.includes("--force-blurbs")) {
      try {
        const existing = JSON.parse(readFileSync(target, "utf8")) as Partial<OutFile>;
        if (existing.contextBlurb && existing.contextBlurb.trim().length > 0) {
          contextBlurb = existing.contextBlurb;
        }
      } catch {
        // fall through to regeneration
      }
    }
    if (!contextBlurb) {
      contextBlurb = writeContextBlurb(
        state,
        stateFull,
        legislation,
        stanceDatacenter,
        stanceAI,
      );
    }

    const out: OutFile = {
      state: stateFull,
      stateCode: state,
      region: "na",
      stance,
      stanceDatacenter,
      stanceAI,
      lastUpdated: new Date().toISOString().slice(0, 10),
      contextBlurb,
      legislation,
    };

    writeFileSync(target, JSON.stringify(out, null, 2));
    totalBills += legislation.length;
    totalJurisdictions += 1;
  }

  console.log(
    `[classify] wrote ${totalJurisdictions} jurisdictions, ${totalBills} bills total`,
  );
}

main();
