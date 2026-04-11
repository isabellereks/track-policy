/**
 * Populate news summaries via Anthropic Claude with the web-search tool.
 *
 * Writes: data/news/summaries.json
 *
 * Shape:
 * {
 *   "generatedAt": "...",
 *   "regional": { "na": { "summary": ..., "keyDevelopments": [...] }, ... },
 *   "entities": { "Virginia": { "news": [...] }, ... }
 * }
 *
 * Budget: 3 regional summaries + N per-entity summaries. Each Claude call
 * with web_search may use ~2-5 searches. Expect ~$1-3 total.
 *
 * To control cost on a first run, this script accepts an optional env var
 * `NEWS_MAX_ENTITIES` (default: 12) that caps how many per-entity news
 * calls are made. Only entities with the most legislation are included
 * in the first pass, so repeated runs can grow coverage incrementally.
 */

import "../env.js";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const NEWS_DIR = join(ROOT, "data/news");
const NEWS_PATH = join(NEWS_DIR, "summaries.json");
const FEDERAL_LEG = join(ROOT, "data/legislation/federal.json");
const STATES_DIR = join(ROOT, "data/legislation/states");

const MODEL = "claude-sonnet-4-6";
const MAX_ENTITIES = Number(process.env.NEWS_MAX_ENTITIES ?? 12);

interface LegFile {
  state: string;
  legislation: Array<unknown>;
}

interface KeyDevelopment {
  headline: string;
  source: string;
  date: string;
  url: string;
  relatedEntity?: string;
}

interface RegionalNews {
  summary: string;
  keyDevelopments: KeyDevelopment[];
}

interface EntityNews {
  news: Array<{ id: string; headline: string; source: string; date: string; url: string }>;
}

interface NewsFile {
  generatedAt: string;
  regional: Record<string, RegionalNews>;
  entities: Record<string, EntityNews>;
}

function loadExisting(): NewsFile {
  if (existsSync(NEWS_PATH)) {
    return JSON.parse(readFileSync(NEWS_PATH, "utf8")) as NewsFile;
  }
  return {
    generatedAt: "",
    regional: {},
    entities: {},
  };
}

function save(data: NewsFile) {
  mkdirSync(NEWS_DIR, { recursive: true });
  writeFileSync(NEWS_PATH, JSON.stringify(data, null, 2));
}

function parseJsonBlock(text: string): unknown {
  // Strip leading/trailing prose and fenced blocks
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  const firstArr = candidate.indexOf("[");
  const lastArr = candidate.lastIndexOf("]");
  const useArr =
    firstArr >= 0 && (first < 0 || firstArr < first);
  const slice = useArr
    ? candidate.slice(firstArr, lastArr + 1)
    : candidate.slice(first, last + 1);
  return JSON.parse(slice);
}

function extractText(msg: Anthropic.Messages.Message): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}

async function askClaude(
  anthropic: Anthropic,
  prompt: string,
): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });
  return extractText(msg);
}

async function fetchRegionalNews(
  anthropic: Anthropic,
  region: "na" | "eu" | "asia",
): Promise<RegionalNews> {
  const scope =
    region === "na"
      ? "the United States (federal + state levels) and Canada"
      : region === "eu"
        ? "the European Union and individual member states"
        : "Japan, China, South Korea, Singapore, and India";

  const prompt = `Search for the most significant AI policy and data-center policy developments in ${scope} from January 2026 through April 2026.

Return ONLY a JSON object matching this shape (no prose, no markdown):

{
  "summary": "3-4 sentence editorial overview of what happened",
  "keyDevelopments": [
    {
      "headline": "specific factual headline",
      "source": "publication name",
      "date": "YYYY-MM-DD",
      "url": "full URL",
      "relatedEntity": "specific state, country, or 'Federal'"
    }
  ]
}

Include 4-6 key developments. Focus on: bills that passed or died, moratoriums enacted, major regulatory actions, notable political developments. Be specific with bill codes where relevant.`;

  const text = await askClaude(anthropic, prompt);
  try {
    const parsed = parseJsonBlock(text) as RegionalNews;
    return parsed;
  } catch (e) {
    console.warn(`[news] regional ${region} parse failed, using empty:`, (e as Error).message);
    return { summary: "", keyDevelopments: [] };
  }
}

async function fetchEntityNews(
  anthropic: Anthropic,
  entityName: string,
): Promise<EntityNews> {
  const prompt = `Search for recent news (January 2026 to April 2026) about AI policy or data-center policy specifically in ${entityName}.

Return ONLY a JSON array of 3-5 news items with this exact shape (no prose):

[
  { "headline": "specific factual headline", "source": "publication", "date": "YYYY-MM-DD", "url": "full URL" }
]

Focus on legislation, moratoriums, enforcement actions, and political developments. Be specific with bill codes where relevant.`;

  const text = await askClaude(anthropic, prompt);
  try {
    const parsed = parseJsonBlock(text) as Array<{
      headline: string;
      source: string;
      date: string;
      url: string;
    }>;
    return {
      news: parsed.map((n, i) => ({
        id: `${entityName.toLowerCase().replace(/\s+/g, "-")}-${i}`,
        ...n,
      })),
    };
  } catch (e) {
    console.warn(`[news] entity ${entityName} parse failed:`, (e as Error).message);
    return { news: [] };
  }
}

function pickTopEntities(): string[] {
  // Federal first, then states alphabetically (we already filter to those
  // with legislation content, and every state that came out of LegiScan has
  // 8-12 bills — alphabetical gives deterministic, resumable coverage).
  const entries: Array<{ name: string; count: number }> = [];
  if (existsSync(FEDERAL_LEG)) {
    const f = JSON.parse(readFileSync(FEDERAL_LEG, "utf8")) as LegFile;
    entries.push({ name: "United States", count: f.legislation.length });
  }
  if (existsSync(STATES_DIR)) {
    const files = readdirSync(STATES_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const file of files) {
      const s = JSON.parse(
        readFileSync(join(STATES_DIR, file), "utf8"),
      ) as LegFile;
      entries.push({ name: s.state, count: s.legislation.length });
    }
  }
  // Federal stays first; cap to MAX_ENTITIES
  return entries.slice(0, MAX_ENTITIES).map((e) => e.name);
}

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("[news] ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  const anthropic = new Anthropic({ apiKey: key });
  const existing = loadExisting();

  // Regional summaries
  const regions: Array<"na" | "eu" | "asia"> = ["na", "eu", "asia"];
  for (const r of regions) {
    console.log(`[news] fetching regional summary · ${r}`);
    try {
      existing.regional[r] = await fetchRegionalNews(anthropic, r);
    } catch (e) {
      console.warn(`[news] regional ${r} fetch failed:`, (e as Error).message);
    }
  }

  // Per-entity news — skip entities that already have results unless
  // NEWS_FORCE_REFRESH is set. Lets you incrementally top off coverage.
  const entityNames = pickTopEntities();
  const force = process.env.NEWS_FORCE_REFRESH === "1";
  const todo = entityNames.filter(
    (name) => force || !(existing.entities[name]?.news?.length),
  );
  console.log(
    `[news] per-entity news for ${todo.length} entities (of ${entityNames.length} candidates)`,
  );
  for (const name of todo) {
    console.log(`[news]   ${name}`);
    try {
      existing.entities[name] = await fetchEntityNews(anthropic, name);
    } catch (e) {
      console.warn(`[news]   ${name} failed:`, (e as Error).message);
    }
  }

  existing.generatedAt = new Date().toISOString();
  save(existing);
  console.log(`[news] saved → data/news/summaries.json`);
}

main().catch((e) => {
  console.error("[news] fatal:", e.message);
  process.exit(1);
});
