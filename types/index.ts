export type Region = "na" | "eu" | "asia" | "latam" | "africa" | "oceania";

/** Sub-view inside the NA region: countries → states → counties drill-down. */
export type NaView = "countries" | "states" | "counties";

export interface ViewTarget {
  region: Region;
  naView: NaView;
  selectedGeoId: string | null;
  /** State to drill into for county view. Full name, e.g. "Virginia". */
  selectedStateName?: string | null;
  /** 5-digit FIPS of the selected county (when naView === "counties"). */
  selectedCountyFips?: string | null;
}

export type MunicipalActionStatus =
  | "enacted"
  | "proposed"
  | "under-review"
  | "failed";

export interface MunicipalAction {
  title: string;
  date: string;
  status: MunicipalActionStatus;
  summary: string;
  sourceUrl?: string;
}

export interface MunicipalEntity {
  id: string;
  name: string;
  /** 5-digit FIPS code matching the us-atlas counties-10m.json feature id. */
  fips: string;
  state: string;
  stateCode: string;
  type: "county" | "city" | "town" | "township";
  actions: MunicipalAction[];
  concerns: ImpactTag[];
  contextBlurb: string;
}

/** State name → 2-digit FIPS prefix. */
export const STATE_FIPS: Record<string, string> = {
  Alabama: "01",
  Alaska: "02",
  Arizona: "04",
  Arkansas: "05",
  California: "06",
  Colorado: "08",
  Connecticut: "09",
  Delaware: "10",
  Florida: "12",
  Georgia: "13",
  Hawaii: "15",
  Idaho: "16",
  Illinois: "17",
  Indiana: "18",
  Iowa: "19",
  Kansas: "20",
  Kentucky: "21",
  Louisiana: "22",
  Maine: "23",
  Maryland: "24",
  Massachusetts: "25",
  Michigan: "26",
  Minnesota: "27",
  Mississippi: "28",
  Missouri: "29",
  Montana: "30",
  Nebraska: "31",
  Nevada: "32",
  "New Hampshire": "33",
  "New Jersey": "34",
  "New Mexico": "35",
  "New York": "36",
  "North Carolina": "37",
  "North Dakota": "38",
  Ohio: "39",
  Oklahoma: "40",
  Oregon: "41",
  Pennsylvania: "42",
  "Rhode Island": "44",
  "South Carolina": "45",
  "South Dakota": "46",
  Tennessee: "47",
  Texas: "48",
  Utah: "49",
  Vermont: "50",
  Virginia: "51",
  Washington: "53",
  "West Virginia": "54",
  Wisconsin: "55",
  Wyoming: "56",
};

export type Stage =
  | "Filed"
  | "Committee"
  | "Floor"
  | "Enacted"
  | "Carried Over"
  | "Dead";

/**
 * Where a jurisdiction stands on AI / data center DEVELOPMENT (not on
 * regulation). The semantic axis runs from "actively trying to slow
 * development" (restrictive) to "actively encouraging development"
 * (favorable). Intuition checks:
 *
 *  - restrictive  — Active moratoriums or hard caps on data centers / AI.
 *                   Maine LD 307, Oregon HB 2816, EU AI Act on services.
 *  - concerning   — Real legislation moving with regulatory teeth, but
 *                   not an outright stop. China (heavy on AI services
 *                   but pro-infrastructure), Texas (incentives + grid
 *                   strain pushback), Germany (strict EnEfG energy law).
 *  - review       — Studying, hearings, non-binding frameworks, bills
 *                   filed but stalled. South Korea AI Basic Act, Canada
 *                   post-AIDA, most US states with study bills.
 *  - favorable    — Innovation-friendly: light-touch, preemption-pushing,
 *                   incentive-heavy. US federal (Trump WH framework),
 *                   UK (principles-based), France (sovereign AI push),
 *                   Japan (voluntary framework), Tennessee, etc.
 *  - none         — No major activity tracked.
 */
export type StanceType =
  | "restrictive"
  | "review"
  | "favorable"
  | "concerning"
  | "none"
  | "pioneering";

/**
 * Single label map used for both US states and countries. Replaces the
 * older Restricting / Cautionary / Under Review / No Activity / Encouraging
 * system — those were vague and didn't work equally for both contexts.
 */
export const STANCE_LABEL: Record<StanceType, string> = {
  restrictive: "Active Restrictions",
  concerning: "Legislative Process",
  review: "Under Discussion",
  none: "No Action",
  favorable: "Innovation-Friendly",
  pioneering: "Dedicated Legislation",
};

export type GovLevel = "federal" | "state" | "bloc";

export type ImpactTag =
  // Environmental
  | "water-consumption"
  | "carbon-emissions"
  | "protected-land"
  | "environmental-review"
  | "renewable-energy"
  // Infrastructure
  | "grid-capacity"
  | "energy-rates"
  | "water-infrastructure"
  // Community
  | "noise-vibration"
  | "local-zoning"
  | "local-control"
  | "residential-proximity"
  | "property-values"
  // Economic
  | "tax-incentives"
  | "job-creation"
  | "economic-development"
  | "nda-transparency"
  // AI-specific
  | "algorithmic-transparency"
  | "ai-safety"
  | "deepfake-regulation"
  | "ai-in-healthcare"
  | "ai-in-employment"
  | "ai-in-education"
  | "child-safety"
  | "data-privacy";

/** Stablecoin-specific policy tags, stored at both the jurisdiction
 *  level (stablecoinMeta.tags) and the bill level (legislation.stablecoinTags). */
export type StablecoinTag =
  // Issuance — who can issue and on what terms
  | "bank-only"
  | "non-bank-permitted"
  | "foreign-issuer-allowed"
  | "licensing-required"
  | "sandbox-available"
  // Reserve & Backing — how reserves are held and verified
  | "fiat-reserve-11"
  | "asset-backed"
  | "algorithmic-banned"
  | "monthly-attestation"
  | "rehypothecation-banned"
  // Consumer Protection — holder rights and safeguards
  | "redemption-rights"
  | "yield-prohibited"
  | "insolvency-priority"
  | "disclosure-required"
  | "aml-kyc"
  // Cross-Border — treatment of foreign issuers and tokens
  | "equivalence-principle"
  | "passporting"
  | "foreign-stablecoin-banned"
  | "travel-rule"
  | "local-entity-required"
  // Monetary Sovereignty — government stance on private stablecoins
  | "cbdc-coexistence"
  | "usd-stablecoin-restricted"
  | "capital-flow-controls"
  | "private-stablecoin-banned";

export type LegislationCategory =
  | "data-center-siting"
  | "data-center-energy"
  | "ai-governance"
  | "synthetic-media"
  | "ai-healthcare"
  | "ai-workforce"
  | "ai-education"
  | "ai-government"
  | "data-privacy"
  | "ai-criminal-justice"
  | "stablecoin-policy"
  | "stablecoin-regulation";

export type Dimension =
  | "overall"
  // Data Center lens
  | "environmental"
  | "energy"
  | "community"
  | "land-use"
  // AI Regulation lens
  | "ai-governance-dim"
  | "ai-consumer"
  | "ai-workforce"
  | "ai-public"
  | "ai-synthetic"
  // Stablecoin lens
  | "sc-issuance"
  | "sc-reserve"
  | "sc-consumer"
  | "sc-cross-border"
  | "sc-sovereignty";

export type DimensionLens = "datacenter" | "ai" | "stablecoin";

export const DATACENTER_DIMENSIONS: Dimension[] = [
  "environmental",
  "energy",
  "community",
  "land-use",
];

export const AI_DIMENSIONS: Dimension[] = [
  "ai-governance-dim",
  "ai-consumer",
  "ai-workforce",
  "ai-public",
  "ai-synthetic",
];

export const STABLECOIN_DIMENSIONS: Dimension[] = [
  "sc-issuance",
  "sc-reserve",
  "sc-consumer",
  "sc-cross-border",
  "sc-sovereignty",
];

export const IMPACT_TAG_LABEL: Record<ImpactTag, string> = {
  "water-consumption": "Water Consumption",
  "carbon-emissions": "Carbon Emissions",
  "protected-land": "Protected Land",
  "environmental-review": "Environmental Review",
  "renewable-energy": "Renewable Energy",
  "grid-capacity": "Grid Capacity",
  "energy-rates": "Energy Rates",
  "water-infrastructure": "Water Infrastructure",
  "noise-vibration": "Noise & Vibration",
  "local-zoning": "Local Zoning",
  "local-control": "Local Control",
  "residential-proximity": "Residential Proximity",
  "property-values": "Property Values",
  "tax-incentives": "Tax Incentives",
  "job-creation": "Job Creation",
  "economic-development": "Economic Development",
  "nda-transparency": "NDA Transparency",
  "algorithmic-transparency": "Algorithmic Transparency",
  "ai-safety": "AI Safety",
  "deepfake-regulation": "Deepfake Regulation",
  "ai-in-healthcare": "AI in Healthcare",
  "ai-in-employment": "AI in Employment",
  "ai-in-education": "AI in Education",
  "child-safety": "Child Safety",
  "data-privacy": "Data Privacy",
};

export const CATEGORY_LABEL: Record<LegislationCategory, string> = {
  "data-center-siting": "Data Centers",
  "data-center-energy": "Data Centers",
  "ai-governance": "Governance",
  "synthetic-media": "Deepfakes",
  "ai-healthcare": "Healthcare",
  "ai-workforce": "Workforce",
  "ai-education": "Education",
  "ai-government": "Government",
  "data-privacy": "Privacy",
  "ai-criminal-justice": "Criminal Justice",
  "stablecoin-policy": "Stablecoins",
  "stablecoin-regulation": "Stablecoins",
};

export const DIMENSION_LABEL: Record<Dimension, string> = {
  overall: "Overall stance",
  // Data Center lens
  environmental: "Environmental impact",
  energy: "Energy & grid",
  community: "Community impact",
  "land-use": "Land use",
  // AI Regulation lens
  "ai-governance-dim": "Governance",
  "ai-consumer": "Consumer protection",
  "ai-workforce": "Workforce & employment",
  "ai-public": "Public services",
  "ai-synthetic": "Synthetic media",
  // Stablecoin lens
  "sc-issuance": "Issuance",
  "sc-reserve": "Reserve & Backing",
  "sc-consumer": "Consumer Protection",
  "sc-cross-border": "Cross-Border",
  "sc-sovereignty": "Monetary Sovereignty",
};

export interface Legislation {
  id: string;
  billCode: string;
  title: string;
  summary: string;
  stage: Stage;
  /** Per-bill stance, primarily from Claude semantic classification. */
  stance?: StanceType;
  /**
   * Per-dimension stance overrides. A bill can read differently across
   * dimensions (e.g. pro-development on data-center-energy, restrictive
   * on ai-consumer). Only set for multi-dimension bills — single-dim
   * bills defer to `stance`.
   */
  dimensionStances?: Partial<Record<Exclude<Dimension, "overall">, StanceType>>;
  impactTags: ImpactTag[];
  /** Stablecoin-specific tags for this bill (bill-level granularity). */
  stablecoinTags?: StablecoinTag[];
  category: LegislationCategory;
  updatedDate: string;
  partyOrigin?: "R" | "D" | "B";
  sourceUrl?: string;
  /** Facility IDs referenced by this bill/action. Populated for municipal
   *  actions where the action's title/summary mentions a specific data
   *  center by operator + location. Used to render "Related facilities"
   *  chips inside the expanded bill card. */
  relatedFacilityIds?: string[];
  legiscanUrl?: string;
  legiscanId?: number;
  sponsors?: string[];
  /** Roll call vote results, if the bill reached a floor vote. */
  voteTally?: {
    yea: number;
    nay: number;
    abstain: number;
    notVoting: number;
    passed: boolean;
    voteDate: string;
    rollCallId?: string;
  };
}

export type VotePosition = "yea" | "nay" | "abstain" | "not-voting";

/** A single recorded vote on a specific bill. */
export interface VoteRecord {
  /** Links to Legislation.id in our dataset. */
  billId: string;
  billCode: string;
  voteDate: string;
  position: VotePosition;
  /** Source roll call identifier for provenance. */
  rollCallId?: string;
  sourceUrl?: string;
}

/**
 * Vote alignment score — compares stated stance against actual votes.
 * Only computed when totalVotes >= 3.
 */
export interface AlignmentScore {
  /** 0–100. 100 = perfect alignment between stated position and votes. */
  score: number;
  totalVotes: number;
  alignedVotes: number;
  contradictoryVotes: number;
  /** Notable contradictions worth surfacing in the UI. */
  flaggedVotes?: Array<{
    billId: string;
    billCode: string;
    expectedPosition: VotePosition;
    actualPosition: VotePosition;
    reason: string;
  }>;
}

/**
 * A "suspicious vote" from the corruption-map dataset — a vote that
 * appears to align with a legislator's top donor industries rather
 * than their party or constituents. Cleaned + deduplicated form of
 * the raw entries in data/donors/politicians.json.
 */
export interface SuspiciousVote {
  billCode: string;
  billTitle: string;
  position: VotePosition;
  /** Which donor industry this vote appears to serve. */
  industry: string;
  /** Why this vote is flagged. One sentence. */
  reason: string;
  confidence: "high" | "medium";
}

export interface Legislator {
  id: string;
  name: string;
  role: string;
  party: string;
  stance: StanceType;
  /** Stable external ID for cross-referencing.
   *  - US: bioguide ID (e.g. "V000128")
   *  - UK: TheyWorkForYou person_id (e.g. "25320") */
  externalId?: string;
  /** FEC candidate ID from politicians.json (e.g. "H2TX00064"). */
  fecId?: string;
  /** "US" | "GB" | "EU" */
  country?: string;
  /** "senate" | "house" | "commons" | "lords" | "ep" */
  chamber?: string;
  /** State (US) or constituency (UK). */
  constituency?: string;
  /** Official portrait URL. Only set if confirmed working. */
  photoUrl?: string;
  votes?: VoteRecord[];
  alignment?: AlignmentScore;
  suspiciousVotes?: SuspiciousVote[];
  /** Combined capture score from donor data. 0–100. */
  captureScore?: number;
  totalRaised?: number;
  /** 1–2 sentence narrative of their AI / data-centre work (mainly UK/EU). */
  summary?: string;
  /** Up to ~4 bullet points highlighting positions, statements, or bills. */
  keyPoints?: string[];
  /** Bills they've worked on per the AI overview research — broader than
   *  what we formally track in data/legislation/. Sourced from Claude. */
  researchedBills?: Array<{
    code: string;
    title: string;
    role: string;
    year: number;
    summary?: string;
  }>;
  /** National party when `party` is an EP group (e.g. "SPD" under S&D). */
  nationalParty?: string;
  /** Top PACs by amount raised — same shape as donors/politicians.json. */
  topDonors?: Array<{ name: string; amount: number; industry: string }>;
  /** DIME score: -2 (most liberal) to +2 (most conservative). */
  dimeScore?: number;
  yearsInOffice?: number;
  formerLobbyist?: boolean;
  lobbyistBundled?: number;
  revolvingDoorConnections?: Array<{ name: string; firm?: string; industry?: string }>;
}

export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  date: string;
  url: string;
  summary?: string;
  /** Provenance of `summary` — "article" = fetched + summarized, "headline-only"
   *  = source was paywalled/unreachable so the summary was drafted from the
   *  headline alone. Used by the UI to show a "from headline" chip. */
  summarySource?: "article" | "headline-only";
}

export type LegalStatusEnum =
  | "legal"
  | "legal_with_restrictions"
  | "banned"
  | "partially_legal"
  | "unclear";

export type RegimeStatusEnum =
  | "finalized"
  | "pending_start"
  | "in_progress"
  | "draft"
  | "none";

export type ClassificationEnum =
  | "payment_instrument"
  | "crypto_asset"
  | "e_money"
  | "security"
  | "unclear";

export type PractitionerStatus = "ok" | "warn" | "no";

export interface PractitionerQA {
  text: string;
  note?: string;
  status: PractitionerStatus;
}

export type RegulatorStance = "favorable" | "cautious" | "restrictive" | "neutral";

export interface Regulator {
  id: string;
  name: string;
  acronym?: string;
  role: string;
  websiteUrl?: string;
  isPrimary: boolean;
  headName?: string;
  headTitle?: string;
  headStance?: RegulatorStance;
  headQuote?: string;
  headQuoteUrl?: string;
}

export interface StablecoinMeta {
  /** ISO 3166-1 alpha-2 country code */
  code?: string;
  nameZh?: string;
  flagImg?: string;
  lastUpdated?: string;

  summaryEn?: string;
  /** Jurisdiction-level stablecoin policy tags — drives map coloring and
   *  filter chips in the side panel. */
  tags?: StablecoinTag[];

  legalStatus: LegalStatusEnum;
  /** 1–5 integer */
  regulatoryClarity: number;
  regimeStatus: RegimeStatusEnum;
  classification?: ClassificationEnum;
  classificationNote?: string;

  allowsFiatBacked: boolean;
  allowsAlgorithmic: boolean;
  /** "partial" when some asset-backed types are allowed but not others */
  allowsAssetBacked: boolean | "partial";
  allowsAssetBackedNote?: string;

  /** 从业者速查 — Practitioner Quick Reference */
  canIssue?: PractitionerQA;
  foreignStablecoin?: PractitionerQA;
  reserveRequirement?: PractitionerQA;
  algorithmicStatus?: PractitionerQA;
  yieldToHolders?: PractitionerQA;

  regulators?: Regulator[];
}

export interface Entity {
  id: string;
  geoId: string;
  name: string;
  region: Region;
  level: GovLevel;
  stablecoinMeta?: StablecoinMeta;
  /** True for the regional overview entity (one per region). */
  isOverview?: boolean;
  /** True if this entity has a state-level drill-down (currently only US). */
  canDrillDown?: boolean;
  /** Lens-agnostic overall stance — max severity of stanceDatacenter
   *  and stanceAI. Used for the sidebar headline badge so a state with
   *  clear action on only one lens doesn't read as "No Action" when
   *  viewed under the other lens. Optional because older serialized
   *  entities may predate this field. */
  stance?: StanceType;
  /** Lens-scoped stance: aggregated over bills relevant to the data-center lens. */
  stanceDatacenter?: StanceType;
  /** Lens-scoped stance: aggregated over bills relevant to the AI-regulation lens. */
  stanceAI?: StanceType;
  contextBlurb: string;
  legislation: Legislation[];
  keyFigures: Legislator[];
  news: NewsItem[];
}

export type DataCenterStatus = "proposed" | "under-construction" | "operational";

export type ProposalGateStatus = "done" | "pending" | "blocked";

/** One gate in the project's approval pipeline — land, zoning, interconnect, etc. */
export interface ProposalGate {
  label: string;
  status: ProposalGateStatus;
  date?: string;
}

/** Structured detail about a proposed / under-construction facility. */
export interface ProposalInfo {
  /** Ordered milestones left-to-right. Rendered as a dot row in the tooltip. */
  process?: ProposalGate[];
  /** Who decides next, on what, when. */
  nextDecision?: { body: string; what: string; date?: string };
  /** What the site draws power from. */
  powerSource?: string;
  /** Water source or cooling strategy. */
  waterSource?: string;
  /** Named opposition groups or lawmakers. */
  opposition?: string[];
  /** Outstanding items before the project can move forward. */
  requirements?: string[];
}

export interface DataCenter {
  id: string;
  operator: string;
  location: string;
  state?: string;
  country?: string;
  lat: number;
  lng: number;
  capacityMW?: number;
  status: DataCenterStatus;
  yearBuilt?: number;
  yearProposed?: number;
  notes?: string;
  concerns?: string[];
  source: "epoch-ai" | "researched";
  primaryUser?: string;
  computeH100e?: number;
  costUSD?: number;
  proposal?: ProposalInfo;
}

/** Fuel type for a power plant, normalized from EIA energy_source_code. */
export type FuelType =
  | "natural-gas"
  | "coal"
  | "nuclear"
  | "hydro"
  | "solar"
  | "wind"
  | "biomass"
  | "geothermal"
  | "battery"
  | "oil"
  | "other";

export interface PowerPlant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacityMW: number;
  fuelType: FuelType;
  state: string;
  stateCode: string;
}

export interface StateEnergyProfile {
  state: string;
  stateCode: string;
  totalCapacityMW: number;
  totalGenerationMWh: number;
  /** Percentage breakdown of generation by source. Sorted largest first. */
  energyMix: Array<{
    source: FuelType;
    pct: number;
    generationMWh: number;
  }>;
  plantCount: number;
  year: number;
}

export const REGION_LABEL: Record<Region, string> = {
  na: "Americas",
  latam: "Americas",
  eu: "Europe",
  asia: "Asia-Pacific",
  africa: "Africa",
  oceania: "Asia-Pacific",
};

export const REGION_ORDER: Region[] = ["na", "eu", "asia", "africa"];
