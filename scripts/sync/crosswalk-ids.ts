/**
 * Build the FEC ↔ bioguide ID crosswalk from
 * `unitedstates/congress-legislators`. Enriches data/donors/politicians.json
 * with the authoritative current-congress roster, preserving available FEC
 * donor data and adding minimal records for newly seated members, then
 * HEAD-checks Congress.gov portrait URLs.
 *
 * Outputs:
 *   data/crosswalk/legislators-current.json  (raw upstream)
 *   data/crosswalk/fec-to-bioguide.json
 *   data/crosswalk/bioguide-to-fec.json
 *   data/politicians/us-enriched.json
 *
 * Run: npx tsx scripts/sync/crosswalk-ids.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const UPSTREAM_URL =
  "https://unitedstates.github.io/congress-legislators/legislators-current.json";
const FALLBACK_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.json";

const RAW_PATH = "data/crosswalk/legislators-current.json";
const FEC_TO_BIO = "data/crosswalk/fec-to-bioguide.json";
const BIO_TO_FEC = "data/crosswalk/bioguide-to-fec.json";
const ENRICHED = "data/politicians/us-enriched.json";
const POLITICIANS_SRC = "data/donors/politicians.json";

interface UpstreamMember {
  id: {
    bioguide: string;
    fec?: string[];
    govtrack?: number;
    opensecrets?: string;
  };
  name: { first: string; last: string; official_full?: string };
  bio?: { gender?: string; birthday?: string };
  terms: Array<{
    type: "rep" | "sen";
    state: string;
    district?: number;
    party?: string;
    start: string;
    end: string;
  }>;
}

interface Politician {
  id: string;
  name: string;
  party: string;
  state: string;
  chamber: string;
  status: string;
  [k: string]: unknown;
}

function normalizeParty(party?: string): string {
  if (party === "Democrat") return "D";
  if (party === "Republican") return "R";
  if (party === "Independent") return "I";
  return party?.slice(0, 1).toUpperCase() || "I";
}

function ensureDir(path: string) {
  const d = dirname(path);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function writeJson(path: string, data: unknown) {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

async function downloadLegislators(): Promise<UpstreamMember[]> {
  if (existsSync(RAW_PATH)) {
    const stat = require("node:fs").statSync(RAW_PATH);
    const ageHours = (Date.now() - stat.mtimeMs) / 36e5;
    if (ageHours < 24) {
      console.log(`[crosswalk] reusing cached ${RAW_PATH} (${ageHours.toFixed(1)}h old)`);
      return JSON.parse(readFileSync(RAW_PATH, "utf8"));
    }
  }
  for (const url of [UPSTREAM_URL, FALLBACK_URL]) {
    console.log(`[crosswalk] fetching ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UpstreamMember[];
      ensureDir(RAW_PATH);
      writeFileSync(RAW_PATH, JSON.stringify(json, null, 2) + "\n");
      console.log(`[crosswalk] saved ${json.length} members → ${RAW_PATH}`);
      return json;
    } catch (e) {
      console.warn(`[crosswalk] ${url} failed:`, (e as Error).message);
    }
  }
  throw new Error("could not download legislators-current.json");
}

function buildMaps(members: UpstreamMember[]) {
  const fecToBio: Record<string, string> = {};
  const bioToFec: Record<string, string[]> = {};
  let fecIdCount = 0;
  for (const m of members) {
    const bio = m.id.bioguide;
    const fecs = m.id.fec ?? [];
    bioToFec[bio] = fecs;
    for (const f of fecs) {
      fecToBio[f] = bio;
      fecIdCount++;
    }
  }
  console.log(
    `[crosswalk] map: ${members.length} bioguide IDs, ${fecIdCount} FEC IDs (avg ${(fecIdCount / members.length).toFixed(2)} per member)`,
  );
  return { fecToBio, bioToFec };
}

function chamberMatch(politicianChamber: string, termType: string): boolean {
  const c = politicianChamber.toLowerCase();
  if (c === "house" && termType === "rep") return true;
  if (c === "senate" && termType === "sen") return true;
  return false;
}

function fuzzyMatch(
  p: Politician,
  members: UpstreamMember[],
): UpstreamMember | undefined {
  const lastName = p.name.split(/\s+/).pop()?.toLowerCase() ?? "";
  const candidates = members.filter((m) => {
    if (m.name.last.toLowerCase() !== lastName) return false;
    const currentTerm = m.terms[m.terms.length - 1];
    return (
      currentTerm.state === p.state &&
      chamberMatch(p.chamber, currentTerm.type)
    );
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

async function headCheck(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function batchPhotoCheck(
  bioguideIds: string[],
  concurrency = 12,
): Promise<Set<string>> {
  const ok = new Set<string>();
  let i = 0;
  let done = 0;
  async function worker() {
    while (i < bioguideIds.length) {
      const idx = i++;
      const bg = bioguideIds[idx];
      const url = `https://unitedstates.github.io/images/congress/225x275/${bg}.jpg`;
      if (await headCheck(url)) ok.add(bg);
      done++;
      if (done % 50 === 0) console.log(`[crosswalk] photo HEAD ${done}/${bioguideIds.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return ok;
}

async function main() {
  const upstream = await downloadLegislators();
  const { fecToBio, bioToFec } = buildMaps(upstream);
  writeJson(FEC_TO_BIO, fecToBio);
  writeJson(BIO_TO_FEC, bioToFec);
  console.log(`[crosswalk] wrote ${FEC_TO_BIO}`);
  console.log(`[crosswalk] wrote ${BIO_TO_FEC}`);

  const politicians = JSON.parse(readFileSync(POLITICIANS_SRC, "utf8")) as Politician[];
  const inOffice = politicians.filter((p) => p.status === "office");
  console.log(`[crosswalk] enriching ${inOffice.length} in-office politicians`);

  let directHits = 0;
  let fuzzyHits = 0;
  const unmatched: Politician[] = [];
  const matchedByBioguide = new Map<string, Politician>();

  for (const p of inOffice) {
    let bg = fecToBio[p.id];
    if (bg) directHits++;
    else {
      const m = fuzzyMatch(p, upstream);
      if (m) {
        bg = m.id.bioguide;
        fuzzyHits++;
      } else {
        unmatched.push(p);
      }
    }
    if (bg) matchedByBioguide.set(bg, p);
  }

  const matched = directHits + fuzzyHits;
  const matchRate = ((matched / inOffice.length) * 100).toFixed(1);
  console.log(
    `[crosswalk] match: ${matched}/${inOffice.length} (${matchRate}%) — direct ${directHits}, fuzzy ${fuzzyHits}, unmatched ${unmatched.length}`,
  );
  if (unmatched.length) {
    console.log("[crosswalk] first 10 unmatched:");
    for (const u of unmatched.slice(0, 10)) {
      console.log(`  ${u.id} ${u.name} ${u.chamber}-${u.state}`);
    }
  }

  // The upstream file is the roster authority. Build every current member,
  // carrying over donor fields where available and creating a minimal row for
  // new members who have not yet appeared in the donor export.
  const enriched: Array<Politician & { bioguideId: string }> = upstream.map(
    (member) => {
      const bioguideId = member.id.bioguide;
      const donor = matchedByBioguide.get(bioguideId);
      if (donor) return { ...donor, bioguideId };

      const currentTerm = member.terms[member.terms.length - 1];
      return {
        id: member.id.fec?.[0] ?? `BIO-${bioguideId}`,
        name:
          member.name.official_full ??
          `${member.name.first} ${member.name.last}`,
        party: normalizeParty(currentTerm.party),
        state: currentTerm.state,
        chamber: currentTerm.type === "sen" ? "Senate" : "House",
        status: "office",
        bioguideId,
      };
    },
  );

  console.log(
    `[crosswalk] current roster: ${enriched.length} members — ${matchedByBioguide.size} with donor records, ${enriched.length - matchedByBioguide.size} roster-only`,
  );
  const rosterMatchRate = Number(
    ((matchedByBioguide.size / enriched.length) * 100).toFixed(1),
  );

  // Photo HEAD-check
  const bioguideIds = enriched.map((e) => e.bioguideId);
  console.log(`[crosswalk] HEAD-checking ${bioguideIds.length} portrait URLs`);
  const validPhotos = await batchPhotoCheck(bioguideIds);
  console.log(`[crosswalk] valid portraits: ${validPhotos.size}/${bioguideIds.length}`);

  for (const e of enriched) {
    if (validPhotos.has(e.bioguideId)) {
      e.photoUrl = `https://unitedstates.github.io/images/congress/225x275/${e.bioguideId}.jpg`;
    }
  }

  writeJson(ENRICHED, {
    generatedAt: new Date().toISOString(),
    matchRate: rosterMatchRate,
    matched: matchedByBioguide.size,
    unmatched: enriched.length - matchedByBioguide.size,
    politicians: enriched,
  });
  console.log(`[crosswalk] wrote ${ENRICHED}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
