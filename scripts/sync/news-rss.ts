/**
 * Live RSS poller. Reads `data/news/feeds.json`, fetches each feed,
 * dedupes against existing items (by URL), summarizes new ones via
 * Haiku, and appends them to `data/news/summaries.json`.
 *
 * Designed to be run on a 15-minute cron — see
 * `.github/workflows/news-rss.yml`.
 *
 * Two-week guard:
 *   The script reads `data/news/.rss-started` (UTC ISO timestamp). When
 *   the file is older than 14 days, the script logs a notice and exits
 *   without making API calls. To restart, bump the timestamp:
 *       npx tsx scripts/sync/news-rss.ts --restart
 *   …or just delete the file and re-run.
 *
 * Cost: ~$0.001 per new item on Haiku. Realistic load is ~30-80
 * new items/day across the curated feeds, i.e. ~$1-3 over the full
 * 14-day window.
 */

import "../env.js";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  regenerateRegions,
  regionForEntity,
  type RegionKey,
} from "./news-regional-summary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const NEWS_PATH = join(ROOT, "data/news/summaries.json");
const FEEDS_PATH = join(ROOT, "data/news/feeds.json");
const STARTED_PATH = join(ROOT, "data/news/.rss-started");

const MODEL = "claude-haiku-4-5-20251001";
const MAX_DAYS = 14;
const FETCH_TIMEOUT_MS = 15_000;
const PER_FEED_LIMIT = 20;
const CONCURRENCY = 4;

interface FeedConfig {
  url: string;
  name: string;
  entity: string;
  topicHint?: string;
}

interface FeedsFile {
  feeds: FeedConfig[];
}

interface NewsItem {
  id: string;
  headline: string;
  source: string;
  date: string;
  url: string;
  summary?: string;
  summarySource?: "article" | "headline-only";
}

interface NewsFile {
  generatedAt: string;
  regional: Record<string, Record<string, unknown>>;
  entities: Record<string, { news: NewsItem[] }>;
}

interface ParsedItem {
  title: string;
  link: string;
  pubDate: string;
}

// ─── Two-week guard ────────────────────────────────────────────────
function checkStartedGuard(): boolean {
  if (process.argv.includes("--restart")) {
    writeFileSync(STARTED_PATH, new Date().toISOString() + "\n");
    console.log(`rss: restarted at ${new Date().toISOString()}`);
    return true;
  }
  if (!existsSync(STARTED_PATH)) {
    writeFileSync(STARTED_PATH, new Date().toISOString() + "\n");
    console.log(`rss: first run — initialized window starting now`);
    return true;
  }
  const startedRaw = readFileSync(STARTED_PATH, "utf8").trim();
  const started = new Date(startedRaw);
  if (Number.isNaN(started.getTime())) {
    console.warn(`rss: invalid timestamp in ${STARTED_PATH}; resetting to now`);
    writeFileSync(STARTED_PATH, new Date().toISOString() + "\n");
    return true;
  }
  const ageDays = (Date.now() - started.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > MAX_DAYS) {
    console.log(
      `rss: window expired (${ageDays.toFixed(1)} days since ${startedRaw}). ` +
        `Run with --restart to resume.`,
    );
    return false;
  }
  console.log(
    `rss: ${ageDays.toFixed(1)} days into the ${MAX_DAYS}-day window`,
  );
  return true;
}

// ─── Minimal RSS / Atom parser ─────────────────────────────────────
// We accept the most common RSS 2.0 (<item>) and Atom (<entry>) shapes.
// The goal isn't perfect spec coverage — it's "extract title, link, and
// date for every news outlet's standard feed without taking on a dep."

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    // Numeric entities first (decimal + hex) so the named pass below
    // doesn't pick up half-decoded fragments. WordPress feeds love these.
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

// Coarse relevance gate. A new item must mention at least one of these
// keywords in its headline, otherwise it never makes it to the Haiku
// summarize step. Saves cost AND keeps off-topic noise (e.g. medical
// cannabis, Hormuz blockade) out of an AI / data-center policy feed.
const RELEVANCE_RE = new RegExp(
  [
    "data\\s?cent(?:er|re)",
    "ai\\b",
    "artificial intelligence",
    "anthropic",
    "openai",
    "google",
    "microsoft",
    "nvidia",
    "meta\\b",
    "claude",
    "chatgpt",
    "compute",
    "hyperscale",
    "moratorium",
    "grid",
    "gigawatt",
    "\\d+\\s?(?:m|g)w\\b",
    "deepfake",
    "algorithm",
    "chatbot",
    "frontier model",
    "policy",
    "regulat",
    "legislat",
    "bill\\b",
    "executive order",
    "lawsuit",
    "court",
    "ftc",
    "doj",
    "white house",
  ].join("|"),
  "i",
);

function isRelevant(headline: string): boolean {
  return RELEVANCE_RE.test(headline);
}

function pickTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : null;
}

// Atom <link> uses an `href` attribute, not text content.
function pickAtomLink(block: string): string | null {
  const m = block.match(/<link\b[^>]*href="([^"]+)"[^>]*\/?>(?:[\s\S]*?<\/link>)?/i);
  return m ? decodeEntities(m[1]) : null;
}

function parseFeed(xml: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  // RSS 2.0
  const rssRe = /<item\b[\s\S]*?<\/item>/gi;
  for (const m of xml.matchAll(rssRe)) {
    const block = m[0];
    const title = pickTag(block, "title");
    const link = pickTag(block, "link");
    const date = pickTag(block, "pubDate") ?? pickTag(block, "dc:date") ?? "";
    if (title && link) out.push({ title, link, pubDate: date });
  }
  if (out.length > 0) return out;

  // Atom
  const atomRe = /<entry\b[\s\S]*?<\/entry>/gi;
  for (const m of xml.matchAll(atomRe)) {
    const block = m[0];
    const title = pickTag(block, "title");
    const link = pickAtomLink(block);
    const date = pickTag(block, "published") ?? pickTag(block, "updated") ?? "";
    if (title && link) out.push({ title, link, pubDate: date });
  }
  return out;
}

async function fetchFeed(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        "user-agent": "gov-index/1.0 (news poller)",
        accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ─── Article fetch + Haiku summarize ───────────────────────────────
async function fetchArticleText(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        accept: "text/html,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    return stripBoilerplate(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function stripBoilerplate(html: string): string | null {
  if (!html) return null;
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  s = s.replace(/<header[\s\S]*?<\/header>/gi, " ");
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  if (s.length < 200) return null;
  return s.slice(0, 4000);
}

const client = new Anthropic();

async function summarize(
  headline: string,
  source: string,
  date: string,
  body: string | null,
): Promise<{ summary: string; source: "article" | "headline-only" } | null> {
  const system =
    "You write one- to two-sentence neutral summaries of news stories about AI governance and data-center policy. Plain factual prose. No editorializing.";
  const userBlock = body
    ? `Headline: ${headline}\nSource: ${source} (${date})\n\nArticle body (trimmed):\n${body}\n\nWrite a 1–2 sentence neutral summary.`
    : `Headline: ${headline}\nSource: ${source} (${date})\n\nThe article body could not be retrieved. Write one factual sentence based on the headline alone — do not invent specifics.`;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 180,
      system,
      messages: [{ role: "user", content: userBlock }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text.trim())
      .join(" ")
      .trim();
    if (!text) return null;
    return { summary: text, source: body ? "article" : "headline-only" };
  } catch (err) {
    console.error("  summarize failed:", (err as Error).message);
    return null;
  }
}

// ─── Plumbing ──────────────────────────────────────────────────────
function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function slugifyId(name: string, url: string): string {
  // Stable id: feed slug + last url segment hash. Avoids id collisions
  // across feeds while staying human-readable in the JSON.
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  const hash = Math.abs(h).toString(36).slice(0, 8);
  return `rss-${slug}-${hash}`;
}

interface PendingItem {
  feed: FeedConfig;
  parsed: ParsedItem;
}

async function runPool<T>(items: T[], worker: (t: T) => Promise<void>) {
  let i = 0;
  const runners: Promise<void>[] = [];
  for (let k = 0; k < Math.min(CONCURRENCY, items.length); k++) {
    runners.push(
      (async () => {
        while (i < items.length) {
          await worker(items[i++]);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

async function main() {
  if (!checkStartedGuard()) return;

  const feedsCfg = JSON.parse(readFileSync(FEEDS_PATH, "utf8")) as FeedsFile;
  const news = JSON.parse(readFileSync(NEWS_PATH, "utf8")) as NewsFile;

  // Build the URL set we already have so we can dedupe new items in O(1).
  const seenUrls = new Set<string>();
  for (const ent of Object.values(news.entities)) {
    for (const item of ent.news) seenUrls.add(item.url);
  }

  // Pull every feed in parallel (network-bound, cheap to fan out).
  const fetched = await Promise.all(
    feedsCfg.feeds.map(async (f) => {
      const xml = await fetchFeed(f.url);
      if (!xml) {
        console.warn(`  feed FAIL: ${f.name} (${f.url})`);
        return [] as PendingItem[];
      }
      const parsed = parseFeed(xml).slice(0, PER_FEED_LIMIT);
      return parsed.map((p) => ({ feed: f, parsed: p }));
    }),
  );

  const candidates = fetched.flat();
  const pending = candidates.filter(
    (c) => !seenUrls.has(c.parsed.link) && isRelevant(c.parsed.title),
  );
  const filteredOut = candidates.length - pending.length;
  console.log(
    `rss: ${candidates.length} items across ${feedsCfg.feeds.length} feeds; ` +
      `${pending.length} new + relevant (${filteredOut} skipped: dup or off-topic)`,
  );
  if (pending.length === 0) return;

  let added = 0;
  const touchedRegions = new Set<RegionKey>();
  await runPool<PendingItem>(pending, async ({ feed, parsed }) => {
    // Don't reprocess the same URL if we've already added it in this run
    // (two feeds occasionally syndicate the same article).
    if (seenUrls.has(parsed.link)) return;
    seenUrls.add(parsed.link);

    const body = await fetchArticleText(parsed.link);
    const sum = await summarize(parsed.title, feed.name, parsed.pubDate, body);
    if (!sum) return;

    const entityBucket = news.entities[feed.entity];
    if (!entityBucket) {
      console.warn(`  no entity bucket "${feed.entity}" — skipping`);
      return;
    }

    entityBucket.news.unshift({
      id: slugifyId(feed.name, parsed.link),
      headline: parsed.title.slice(0, 220),
      source: feed.name,
      date: normalizeDate(parsed.pubDate),
      url: parsed.link,
      summary: sum.summary,
      summarySource: sum.source,
    });
    added++;
    touchedRegions.add(regionForEntity(feed.entity));

    // Checkpoint every few items so a transient crash doesn't lose work.
    if (added % 5 === 0) {
      writeFileSync(NEWS_PATH, JSON.stringify(news, null, 2) + "\n");
    }
  });

  // Re-sort each touched bucket newest-first.
  for (const ent of Object.values(news.entities)) {
    ent.news.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }

  // Regenerate the AI Overview for any region that saw new items —
  // keeps the prose in sync with the feed without paying the Sonnet
  // cost on polls that didn't find anything new.
  if (touchedRegions.size > 0) {
    console.log(
      `rss: regenerating AI overview for: ${[...touchedRegions].join(", ")}`,
    );
    const updated = await regenerateRegions(news, [...touchedRegions]);
    console.log(`rss: regenerated ${updated.length} region summary(ies)`);
  }

  news.generatedAt = new Date().toISOString();
  writeFileSync(NEWS_PATH, JSON.stringify(news, null, 2) + "\n");
  console.log(`rss: added ${added} new item(s)`);

  // The UI reads ENTITIES from lib/placeholder-data.ts (generated), not
  // from data/news/summaries.json directly — so the new items have to be
  // baked back in for them to actually reach the page. Skip when nothing
  // new landed (rebuild is fast but pointless on quiet polls).
  if (added > 0) {
    console.log("rss: rebuilding placeholder-data.ts so new items reach the UI");
    execSync("npx tsx scripts/build-placeholder.ts", { stdio: "inherit" });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
