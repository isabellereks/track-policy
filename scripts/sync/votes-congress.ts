/**
 * Fetch roll-call vote data for every federal bill with a legiscanId,
 * resolve each voter's bioguide ID via getSessionPeople, and write
 * data/votes/federal.json.
 *
 * LegiScan gives us everything we need:
 *   getBill(legiscanId)        → bill.votes[] (each with roll_call_id)
 *   getSessionPeople(session)  → people_id ↔ bioguide_id map (1 call per session)
 *   getRollCall(rollCallId)    → per-member votes + tallies
 *
 * Environment:
 *   LEGISCAN_API_KEY (required)
 *   VOTES_FORCE_REFRESH=1 to re-fetch bills already present in the output
 *
 * Run: npx tsx scripts/sync/votes-congress.ts
 */
import "../env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { fetchLegiscan, monthCount, runCount } from "./legiscan";

const FEDERAL_BILLS = "data/legislation/federal.json";
const OUT = "data/votes/federal.json";
const FORCE = process.env.VOTES_FORCE_REFRESH === "1";

interface FederalBill {
  id: string;
  billCode: string;
  title: string;
  stage: string;
  legiscanId?: number;
}

interface FederalFile {
  legislation: FederalBill[];
}

interface LegiscanVoteSummary {
  roll_call_id: number;
  date: string;
  desc: string;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  total: number;
  passed: 0 | 1;
  chamber: "H" | "S";
  url?: string;
}

interface LegiscanBill {
  bill_id: number;
  bill_number: string;
  session_id: number;
  votes?: LegiscanVoteSummary[];
}

interface LegiscanPerson {
  people_id: number;
  bioguide_id?: string;
  name: string;
  party: string;
  state_id: number;
}

interface LegiscanSessionPeople {
  session: { session_id: number; session_name: string; state_id: number };
  people: LegiscanPerson[];
}

interface LegiscanRollCall {
  roll_call_id: number;
  date: string;
  desc: string;
  chamber: "H" | "S";
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  total: number;
  passed: 0 | 1;
  votes: Array<{ people_id: number; vote_id: number; vote_text: string }>;
}

interface VoteEntry {
  legiscanRollCallId: number;
  voteDate: string;
  desc: string;
  chamber: "H" | "S";
  result: "passed" | "failed";
  tally: { yea: number; nay: number; abstain: number; notVoting: number };
  /** bioguide_id → raw position string ("Yea"/"Nay"/etc). */
  memberVotes: Record<string, string>;
  sourceUrl?: string;
}

interface VotesFile {
  generatedAt: string;
  votes: Record<
    string,
    {
      billCode: string;
      legiscanId: number;
      entries: VoteEntry[];
    }
  >;
}

function ensureDir(path: string) {
  const d = dirname(path);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function loadExisting(): VotesFile {
  if (!existsSync(OUT)) {
    return { generatedAt: new Date().toISOString(), votes: {} };
  }
  return JSON.parse(readFileSync(OUT, "utf8")) as VotesFile;
}

async function main() {
  const fed = JSON.parse(readFileSync(FEDERAL_BILLS, "utf8")) as FederalFile;
  const bills = fed.legislation.filter((b): b is FederalBill & { legiscanId: number } => Boolean(b.legiscanId));
  console.log(`[votes] ${bills.length} federal bills with legiscanId`);

  const out = loadExisting();

  // session_id → (people_id → bioguide_id)
  const sessionPeopleCache = new Map<number, Map<number, string>>();

  async function getPeopleMap(sessionId: number): Promise<Map<number, string>> {
    const cached = sessionPeopleCache.get(sessionId);
    if (cached) return cached;
    const resp = await fetchLegiscan<{ sessionpeople: LegiscanSessionPeople }>(
      "getSessionPeople",
      { id: sessionId },
    );
    const m = new Map<number, string>();
    for (const p of resp.sessionpeople.people ?? []) {
      if (p.bioguide_id) m.set(p.people_id, p.bioguide_id);
    }
    console.log(
      `[votes] session ${sessionId} (${resp.sessionpeople.session?.session_name ?? "?"}): ${m.size} people with bioguide IDs`,
    );
    sessionPeopleCache.set(sessionId, m);
    return m;
  }

  let billsWithVotes = 0;
  let skipped = 0;
  for (const bill of bills) {
    if (!FORCE && out.votes[bill.id]) {
      skipped++;
      continue;
    }
    const resp = await fetchLegiscan<{ bill: LegiscanBill }>("getBill", { id: bill.legiscanId });
    const summaries = resp.bill?.votes ?? [];
    if (summaries.length === 0) {
      out.votes[bill.id] = { billCode: bill.billCode, legiscanId: bill.legiscanId, entries: [] };
      continue;
    }

    const peopleMap = await getPeopleMap(resp.bill.session_id);

    const entries: VoteEntry[] = [];
    for (const summary of summaries) {
      const rc = await fetchLegiscan<{ roll_call: LegiscanRollCall }>(
        "getRollCall",
        { id: summary.roll_call_id },
      );
      const r = rc.roll_call;
      const memberVotes: Record<string, string> = {};
      for (const v of r.votes ?? []) {
        const bg = peopleMap.get(v.people_id);
        if (bg) memberVotes[bg] = v.vote_text;
      }
      entries.push({
        legiscanRollCallId: r.roll_call_id,
        voteDate: r.date,
        desc: r.desc,
        chamber: r.chamber,
        result: r.passed ? "passed" : "failed",
        tally: { yea: r.yea, nay: r.nay, abstain: r.nv, notVoting: r.absent },
        memberVotes,
        sourceUrl: summary.url,
      });
    }

    out.votes[bill.id] = {
      billCode: bill.billCode,
      legiscanId: bill.legiscanId,
      entries,
    };
    billsWithVotes++;
    console.log(
      `[votes] ${bill.billCode} (${bill.id}): ${entries.length} roll calls, ${entries.reduce((n, e) => n + Object.keys(e.memberVotes).length, 0)} member votes total`,
    );
  }

  out.generatedAt = new Date().toISOString();
  ensureDir(OUT);
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `[votes] wrote ${OUT} — ${billsWithVotes} bills enriched, ${skipped} skipped (cached), legiscan calls this run: ${runCount()} (month ${monthCount()})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
