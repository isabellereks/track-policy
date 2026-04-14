/**
 * Merge roll-call vote data into:
 *  - data/legislation/federal.json  (adds `voteTally` to each bill)
 *  - data/politicians/us-enriched.json  (adds `votes[]` + `alignment`)
 *
 * Pulls from:
 *   data/votes/federal.json
 *   data/crosswalk/fec-to-bioguide.json  (indirect — us-enriched has bioguideId)
 *
 * Alignment logic:
 *   stance favorable  + bill favorable/concerning → expect yea
 *   stance favorable  + bill restrictive          → expect nay
 *   stance restrictive + bill restrictive         → expect yea
 *   stance restrictive + bill favorable/concerning → expect nay
 *   stance review/concerning/none                 → skipped (ambiguous)
 *   Score = aligned / total × 100, only computed when total >= 3.
 *
 * Run: npx tsx scripts/sync/votes-enrich.ts
 */
import "../env";
import { readFileSync, writeFileSync } from "node:fs";

import type { AlignmentScore, VotePosition, VoteRecord } from "../../types";

const FEDERAL_BILLS = "data/legislation/federal.json";
const VOTES = "data/votes/federal.json";
const ENRICHED = "data/politicians/us-enriched.json";

type Stance = "restrictive" | "concerning" | "review" | "favorable" | "none";

interface VotesFile {
  votes: Record<
    string,
    {
      billCode: string;
      legiscanId: number;
      entries: Array<{
        legiscanRollCallId: number;
        voteDate: string;
        chamber: "H" | "S";
        result: "passed" | "failed";
        tally: { yea: number; nay: number; abstain: number; notVoting: number };
        memberVotes: Record<string, string>;
        sourceUrl?: string;
      }>;
    }
  >;
}

interface Bill {
  id: string;
  billCode: string;
  stance?: Stance;
  voteTally?: unknown;
  [k: string]: unknown;
}

interface FederalFile {
  legislation: Bill[];
  [k: string]: unknown;
}

interface Politician {
  id: string;
  name: string;
  bioguideId?: string;
  stance?: Stance;
  votes?: VoteRecord[];
  alignment?: AlignmentScore;
  [k: string]: unknown;
}

interface EnrichedFile {
  generatedAt: string;
  politicians: Politician[];
  [k: string]: unknown;
}

function normalizePosition(raw: string): VotePosition {
  const v = raw.trim().toLowerCase();
  if (v === "yea" || v === "yes" || v === "aye") return "yea";
  if (v === "nay" || v === "no") return "nay";
  if (v === "abstain" || v === "present") return "abstain";
  return "not-voting";
}

function expectedPosition(
  billStance: Stance | undefined,
  legislatorStance: Stance | undefined,
): VotePosition | null {
  if (!billStance || !legislatorStance) return null;
  if (legislatorStance === "review" || legislatorStance === "concerning" || legislatorStance === "none") {
    return null;
  }
  const billProRegulation =
    billStance === "restrictive" || billStance === "concerning";
  const legislatorProRegulation = legislatorStance === "restrictive";
  return billProRegulation === legislatorProRegulation ? "yea" : "nay";
}

function main() {
  const fed = JSON.parse(readFileSync(FEDERAL_BILLS, "utf8")) as FederalFile;
  const votes = JSON.parse(readFileSync(VOTES, "utf8")) as VotesFile;
  const enriched = JSON.parse(readFileSync(ENRICHED, "utf8")) as EnrichedFile;

  // 1. Stamp voteTally onto each bill (use the last recorded roll call).
  let tallyCount = 0;
  for (const bill of fed.legislation) {
    const v = votes.votes[bill.id];
    if (!v || !v.entries.length) {
      delete bill.voteTally;
      continue;
    }
    const last = v.entries[v.entries.length - 1];
    bill.voteTally = {
      yea: last.tally.yea,
      nay: last.tally.nay,
      abstain: last.tally.abstain,
      notVoting: last.tally.notVoting,
      passed: last.result === "passed",
      voteDate: last.voteDate,
      rollCallId: String(last.legiscanRollCallId),
    };
    tallyCount++;
  }
  writeFileSync(FEDERAL_BILLS, JSON.stringify(fed, null, 2) + "\n");
  console.log(`[enrich] stamped voteTally on ${tallyCount} bills`);

  // 2. Build bioguide → [{ billId, billCode, position, ... }]
  const byBioguide = new Map<string, VoteRecord[]>();
  const byBioguideMeta = new Map<
    string,
    Array<{ billId: string; billCode: string; position: VotePosition; expected: VotePosition | null; billStance?: Stance }>
  >();
  const billStanceById = new Map<string, Stance | undefined>();
  for (const b of fed.legislation) billStanceById.set(b.id, b.stance);

  for (const [billId, group] of Object.entries(votes.votes)) {
    if (!group.entries.length) continue;
    const last = group.entries[group.entries.length - 1];
    for (const [bioguide, rawPos] of Object.entries(last.memberVotes)) {
      const position = normalizePosition(rawPos);
      const record: VoteRecord = {
        billId,
        billCode: group.billCode,
        voteDate: last.voteDate,
        position,
        rollCallId: String(last.legiscanRollCallId),
        sourceUrl: last.sourceUrl,
      };
      if (!byBioguide.has(bioguide)) byBioguide.set(bioguide, []);
      byBioguide.get(bioguide)!.push(record);

      if (!byBioguideMeta.has(bioguide)) byBioguideMeta.set(bioguide, []);
      byBioguideMeta.get(bioguide)!.push({
        billId,
        billCode: group.billCode,
        position,
        expected: null,
        billStance: billStanceById.get(billId),
      });
    }
  }

  // 3. Attach to politicians + compute alignment
  let withVotes = 0;
  let withAlignment = 0;
  for (const p of enriched.politicians) {
    if (!p.bioguideId) continue;
    const records = byBioguide.get(p.bioguideId);
    if (!records || records.length === 0) {
      delete p.votes;
      delete p.alignment;
      continue;
    }
    p.votes = records;
    withVotes++;

    const eligible = records
      .map((r) => ({
        record: r,
        expected: expectedPosition(billStanceById.get(r.billId), p.stance),
      }))
      .filter((x): x is { record: VoteRecord; expected: VotePosition } => Boolean(x.expected));

    if (eligible.length < 3) {
      delete p.alignment;
      continue;
    }

    const aligned = eligible.filter((x) => x.record.position === x.expected).length;
    const contradictory = eligible.filter(
      (x) =>
        (x.expected === "yea" && x.record.position === "nay") ||
        (x.expected === "nay" && x.record.position === "yea"),
    );

    const flagged: AlignmentScore["flaggedVotes"] = contradictory.map((x) => ({
      billId: x.record.billId,
      billCode: x.record.billCode,
      expectedPosition: x.expected,
      actualPosition: x.record.position,
      reason: `Stated stance (${p.stance}) implies ${x.expected} on this ${billStanceById.get(x.record.billId)} bill.`,
    }));

    p.alignment = {
      score: Math.round((aligned / eligible.length) * 100),
      totalVotes: eligible.length,
      alignedVotes: aligned,
      contradictoryVotes: contradictory.length,
      ...(flagged.length ? { flaggedVotes: flagged } : {}),
    };
    withAlignment++;
  }

  enriched.generatedAt = new Date().toISOString();
  writeFileSync(ENRICHED, JSON.stringify(enriched, null, 2) + "\n");
  console.log(
    `[enrich] ${withVotes} politicians have votes, ${withAlignment} have alignment scores (≥3 eligible votes)`,
  );
}

main();
