/**
 * LegiScan → raw cache ingest.
 *
 * For each jurisdiction (US + 50 states), runs a small set of keyword
 * searches, dedupes, caps per jurisdiction, then fetches full bill details
 * via getBill. Everything is cached to data/raw/legiscan/ so re-runs don't
 * re-spend API budget.
 *
 * Writes one intermediate file per jurisdiction:
 *   data/raw/legiscan/bills/{STATE}.json
 *
 * A later step (legislation-classify) will read these and produce the final
 * data/legislation/{state}.json files with taxonomy + stance derived.
 *
 * Budget: ~200 searches + ~600 getBill = ~800 queries. Hard-capped at 5000.
 */

import "../env.js";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLegiscan, ensureBudgetOk, runCount } from "./legiscan.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const RAW_DIR = join(ROOT, "data/raw/legiscan");
const BILLS_DIR = join(RAW_DIR, "bills");
const SEARCH_DIR = join(RAW_DIR, "search");
const DETAIL_DIR = join(RAW_DIR, "detail");

const KEYWORDS = [
  "data center",
  "artificial intelligence",
  "deepfake",
  "facial recognition",
];

const JURISDICTIONS = [
  "US",
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const MAX_BILLS_PER_JURISDICTION = 12;
const MIN_RELEVANCE = 60;

interface SearchResult {
  relevance: number;
  bill_id: number;
  bill_number: string;
  title: string;
  url?: string;
  text_url?: string;
  research_url?: string;
  state?: string;
  state_link?: string;
  last_action?: string;
  last_action_date?: string;
}

interface SearchResponse {
  status: string;
  searchresult?: Record<string, SearchResult | { count?: number; page_total?: number }>;
}

interface BillResponse {
  status: string;
  bill?: {
    bill_id: number;
    change_hash?: string;
    session?: { session_name?: string; year_start?: number; year_end?: number };
    url?: string;
    state_link?: string;
    completed?: number;
    status?: number;
    status_date?: string;
    progress?: Array<{ date: string; event: number }>;
    state?: string;
    state_id?: number;
    bill_number: string;
    bill_type?: string;
    body?: string;
    body_id?: number;
    current_body?: string;
    title: string;
    description?: string;
    committee?: Record<string, unknown>;
    history?: Array<{
      date: string;
      action: string;
      chamber?: string;
      chamber_id?: number;
      importance?: number;
    }>;
    sponsors?: Array<{
      people_id: number;
      party_id?: string;
      party?: string;
      role_id?: number;
      role?: string;
      name: string;
      first_name?: string;
      middle_name?: string;
      last_name?: string;
      suffix?: string;
      nickname?: string;
      district?: string;
      ftm_eid?: number;
      votesmart_id?: number;
      opensecrets_id?: string;
      knowwho_pid?: number;
      ballotpedia?: string;
      sponsor_type_id?: number;
      sponsor_order?: number;
      committee_sponsor?: number;
      committee_id?: number;
    }>;
    subjects?: Array<{ subject_id: number; subject_name: string }>;
    texts?: Array<{
      doc_id: number;
      date: string;
      type: string;
      type_id: number;
      mime: string;
      mime_id: number;
      url: string;
      state_link: string;
      text_size: number;
    }>;
  };
}

function ensureDirs() {
  for (const d of [RAW_DIR, BILLS_DIR, SEARCH_DIR, DETAIL_DIR]) {
    mkdirSync(d, { recursive: true });
  }
}

function searchCachePath(state: string, keyword: string) {
  const slug = keyword.replace(/\s+/g, "_");
  return join(SEARCH_DIR, `${state}__${slug}.json`);
}

function billCachePath(billId: number) {
  return join(DETAIL_DIR, `${billId}.json`);
}

async function searchJurisdiction(state: string, keyword: string) {
  const cache = searchCachePath(state, keyword);
  if (existsSync(cache)) {
    return JSON.parse(readFileSync(cache, "utf8")) as SearchResponse;
  }
  const res = await fetchLegiscan<SearchResponse>("getSearch", {
    state,
    query: keyword,
    year: 2, // current year + prior
  });
  writeFileSync(cache, JSON.stringify(res, null, 2));
  return res;
}

async function fetchBillDetail(billId: number) {
  const cache = billCachePath(billId);
  if (existsSync(cache)) {
    return JSON.parse(readFileSync(cache, "utf8")) as BillResponse;
  }
  const res = await fetchLegiscan<BillResponse>("getBill", { id: billId });
  writeFileSync(cache, JSON.stringify(res, null, 2));
  return res;
}

function extractSearchItems(res: SearchResponse): SearchResult[] {
  if (!res.searchresult) return [];
  const items: SearchResult[] = [];
  for (const [k, v] of Object.entries(res.searchresult)) {
    if (k === "summary") continue;
    if (v && typeof v === "object" && "bill_id" in v) {
      items.push(v as SearchResult);
    }
  }
  return items;
}

async function ingestJurisdiction(state: string) {
  const existing = existsSync(join(BILLS_DIR, `${state}.json`))
    ? JSON.parse(
        readFileSync(join(BILLS_DIR, `${state}.json`), "utf8"),
      )
    : null;
  if (existing) {
    console.log(`[ingest] ${state}: cached, skipping (${existing.length} bills)`);
    return;
  }

  const unique = new Map<number, SearchResult>();
  for (const kw of KEYWORDS) {
    try {
      const res = await searchJurisdiction(state, kw);
      const items = extractSearchItems(res);
      for (const it of items) {
        if (it.relevance < MIN_RELEVANCE) continue;
        if (!unique.has(it.bill_id)) unique.set(it.bill_id, it);
      }
    } catch (e) {
      console.warn(`[ingest] ${state} search '${kw}' failed:`, (e as Error).message);
    }
  }

  // Sort by relevance desc, cap
  const top = Array.from(unique.values())
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_BILLS_PER_JURISDICTION);

  const detailed: BillResponse["bill"][] = [];
  for (const item of top) {
    try {
      const detail = await fetchBillDetail(item.bill_id);
      if (detail.bill) detailed.push(detail.bill);
    } catch (e) {
      console.warn(
        `[ingest] ${state} getBill ${item.bill_id} failed:`,
        (e as Error).message,
      );
    }
  }

  writeFileSync(
    join(BILLS_DIR, `${state}.json`),
    JSON.stringify(detailed, null, 2),
  );
  console.log(
    `[ingest] ${state}: ${detailed.length} bills kept (from ${unique.size} candidates) · run total ${runCount()}`,
  );
}

async function main() {
  ensureBudgetOk();
  ensureDirs();

  const only = process.argv[2]; // optional single state
  const list = only ? [only.toUpperCase()] : JURISDICTIONS;

  for (const state of list) {
    await ingestJurisdiction(state);
  }

  console.log(
    `\n[ingest] done · ${runCount()} queries used this run`,
  );
}

main().catch((e) => {
  console.error("[ingest] fatal:", e.message);
  process.exit(1);
});
