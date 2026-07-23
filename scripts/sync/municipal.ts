/**
 * Research county-level data center and AI policy actions via Claude
 * with the web_search tool. Writes one file per state under
 * data/municipal/{state-slug}.json.
 *
 * Priority states: Virginia, Oregon, Georgia, New York, South Carolina,
 * Wisconsin, Minnesota, Maryland, Connecticut, Tennessee, North Carolina,
 * Texas. These are the states with the most known municipal-level data
 * center activity.
 *
 * Resumes by skipping any state that already has a non-empty file unless
 * MUNICIPAL_FORCE_REFRESH=1 is set. Cap per run via MUNICIPAL_MAX env var.
 *
 * Budget: ~$0.10 per state × 12 states ≈ $1.20.
 */

import "../env.js";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "data/municipal");

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_STATES = process.env.MUNICIPAL_MAX
  ? Number(process.env.MUNICIPAL_MAX)
  : Infinity;

const PRIORITY_STATES = [
  "Virginia",
  "Oregon",
  "Georgia",
  "New York",
  "South Carolina",
  "Wisconsin",
  "Minnesota",
  "Maryland",
  "Connecticut",
  "Tennessee",
  "North Carolina",
  "Texas",
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseJsonBlock(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const firstArr = candidate.indexOf("[");
  const lastArr = candidate.lastIndexOf("]");
  const firstObj = candidate.indexOf("{");
  const lastObj = candidate.lastIndexOf("}");
  // Prefer the outermost array if present
  if (firstArr >= 0 && lastArr > firstArr) {
    return JSON.parse(candidate.slice(firstArr, lastArr + 1));
  }
  return JSON.parse(candidate.slice(firstObj, lastObj + 1));
}

function extractText(msg: Anthropic.Messages.Message): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}

async function researchState(
  anthropic: Anthropic,
  state: string,
): Promise<unknown[]> {
  const currentDate = new Date().toISOString().slice(0, 10);
  const prompt = `Search for county and municipal data-center and AI policy actions in ${state} as of ${currentDate}.

Prioritize actions or material status changes from the last 90 days, while retaining older actions that are still in effect.

Include:
- Enacted moratoriums or construction pauses
- Zoning changes restricting data centers (setbacks, noise limits, height caps)
- Proposed local ordinances
- Community opposition that led to government action
- Municipal utility decisions about data-center power rates

Return ONLY a JSON array (no prose, no markdown fences) where each element matches:

{
  "id": "loudoun-county-va",
  "name": "Loudoun County",
  "fips": "51107",
  "state": "${state}",
  "stateCode": "<2-letter state code>",
  "type": "county",
  "actions": [
    {
      "title": "...",
      "date": "YYYY-MM-DD",
      "status": "enacted" | "proposed" | "under-review" | "failed",
      "summary": "one-sentence plain-language description",
      "sourceUrl": "https://..."
    }
  ],
  "concerns": [
    "noise-vibration" | "local-zoning" | "local-control" | "residential-proximity" | "property-values" | "grid-capacity" | "water-consumption" | "carbon-emissions" | "water-infrastructure" | "environmental-review"
  ],
  "contextBlurb": "2-3 sentences about this county's data-center situation"
}

CRITICAL: include the 5-digit FIPS code for each county. If you don't know the exact FIPS, omit that entry — do NOT guess.

Return between 1 and 8 entries. If no relevant municipal actions exist, return [].`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 6,
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });
  const text = extractText(msg);
  try {
    const parsed = parseJsonBlock(text);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn(`[municipal] ${state} parse failed:`, (e as Error).message);
    return [];
  }
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("[municipal] ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey: key });
  mkdirSync(OUT_DIR, { recursive: true });

  const force = process.env.MUNICIPAL_FORCE_REFRESH === "1";
  const todo = PRIORITY_STATES.filter((state) => {
    const path = join(OUT_DIR, `${slugify(state)}.json`);
    if (force) return true;
    if (!existsSync(path)) return true;
    try {
      const existing = JSON.parse(readFileSync(path, "utf8")) as unknown[];
      return !Array.isArray(existing) || existing.length === 0;
    } catch {
      return true;
    }
  }).slice(0, MAX_STATES === Infinity ? undefined : MAX_STATES);

  console.log(
    `[municipal] ${todo.length} states to research (of ${PRIORITY_STATES.length} priority)`,
  );
  for (const state of todo) {
    console.log(`[municipal]   ${state}`);
    try {
      const entries = await researchState(anthropic, state);
      const path = join(OUT_DIR, `${slugify(state)}.json`);
      writeFileSync(path, JSON.stringify(entries, null, 2));
      console.log(`[municipal]     → ${entries.length} entries`);
    } catch (e) {
      console.warn(`[municipal]   ${state} failed:`, (e as Error).message);
    }
  }
  console.log(`[municipal] done`);
}

main().catch((e) => {
  console.error("[municipal] fatal:", e.message);
  process.exit(1);
});
