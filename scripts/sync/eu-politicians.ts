/**
 * Research UK (Commons) and EU Parliament members active on AI + data
 * centre policy via Claude `web_search`. Writes data/politicians/{uk,eu}.json.
 *
 * Output shape per politician:
 *   id, name, role, party, nationalParty, stance, country, chamber,
 *   constituency, externalId, summary, keyPoints, votes
 *
 * Budget: 2 calls × ~$0.50 ≈ $1. Rerun with EU_POLS_FORCE=1 to overwrite.
 *
 * Run: npx tsx scripts/sync/eu-politicians.ts
 */
import "../env.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "data/politicians");

const MODEL = "claude-sonnet-4-6";
const FORCE = process.env.EU_POLS_FORCE === "1";

interface Target {
  slug: "uk" | "eu";
  prompt: string;
}

const TARGETS: Target[] = [
  {
    slug: "uk",
    prompt: `Research UK Members of Parliament active on AI and data centre policy (use British spelling: "data centre", "programme", "defence") as of April 2026.

Return a SINGLE JSON object (no prose, no markdown fences):
{
  "politicians": [
    {
      "id": "uk-{lastname-slug}",
      "name": "...",
      "role": "MP · {specific role or committee assignment}",
      "party": "Labour|Conservative|Liberal Democrat|SNP|Green|Reform UK|...",
      "stance": "restrictive|concerning|review|favorable|none",
      "country": "GB",
      "chamber": "commons",
      "constituency": "...",
      "externalId": "{TheyWorkForYou person_id if verified, else omit}",
      "summary": "1–2 sentence summary of their stance on AI & data-centre policy — what they've said, sponsored, or opposed. Must be specific enough that a reader can evaluate it.",
      "keyPoints": [
        "Concise bullet — a position statement, sponsored bill, committee leadership, or public stance. Keep it ≤20 words.",
        "At least 2, up to 4 points."
      ],
      "votes": [
        { "billId": "uk-{slug}", "billCode": "...", "voteDate": "YYYY-MM-DD", "position": "yea|nay|abstain|not-voting", "sourceUrl": "https://..." }
      ]
    }
  ]
}

PRIORITISE: DSIT ministers + shadow ministers, Science Innovation & Technology Committee members, MPs who tabled AI amendments / EDMs / written questions, MPs whose constituencies host major data centre proposals (Slough, Newport, Cambridge, etc.).

RULES:
- Return 15–25 MPs.
- Only include MPs whose AI/data-centre positions you can verify via web search.
- Every \`summary\` and \`keyPoints\` entry must cite concrete fact (a bill, a debate date, a public statement) — no filler like "interested in technology".
- Omit \`externalId\`, \`votes\`, or any field you can't substantiate. Better to skip a field than invent.
- All URLs in \`votes[].sourceUrl\` must resolve (Hansard, TheyWorkForYou, or similar).`,
  },
  {
    slug: "eu",
    prompt: `Research Members of the European Parliament (MEPs) who shaped the EU AI Act and data centre energy regulation (Energy Efficiency Directive recast, Article 12) as of April 2026.

Return a SINGLE JSON object (no prose, no markdown fences):
{
  "politicians": [
    {
      "id": "eu-{lastname-slug}",
      "name": "...",
      "role": "MEP · {specific role, e.g. AI Act Rapporteur, ITRE Coordinator}",
      "party": "EPP|S&D|Renew|Greens/EFA|ECR|ID|The Left",
      "nationalParty": "{national-level party — e.g. SPD, CDU, PD, LREM}",
      "stance": "restrictive|concerning|review|favorable|none",
      "country": "EU",
      "chamber": "ep",
      "constituency": "{member state}",
      "summary": "1–2 sentences on what they actually did on AI Act / EED / data centres — amendments pushed, compromises negotiated, public positions.",
      "keyPoints": [
        "A specific verifiable action or position — ≤20 words each.",
        "At least 2, up to 4 points."
      ],
      "votes": [
        { "billId": "eu-{slug}", "billCode": "...", "voteDate": "YYYY-MM-DD", "position": "yea|nay|abstain|not-voting", "sourceUrl": "https://..." }
      ]
    }
  ]
}

PRIORITISE: AI Act rapporteurs + shadow rapporteurs, ITRE / IMCO / LIBE committee leaders active on AI, MEPs who broke with their EP group.

RULES:
- Return 10–15 MEPs, the ones with the clearest AI Act / EED fingerprints.
- \`party\` is the EP GROUP ONLY (e.g. "S&D"). The national party goes in \`nationalParty\`.
- \`summary\` must describe what they actually did on these files, not generic bio.
- Every \`keyPoints\` entry must cite a specific amendment, vote, statement, or role.
- Only include MEPs / votes you can verify via web search. Omit what you can't substantiate.
- All URLs must resolve (europarl.europa.eu, howtheyvote.eu, or news coverage with detail).`,
  },
];

function parseJsonBlock(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(candidate.slice(first, last + 1));
  }
  throw new Error("no JSON object found in response");
}

function extractText(msg: Anthropic.Messages.Message): string {
  const parts: string[] = [];
  for (const b of msg.content) if (b.type === "text") parts.push(b.text);
  return parts.join("\n");
}

async function run(anthropic: Anthropic, target: Target): Promise<unknown> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 12000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }],
    messages: [{ role: "user", content: target.prompt }],
  });
  return parseJsonBlock(extractText(msg));
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const anthropic = new Anthropic();
  for (const target of TARGETS) {
    const out = join(OUT_DIR, `${target.slug}.json`);
    if (!FORCE && existsSync(out)) {
      console.log(`[eu-pols] ${target.slug} — exists, skipping (EU_POLS_FORCE=1 to overwrite)`);
      continue;
    }
    console.log(`[eu-pols] researching ${target.slug}…`);
    const data = await run(anthropic, target);
    const pols = (data as { politicians?: unknown[] }).politicians ?? [];
    writeFileSync(
      out,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), politicians: pols },
        null,
        2,
      ) + "\n",
    );
    console.log(`[eu-pols] wrote ${out} — ${pols.length} entries`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
