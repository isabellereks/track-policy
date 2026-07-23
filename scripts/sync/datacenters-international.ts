/**
 * International data center research via Claude + web_search.
 *
 * Mirrors scripts/sync/datacenters-researched.ts but targets the set of
 * countries we already have international policy research for, so the
 * EU and Asia maps can show hyperscale and controversial facilities.
 *
 * Output: data/datacenters/international.json (merged into ALL_FACILITIES
 * via lib/datacenters.ts).
 *
 * Resume semantics: skips countries that already have at least one facility
 * in the existing file. Override with INTL_DC_FORCE_REFRESH=1.
 *
 * Budget: ~$0.15 per country × 12 countries ≈ $1.80.
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
const OUT_PATH = join(OUT_DIR, "international.json");

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_COUNTRIES = process.env.INTL_DC_MAX
  ? Number(process.env.INTL_DC_MAX)
  : Infinity;

interface CountryTarget {
  slug: string;
  name: string;
  countryCode: string; // ISO-3166-1 numeric (matches world-atlas ids)
  focus: string;
}

const PRIORITY_COUNTRIES: CountryTarget[] = [
  // ─── EU ───
  {
    slug: "netherlands",
    name: "Netherlands",
    countryCode: "NL",
    focus:
      "Amsterdam / Schiphol hyperscale cluster, Microsoft Middenmeer, Google Eemshaven, Holland Rijnland moratorium legacy",
  },
  {
    slug: "ireland",
    name: "Ireland",
    countryCode: "IE",
    focus:
      "Dublin hyperscale concentration, AWS, Microsoft, Meta, Google campuses, EirGrid capacity constraints, recent proposal refusals",
  },
  {
    slug: "sweden",
    name: "Sweden",
    countryCode: "SE",
    focus:
      "Luleå Meta/Facebook node, Stockholm colocation, EcoDataCenter Falun, green-grid advantage",
  },
  {
    slug: "finland",
    name: "Finland",
    countryCode: "FI",
    focus:
      "Google Hamina, Microsoft Espoo/Kirkkonummi region, district-heat recovery facilities, Nordic hyperscale hubs",
  },
  {
    slug: "germany",
    name: "Germany",
    countryCode: "DE",
    focus:
      "Frankfurt FRA cluster (Europe's largest), Berlin/Brandenburg growth, Microsoft north-rhine, Google Hanau",
  },
  {
    slug: "france",
    name: "France",
    countryCode: "FR",
    focus:
      "Paris / Île-de-France cluster, Marseille landing-station hub, OVHcloud facilities, Microsoft/Google France cloud regions",
  },
  {
    slug: "united-kingdom",
    name: "United Kingdom",
    countryCode: "GB",
    focus:
      "Slough / London Docklands cluster, new AI growth zones, Microsoft UK South, Google UK, recent proposed sites",
  },
  {
    slug: "spain",
    name: "Spain",
    countryCode: "ES",
    focus:
      "Madrid AZ buildout, Aragón water concerns (Meta, AWS, Microsoft Villanueva), Barcelona Supercomputing Center",
  },
  // ─── Asia ───
  {
    slug: "singapore",
    name: "Singapore",
    countryCode: "SG",
    focus:
      "Jurong / Loyang hyperscale, post-moratorium Green DC Roadmap, PUE 1.3 mandate facilities, Equinix SG campuses",
  },
  {
    slug: "japan",
    name: "Japan",
    countryCode: "JP",
    focus:
      "Tokyo/Chiba/Inzai cluster, Osaka growth, Microsoft Japan East/West, AWS Osaka, OpenAI/SB hyperscale plans",
  },
  {
    slug: "india",
    name: "India",
    countryCode: "IN",
    focus:
      "Mumbai/Navi Mumbai hyperscale, Hyderabad growth, Chennai cluster, Yotta, CtrlS, Adani ConneX, Microsoft India Central",
  },
  {
    slug: "australia",
    name: "Australia",
    countryCode: "AU",
    focus:
      "Sydney / Canberra cluster, AWS Sydney, Microsoft Canberra, NextDC Melbourne, new AI compute proposals",
  },
];

interface InternationalDcFile {
  generatedAt: string;
  facilities: DataCenter[];
}

function loadExisting(): InternationalDcFile {
  if (!existsSync(OUT_PATH)) return { generatedAt: "", facilities: [] };
  return JSON.parse(readFileSync(OUT_PATH, "utf8")) as InternationalDcFile;
}

function save(file: InternationalDcFile) {
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

async function researchCountry(
  anthropic: Anthropic,
  target: CountryTarget,
): Promise<DataCenter[]> {
  const currentDate = new Date().toISOString().slice(0, 10);
  const prompt = `Research data center facilities in ${target.name} as of ${currentDate}.

Prioritize projects announced, approved, delayed, cancelled, opened, or materially updated in the last 90 days.

Context focus: ${target.focus}

Include:
- Operational hyperscale and major colocation facilities
- Projects under construction
- Proposed/planned facilities (especially controversial ones)
- Sites facing community opposition, grid constraints, or environmental concerns

Return ONLY a JSON array (no prose, no markdown fences) with 6-10 notable facilities.
Each element MUST match this shape:

{
  "id": "short-slug-for-this-facility",
  "operator": "company name",
  "location": "City, Region, ${target.name}",
  "country": "${target.name}",
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
- If you can't verify coordinates within ~5 km, omit that facility
- concerns must be from: noise-vibration, local-zoning, local-control, residential-proximity, property-values, grid-capacity, energy-rates, water-consumption, water-infrastructure, carbon-emissions, environmental-review
- status MUST be one of: operational, under-construction, proposed
- Set "country" exactly to "${target.name}"`;

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
    return parsed.filter(
      (f) =>
        typeof f.lat === "number" &&
        typeof f.lng === "number" &&
        f.lat !== 0 &&
        f.lng !== 0,
    );
  } catch (e) {
    console.warn(
      `[intl-dc] ${target.name} parse failed:`,
      (e as Error).message,
    );
    return [];
  }
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("[intl-dc] ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey: key });
  const existing = loadExisting();
  const existingByCountry = new Set<string>();
  for (const f of existing.facilities) {
    if (f.country) existingByCountry.add(f.country);
  }

  const force = process.env.INTL_DC_FORCE_REFRESH === "1";
  const todo = PRIORITY_COUNTRIES.filter(
    (c) => force || !existingByCountry.has(c.name),
  ).slice(0, MAX_COUNTRIES === Infinity ? undefined : MAX_COUNTRIES);

  console.log(
    `[intl-dc] ${todo.length} countries to research (of ${PRIORITY_COUNTRIES.length})`,
  );

  for (const target of todo) {
    console.log(`[intl-dc]   ${target.name}`);
    try {
      const facilities = await researchCountry(anthropic, target);
      if (force) {
        existing.facilities = existing.facilities.filter(
          (facility) => facility.country !== target.name,
        );
      }
      for (const f of facilities) {
        if (!f.id) continue;
        if (!f.id.startsWith("intl-")) {
          f.id = `intl-${target.countryCode.toLowerCase()}-${slugify(f.id)}`;
        }
        if (!f.source) f.source = "researched";
      }
      const existingIds = new Set(existing.facilities.map((f) => f.id));
      for (const f of facilities) {
        if (!existingIds.has(f.id)) existing.facilities.push(f);
      }
      existing.generatedAt = new Date().toISOString();
      save(existing);
      console.log(`[intl-dc]     → ${facilities.length} new facilities`);
    } catch (e) {
      console.warn(`[intl-dc]   ${target.name} failed:`, (e as Error).message);
    }
  }
  console.log(
    `[intl-dc] done · ${existing.facilities.length} total international facilities`,
  );
}

main().catch((e) => {
  console.error("[intl-dc] fatal:", e.message);
  process.exit(1);
});
