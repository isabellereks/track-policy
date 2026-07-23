/**
 * Researched supplemental data center dataset via Claude + web search.
 *
 * The Epoch AI dataset only covers ~25 frontier hyperscale facilities.
 * This script asks Claude to research a broader set per priority state —
 * proposed sites, projects under construction, controversial community-
 * opposition hot-spots, smaller colocation facilities.
 *
 * Output: data/datacenters/researched.json (merged later by lib/datacenters.ts)
 *
 * Resume semantics: by default, skips states that already have at least one
 * researched facility in the existing file. Override with
 * RESEARCHED_FORCE_REFRESH=1.
 *
 * Budget: ~$0.15 per state × 10 states ≈ $1.50.
 */

import "../env.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import type { DataCenter } from "../../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "data/datacenters");
const OUT_PATH = join(OUT_DIR, "researched.json");

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_STATES = process.env.RESEARCHED_MAX
  ? Number(process.env.RESEARCHED_MAX)
  : Infinity;

// Ten states with the most active data center markets where Epoch only
// captures a few sites.
const PRIORITY_STATES: Array<{ name: string; code: string }> = [
  { name: "Virginia", code: "VA" },
  { name: "Oregon", code: "OR" },
  { name: "Texas", code: "TX" },
  { name: "Georgia", code: "GA" },
  { name: "Arizona", code: "AZ" },
  { name: "Iowa", code: "IA" },
  { name: "Washington", code: "WA" },
  { name: "North Carolina", code: "NC" },
  { name: "Ohio", code: "OH" },
  { name: "New York", code: "NY" },
];

interface ResearchedFile {
  generatedAt: string;
  facilities: DataCenter[];
}

function loadExisting(): ResearchedFile {
  if (!existsSync(OUT_PATH)) {
    return { generatedAt: "", facilities: [] };
  }
  return JSON.parse(readFileSync(OUT_PATH, "utf8")) as ResearchedFile;
}

function save(file: ResearchedFile) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(file, null, 2));
}

function parseJsonArray(text: string): unknown[] {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const first = candidate.indexOf("[");
  const last = candidate.lastIndexOf("]");
  if (first < 0 || last < first) return [];
  return JSON.parse(candidate.slice(first, last + 1));
}

function extractText(msg: Anthropic.Messages.Message): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function researchState(
  anthropic: Anthropic,
  state: string,
  stateCode: string,
): Promise<DataCenter[]> {
  const currentDate = new Date().toISOString().slice(0, 10);
  const prompt = `Research data center facilities in ${state} (USA) as of ${currentDate}.

Prioritize projects announced, approved, delayed, cancelled, opened, or materially updated in the last 90 days.

Include:
- Operational hyperscale and major colocation facilities
- Projects under construction
- Proposed/planned projects (especially controversial ones)
- Facilities facing community opposition or environmental concerns

EXCLUDE these facilities that are already in our Epoch AI dataset:
- Microsoft Fairwater (any location)
- OpenAI Stargate Abilene TX
- QTS Richmond VA
- Meta Hyperion Louisiana
- xAI Colossus Memphis TN
- Google Council Bluffs, Cedar Rapids, Omaha, New Albany OH, Pryor OK
- Amazon Madison Mississippi, Ridgeland MS
- Crusoe Abilene
- Meta Temple TX
- Microsoft Goodyear AZ
- Vantage TX1
- Fluidstack Lake Mariner NY
- OpenAI Stargate Shackelford County TX

Return ONLY a JSON array (no prose, no markdown fences) with 5-10 notable non-Epoch facilities.
Each element MUST match this shape:

{
  "id": "short-slug-for-this-facility",
  "operator": "company name",
  "location": "City, State",
  "state": "${stateCode}",
  "country": "United States",
  "lat": 00.0000,
  "lng": -00.0000,
  "capacityMW": 100,
  "status": "operational" | "under-construction" | "proposed",
  "yearBuilt": 2023,
  "yearProposed": 2025,
  "notes": "1-2 sentences describing the facility and any notable context",
  "concerns": ["noise-vibration", "grid-capacity"],
  "source": "researched",
  "primaryUser": "Meta"
}

CRITICAL:
- lat and lng must be real, accurate decimal coordinates
- Only include facilities you have credible information about
- If you can't verify coordinates, omit that facility
- concerns must be from: noise-vibration, local-zoning, local-control, residential-proximity, property-values, grid-capacity, energy-rates, water-consumption, water-infrastructure, carbon-emissions, environmental-review
- status MUST be one of: operational, under-construction, proposed`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 8,
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });
  const text = extractText(msg);
  try {
    const parsed = parseJsonArray(text) as DataCenter[];
    // Basic sanity filter — require lat/lng
    return parsed.filter(
      (f) =>
        typeof f.lat === "number" &&
        typeof f.lng === "number" &&
        f.lat !== 0 &&
        f.lng !== 0,
    );
  } catch (e) {
    console.warn(
      `[researched] ${state} parse failed:`,
      (e as Error).message,
    );
    return [];
  }
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("[researched] ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey: key });
  const existing = loadExisting();
  const existingByState = new Set<string>();
  for (const f of existing.facilities) {
    if (f.state) existingByState.add(f.state);
  }

  const force = process.env.RESEARCHED_FORCE_REFRESH === "1";
  const todo = PRIORITY_STATES.filter(
    (s) => force || !existingByState.has(s.code),
  ).slice(0, MAX_STATES === Infinity ? undefined : MAX_STATES);

  console.log(
    `[researched] ${todo.length} states to research (of ${PRIORITY_STATES.length})`,
  );

  for (const { name, code } of todo) {
    console.log(`[researched]   ${name}`);
    try {
      const facilities = await researchState(anthropic, name, code);
      if (force) {
        existing.facilities = existing.facilities.filter(
          (facility) => facility.state !== code,
        );
      }
      // Stamp id with state prefix if Claude returned bare slugs
      for (const f of facilities) {
        if (!f.id) continue;
        if (!f.id.startsWith("researched-")) {
          f.id = `researched-${code.toLowerCase()}-${slugify(f.id)}`;
        }
        if (!f.source) f.source = "researched";
      }
      // Merge into existing (dedupe on id)
      const existingIds = new Set(existing.facilities.map((f) => f.id));
      for (const f of facilities) {
        if (!existingIds.has(f.id)) existing.facilities.push(f);
      }
      existing.generatedAt = new Date().toISOString();
      save(existing);
      console.log(`[researched]     → ${facilities.length} new facilities`);
    } catch (e) {
      console.warn(`[researched]   ${name} failed:`, (e as Error).message);
    }
  }
  console.log(`[researched] done · ${existing.facilities.length} total facilities`);
}

main().catch((e) => {
  console.error("[researched] fatal:", e.message);
  process.exit(1);
});
