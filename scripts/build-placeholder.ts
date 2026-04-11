/**
 * Regenerate lib/placeholder-data.ts from data/*.json.
 *
 * Composes the North America entity list from:
 *   - data/legislation/federal.json            → US federal entity
 *   - data/legislation/states/*.json           → all 50 US states
 *   - data/figures/federal.json                → US federal key figures
 *   - data/figures/states/{State}.json         → per-state key figures
 *
 * The EU and Asia entities are preserved via lib/international-entities.ts
 * (hand-curated). This script does NOT touch that file.
 *
 * The Canada entity and regional overviews (North America, EU, Asia) are
 * also produced here from lightweight inline definitions.
 *
 * Output: lib/placeholder-data.ts (overwritten, deterministic).
 */

import "./env.js";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FEDERAL_LEG = join(ROOT, "data/legislation/federal.json");
const STATES_LEG_DIR = join(ROOT, "data/legislation/states");
const FEDERAL_FIGURES = join(ROOT, "data/figures/federal.json");
const STATES_FIGURES_DIR = join(ROOT, "data/figures/states");
const NEWS_PATH = join(ROOT, "data/news/summaries.json");
const OUT = join(ROOT, "lib/placeholder-data.ts");

interface JsonLegFile {
  state: string;
  stateCode: string;
  region: string;
  stance: string;
  lastUpdated: string;
  contextBlurb: string;
  legislation: unknown[];
}

interface JsonFigure {
  id: string;
  name: string;
  role: string;
  party: string;
  stance: string;
  quote?: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function toLegislator(f: JsonFigure): {
  id: string;
  name: string;
  role: string;
  party: string;
  stance: string;
  quote?: string;
} {
  return {
    id: f.id,
    name: f.name,
    role: f.role,
    party: f.party,
    stance: f.stance,
    ...(f.quote ? { quote: f.quote } : {}),
  };
}

function loadFigures(path: string, limit: number): ReturnType<typeof toLegislator>[] {
  if (!existsSync(path)) return [];
  const arr = readJson<JsonFigure[]>(path);
  return arr.slice(0, limit).map(toLegislator);
}

interface NewsFile {
  entities?: Record<string, { news: Array<{ id: string; headline: string; source: string; date: string; url: string }> }>;
}

const newsData: NewsFile = existsSync(NEWS_PATH)
  ? (readJson(NEWS_PATH) as NewsFile)
  : {};

function loadEntityNews(entityName: string) {
  return newsData.entities?.[entityName]?.news ?? [];
}

/** JSON.stringify that emits TS-style identifier keys where possible. */
function toTs(value: unknown, indent = 2, level = 0): string {
  const pad = " ".repeat(level * indent);
  const pad2 = " ".repeat((level + 1) * indent);
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${pad2}${toTs(v, indent, level + 1)}`);
    return `[\n${items.join(",\n")},\n${pad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return "{}";
    const lines = entries.map(
      ([k, v]) => `${pad2}${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${toTs(v, indent, level + 1)}`,
    );
    return `{\n${lines.join(",\n")},\n${pad}}`;
  }
  return "null";
}

function buildFederalEntity() {
  const leg = readJson<JsonLegFile>(FEDERAL_LEG);
  const figures = loadFigures(FEDERAL_FIGURES, 10);
  return {
    id: "us-federal",
    geoId: "840",
    name: "United States",
    region: "na",
    level: "federal",
    isOverview: true,
    canDrillDown: true,
    stance: leg.stance,
    contextBlurb: leg.contextBlurb,
    legislation: leg.legislation,
    keyFigures: figures,
    news: loadEntityNews("United States"),
  };
}

function buildStateEntities() {
  const files = readdirSync(STATES_LEG_DIR).filter((f) => f.endsWith(".json"));
  const entities: unknown[] = [];
  for (const f of files) {
    const leg = readJson<JsonLegFile>(join(STATES_LEG_DIR, f));
    const stateName = leg.state;
    const figuresPath = join(STATES_FIGURES_DIR, `${slugify(stateName)}.json`);
    const figures = loadFigures(figuresPath, 5);
    entities.push({
      id: slugify(stateName),
      geoId: stateName,
      name: stateName,
      region: "na",
      level: "state",
      stance: leg.stance,
      contextBlurb: leg.contextBlurb,
      legislation: leg.legislation,
      keyFigures: figures,
      news: loadEntityNews(stateName),
    });
  }
  // Stable alphabetical order
  entities.sort((a: any, b: any) => a.name.localeCompare(b.name));
  return entities;
}

function buildCanadaEntity() {
  return {
    id: "canada-federal",
    geoId: "124",
    name: "Canada",
    region: "na",
    level: "federal",
    stance: "review",
    contextBlurb:
      "Canada's AIDA (Artificial Intelligence and Data Act) framework is under federal review, with provinces running their own studies on data center siting.",
    legislation: [],
    keyFigures: [],
    news: [],
  };
}

function main() {
  const na: unknown[] = [];
  na.push(buildFederalEntity());
  na.push(buildCanadaEntity());
  na.push(...buildStateEntities());

  const body = `import type { Entity, Region } from "@/types";
import { INTERNATIONAL_ENTITIES } from "./international-entities";

/**
 * Generated by scripts/build-placeholder.ts from data/legislation/ and
 * data/figures/. Do not edit US entities here — they will be overwritten
 * on the next sync run. Edit data/*.json or the sync scripts instead.
 *
 * EU + Asia + Canada-adjacent entities live in lib/international-entities.ts
 * and are hand-curated.
 */

const NA_ENTITIES: Entity[] = ${toTs(na, 2, 0)};

export const ENTITIES: Entity[] = [...NA_ENTITIES, ...INTERNATIONAL_ENTITIES];

export function getEntity(geoId: string, region: Region): Entity | null {
  return ENTITIES.find((e) => e.geoId === geoId && e.region === region) ?? null;
}

export function getOverviewEntity(region: Region): Entity | null {
  return ENTITIES.find((e) => e.region === region && e.isOverview) ?? null;
}

export function getEntitiesByRegion(region: Region): Entity[] {
  return ENTITIES.filter((e) => e.region === region);
}
`;

  writeFileSync(OUT, body);
  console.log(
    `[build-placeholder] wrote ${na.length} NA entities + INTERNATIONAL_ENTITIES passthrough → lib/placeholder-data.ts`,
  );
}

main();
