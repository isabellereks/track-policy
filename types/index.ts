export type Region = "na" | "eu" | "asia";

/** Sub-view inside the NA region: country-level vs US-states drill-down. */
export type NaView = "countries" | "states";

export interface ViewTarget {
  region: Region;
  naView: NaView;
  selectedGeoId: string | null;
}

export type Stage =
  | "Filed"
  | "Committee"
  | "Floor"
  | "Enacted"
  | "Carried Over"
  | "Dead";

export type StanceType =
  | "restrictive"
  | "review"
  | "favorable"
  | "concerning"
  | "none";

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
  | "ai-criminal-justice";

export type Dimension =
  | "overall"
  | "environmental"
  | "energy"
  | "community"
  | "land-use";

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
  "data-center-siting": "Data Center Siting",
  "data-center-energy": "Data Center Energy",
  "ai-governance": "AI Governance",
  "synthetic-media": "Synthetic Media",
  "ai-healthcare": "AI in Healthcare",
  "ai-workforce": "AI in Workforce",
  "ai-education": "AI in Education",
  "ai-government": "AI in Government",
  "data-privacy": "Data Privacy",
  "ai-criminal-justice": "AI in Criminal Justice",
};

export const DIMENSION_LABEL: Record<Dimension, string> = {
  overall: "Overall stance",
  environmental: "Environmental impact",
  energy: "Energy & grid",
  community: "Community impact",
  "land-use": "Land use",
};

export interface Legislation {
  id: string;
  billCode: string;
  title: string;
  summary: string;
  stage: Stage;
  impactTags: ImpactTag[];
  category: LegislationCategory;
  updatedDate: string;
  partyOrigin?: "R" | "D" | "B";
  sourceUrl?: string;
  legiscanUrl?: string;
  legiscanId?: number;
  sponsors?: string[];
}

export interface Legislator {
  id: string;
  name: string;
  role: string;
  party: string;
  stance: StanceType;
  quote?: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  date: string;
  url: string;
}

export interface Entity {
  id: string;
  geoId: string;
  name: string;
  region: Region;
  level: GovLevel;
  /** True for the regional overview entity (one per region). */
  isOverview?: boolean;
  /** True if this entity has a state-level drill-down (currently only US). */
  canDrillDown?: boolean;
  stance: StanceType;
  contextBlurb: string;
  legislation: Legislation[];
  keyFigures: Legislator[];
  news: NewsItem[];
}

export const REGION_LABEL: Record<Region, string> = {
  na: "North America",
  eu: "European Union",
  asia: "Asia",
};

export const REGION_ORDER: Region[] = ["na", "eu", "asia"];
