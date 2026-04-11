/**
 * LegiScan client + counter.
 *
 * Free tier is 30,000 queries/month. This module enforces:
 *   - Hard stop at 5,000 queries per run (throws + exits).
 *   - Refuses to start if monthly count is already above 25,000.
 *   - Logs the running count to stdout on every call.
 *   - Persists the counter to data/meta/legiscan-query-count.json.
 *   - Automatically resets when the UTC calendar month changes.
 *
 * Import `fetchLegiscan(op, params)` to make counted calls. It returns
 * the parsed JSON response. All endpoints return `{ status, ... }` where
 * status is "OK" on success.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const COUNTER_PATH = join(ROOT, "data/meta/legiscan-query-count.json");

const HARD_STOP_PER_RUN = 5000;
const MONTHLY_SOFT_LIMIT = 25000;

interface CounterState {
  month: string;
  count: number;
}

function currentMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function loadCounter(): CounterState {
  if (!existsSync(COUNTER_PATH)) {
    mkdirSync(dirname(COUNTER_PATH), { recursive: true });
    const initial: CounterState = { month: currentMonth(), count: 0 };
    writeFileSync(COUNTER_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const raw = readFileSync(COUNTER_PATH, "utf8");
  const state = JSON.parse(raw) as CounterState;
  const thisMonth = currentMonth();
  if (state.month !== thisMonth) {
    const reset: CounterState = { month: thisMonth, count: 0 };
    writeFileSync(COUNTER_PATH, JSON.stringify(reset, null, 2));
    return reset;
  }
  return state;
}

function saveCounter(state: CounterState) {
  writeFileSync(COUNTER_PATH, JSON.stringify(state, null, 2));
}

let runCounter = 0;
let cachedMonthly: CounterState | null = null;

export function ensureBudgetOk() {
  if (!cachedMonthly) cachedMonthly = loadCounter();
  if (cachedMonthly.count >= MONTHLY_SOFT_LIMIT) {
    throw new Error(
      `[legiscan] monthly count ${cachedMonthly.count} is above soft limit ${MONTHLY_SOFT_LIMIT}. Refusing to run.`,
    );
  }
}

export async function fetchLegiscan<T = unknown>(
  op: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  if (!cachedMonthly) cachedMonthly = loadCounter();

  if (runCounter >= HARD_STOP_PER_RUN) {
    throw new Error(
      `[legiscan] per-run hard stop of ${HARD_STOP_PER_RUN} hit. Aborting.`,
    );
  }
  if (cachedMonthly.count >= MONTHLY_SOFT_LIMIT) {
    throw new Error(
      `[legiscan] monthly count ${cachedMonthly.count} above soft limit ${MONTHLY_SOFT_LIMIT}. Aborting.`,
    );
  }

  const key = process.env.LEGISCAN_API_KEY;
  if (!key) throw new Error("[legiscan] LEGISCAN_API_KEY not set");

  const url = new URL("https://api.legiscan.com/");
  url.searchParams.set("key", key);
  url.searchParams.set("op", op);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString());
  runCounter += 1;
  cachedMonthly.count += 1;
  saveCounter(cachedMonthly);

  if (runCounter % 25 === 0 || runCounter <= 3) {
    console.log(
      `[legiscan] run ${runCounter}/${HARD_STOP_PER_RUN} · month ${cachedMonthly.count}`,
    );
  }

  if (!res.ok) {
    throw new Error(`[legiscan] ${op} failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { status?: string; alert?: unknown };
  if (json.status && json.status !== "OK") {
    throw new Error(
      `[legiscan] ${op} non-OK: ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return json as T;
}

export function runCount(): number {
  return runCounter;
}

export function monthCount(): number {
  return cachedMonthly?.count ?? 0;
}
