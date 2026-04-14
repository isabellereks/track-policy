/**
 * Deduplicate + normalize suspicious votes from data/donors/politicians.json
 * into the SuspiciousVote shape (types/index.ts).
 *
 * Source rows are noisy: ~43% are exact dupes per (member, bill, description),
 * vote positions appear in mixed casing ("Yea" / "Yes" / "Aye"), and the
 * `reason` strings can run long. We keep one entry per unique vote, picking
 * the highest-confidence flag and comma-joining industries when multiple
 * apply.
 *
 * Output: data/politicians/suspicious-votes-cleaned.json
 *
 * Run: npx tsx scripts/cleanup/clean-suspicious-votes.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { SuspiciousVote, VotePosition } from "../../types";

const SRC = "data/donors/politicians.json";
const OUT = "data/politicians/suspicious-votes-cleaned.json";

interface RawVote {
  bill: string;
  description: string;
  industryId: string;
  howTheyVoted: string;
  alignmentScore: number;
  confidence: "high" | "medium" | "low";
  reason: string;
}

interface RawPolitician {
  id: string;
  name: string;
  suspiciousVotes?: RawVote[];
}

function ensureDir(path: string) {
  const d = dirname(path);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function normalizePosition(raw: string): VotePosition {
  const v = raw.trim().toLowerCase();
  if (v === "yea" || v === "yes" || v === "aye") return "yea";
  if (v === "nay" || v === "no") return "nay";
  if (v === "abstain" || v === "present") return "abstain";
  return "not-voting";
}

function trimReason(reason: string): string {
  const cleaned = reason.trim().replace(/\s+/g, " ");
  // First sentence — split on `.`, `!`, `?` followed by space or end.
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : cleaned).trim();
}

function pickConfidence(
  a: "high" | "medium",
  b: "high" | "medium",
): "high" | "medium" {
  return a === "high" || b === "high" ? "high" : "medium";
}

function dedupeVotes(raw: RawVote[]): SuspiciousVote[] {
  const byKey = new Map<string, SuspiciousVote & { _industries: Set<string> }>();
  for (const r of raw) {
    if (r.confidence === "low") continue;
    const conf = r.confidence as "high" | "medium";
    const key = `${r.bill}|${r.description}`;
    const existing = byKey.get(key);
    if (existing) {
      existing._industries.add(r.industryId);
      existing.confidence = pickConfidence(existing.confidence, conf);
    } else {
      byKey.set(key, {
        billCode: r.bill,
        billTitle: r.description,
        position: normalizePosition(r.howTheyVoted),
        industry: r.industryId,
        reason: trimReason(r.reason),
        confidence: conf,
        _industries: new Set([r.industryId]),
      });
    }
  }
  return Array.from(byKey.values()).map(({ _industries, ...v }) => ({
    ...v,
    industry: Array.from(_industries).join(", "),
  }));
}

function main() {
  const politicians = JSON.parse(readFileSync(SRC, "utf8")) as RawPolitician[];

  let rawTotal = 0;
  let cleanTotal = 0;
  const cleaned: Record<
    string,
    { name: string; suspiciousVotes: SuspiciousVote[] }
  > = {};
  const sampleLog: string[] = [];

  for (const p of politicians) {
    const raw = p.suspiciousVotes ?? [];
    if (!raw.length) continue;
    const cleanedVotes = dedupeVotes(raw);
    rawTotal += raw.length;
    cleanTotal += cleanedVotes.length;
    cleaned[p.id] = { name: p.name, suspiciousVotes: cleanedVotes };
    if (sampleLog.length < 10) {
      sampleLog.push(`  ${p.name} (${p.id}): ${raw.length} raw → ${cleanedVotes.length} cleaned`);
    }
  }

  const reduction =
    rawTotal > 0 ? (((rawTotal - cleanTotal) / rawTotal) * 100).toFixed(1) : "0";
  console.log("[suspicious] sample:");
  sampleLog.forEach((l) => console.log(l));
  console.log(
    `[suspicious] TOTAL: ${rawTotal} raw → ${cleanTotal} cleaned (${reduction}% reduction across ${Object.keys(cleaned).length} members)`,
  );

  ensureDir(OUT);
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rawTotal,
        cleanTotal,
        reductionPercent: Number(reduction),
        memberCount: Object.keys(cleaned).length,
        members: cleaned,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`[suspicious] wrote ${OUT}`);
}

main();
