import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const TODAY = new Date();
const MAX_DATE = new Date(TODAY.getTime() + 24 * 60 * 60 * 1000);
const RECENT_CUTOFF = new Date(TODAY.getTime() - 92 * 24 * 60 * 60 * 1000);
const CHECK_URLS = process.argv.includes("--check-urls");

const errors = [];
const warnings = [];
const metrics = {};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(ROOT, file)}: invalid JSON (${error.message})`);
    return null;
  }
}

function jsonFiles(dir, { skipDirs = new Set() } = {}) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) return [];
      return jsonFiles(file, { skipDirs });
    }
    return entry.name.endsWith(".json") ? [file] : [];
  });
}

function validUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validDate(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed <= MAX_DATE;
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function auditJson() {
  const files = [
    ...jsonFiles(DATA, { skipDirs: new Set(["raw"]) }),
    path.join(ROOT, "public/news-summaries.json"),
  ];
  for (const file of files) readJson(file);
  metrics.jsonFiles = files.length;
}

function auditLegislation() {
  const files = [
    path.join(DATA, "legislation/federal.json"),
    ...jsonFiles(path.join(DATA, "legislation/states")),
  ];
  const scopedIds = [];
  let count = 0;

  for (const file of files) {
    const doc = readJson(file);
    if (!doc) continue;
    if (!Array.isArray(doc.legislation)) {
      errors.push(`${path.relative(ROOT, file)}: legislation must be an array`);
      continue;
    }
    const scope = doc.stateCode ?? doc.state ?? "federal";
    for (const bill of doc.legislation) {
      count += 1;
      const ref = `${scope}:${bill.id ?? "missing-id"}`;
      scopedIds.push(ref);
      for (const field of ["id", "billCode", "title", "summary", "stage"]) {
        if (!bill[field]) errors.push(`${ref}: missing ${field}`);
      }
      if (bill.updatedDate && !validDate(bill.updatedDate)) {
        errors.push(`${ref}: invalid or future updatedDate ${bill.updatedDate}`);
      }
      if (bill.sourceUrl && !validUrl(bill.sourceUrl)) {
        errors.push(`${ref}: invalid sourceUrl`);
      }
    }
  }

  for (const id of duplicates(scopedIds)) errors.push(`duplicate legislation id ${id}`);
  metrics.usBills = count;
}

function auditMunicipal() {
  const files = jsonFiles(path.join(DATA, "municipal"));
  const ids = [];
  const actionKeys = [];
  let entities = 0;
  let actions = 0;

  for (const file of files) {
    const rows = readJson(file);
    if (!Array.isArray(rows)) {
      errors.push(`${path.relative(ROOT, file)}: expected a municipal array`);
      continue;
    }
    for (const entity of rows) {
      entities += 1;
      ids.push(entity.id ?? "missing-id");
      if (!entity.id || !entity.name || !entity.stateCode) {
        errors.push(`${path.relative(ROOT, file)}: municipal entity missing id/name/stateCode`);
      }
      if (!Array.isArray(entity.actions)) {
        errors.push(`${entity.id}: actions must be an array`);
        continue;
      }
      for (const action of entity.actions) {
        actions += 1;
        const ref = `${entity.id}:${action.title ?? "missing-title"}`;
        actionKeys.push(`${ref}:${action.date ?? "missing-date"}`);
        for (const field of ["title", "date", "status", "summary", "sourceUrl"]) {
          if (!action[field]) errors.push(`${ref}: missing ${field}`);
        }
        if (!validDate(action.date)) errors.push(`${ref}: invalid or future date ${action.date}`);
        if (!validUrl(action.sourceUrl)) errors.push(`${ref}: invalid sourceUrl`);
      }
    }
  }

  for (const id of duplicates(ids)) errors.push(`duplicate municipal id ${id}`);
  for (const key of duplicates(actionKeys)) warnings.push(`duplicate municipal action ${key}`);
  metrics.municipalEntities = entities;
  metrics.municipalActions = actions;
}

function auditNews() {
  const source = readJson(path.join(DATA, "news/summaries.json"));
  const published = readJson(path.join(ROOT, "public/news-summaries.json"));
  if (!source || !published) return;

  if (JSON.stringify(source) !== JSON.stringify(published)) {
    errors.push("public/news-summaries.json is not synchronized with data/news/summaries.json");
  }

  const rows = Object.entries(source.entities ?? {}).flatMap(([entity, block]) =>
    (block.news ?? []).map((item) => ({ entity, item })),
  );
  const ids = rows.map(({ item }) => item.id ?? "missing-id");
  let missingSummaries = 0;

  for (const { entity, item } of rows) {
    const ref = `${entity}:${item.id ?? "missing-id"}`;
    for (const field of ["id", "headline", "source", "date", "url"]) {
      if (!item[field]) errors.push(`${ref}: missing ${field}`);
    }
    if (!validDate(item.date)) errors.push(`${ref}: invalid or future date ${item.date}`);
    if (!validUrl(item.url)) errors.push(`${ref}: invalid url`);
    if (!item.summary) missingSummaries += 1;
  }

  for (const id of duplicates(ids)) errors.push(`duplicate news id ${id}`);
  if (missingSummaries) warnings.push(`${missingSummaries} news items do not yet have summaries`);
  metrics.newsItems = rows.length;
  metrics.newsMissingSummaries = missingSummaries;
}

function auditFacilities() {
  const sources = [
    ["epoch", path.join(DATA, "datacenters/epoch-ai.json")],
    ["researched", path.join(DATA, "datacenters/researched.json")],
    ["international", path.join(DATA, "datacenters/international.json")],
  ];

  for (const [name, file] of sources) {
    const doc = readJson(file);
    if (!doc) continue;
    const rows = Array.isArray(doc) ? doc : doc.facilities;
    if (!Array.isArray(rows)) {
      errors.push(`${path.relative(ROOT, file)}: facilities must be an array`);
      continue;
    }
    for (const id of duplicates(rows.map((row) => row.id))) {
      errors.push(`${name}: duplicate facility id ${id}`);
    }
    for (const row of rows) {
      const ref = `${name}:${row.id ?? "missing-id"}`;
      if (!row.id) errors.push(`${ref}: missing id`);
      if (typeof row.lat !== "number" || row.lat < -90 || row.lat > 90) {
        errors.push(`${ref}: invalid latitude`);
      }
      if (typeof row.lng !== "number" || row.lng < -180 || row.lng > 180) {
        errors.push(`${ref}: invalid longitude`);
      }
      if (row.capacityMW != null && (!Number.isFinite(row.capacityMW) || row.capacityMW < 0)) {
        errors.push(`${ref}: invalid capacityMW`);
      }
    }
    metrics[`${name}Facilities`] = rows.length;
  }
}

function auditEnergyAndPoliticians() {
  const plantsDoc = readJson(path.join(DATA, "energy/power-plants.json"));
  const plants = Array.isArray(plantsDoc) ? plantsDoc : plantsDoc?.plants;
  if (Array.isArray(plants)) {
    for (const id of duplicates(plants.map((plant) => plant.id))) {
      errors.push(`duplicate power plant id ${id}`);
    }
    metrics.powerPlants = plants.length;
  }

  const legislators = readJson(path.join(DATA, "crosswalk/legislators-current.json"));
  if (Array.isArray(legislators)) {
    const bioguides = legislators.map((row) => row.id?.bioguide).filter(Boolean);
    for (const id of duplicates(bioguides)) errors.push(`duplicate current bioguide ${id}`);
    metrics.currentLegislators = legislators.length;
  }
}

async function auditCuratedUrls() {
  const urls = new Set();
  const municipalFiles = jsonFiles(path.join(DATA, "municipal"));
  for (const file of municipalFiles) {
    const rows = readJson(file);
    if (!Array.isArray(rows)) continue;
    for (const entity of rows) {
      for (const action of entity.actions ?? []) {
        if (new Date(action.date) >= RECENT_CUTOFF && validUrl(action.sourceUrl)) {
          urls.add(action.sourceUrl);
        }
      }
    }
  }

  const supplemental = readJson(path.join(DATA, "legislation/supplemental.json"));
  for (const item of Array.isArray(supplemental) ? supplemental : []) {
    if (validUrl(item.sourceUrl)) urls.add(item.sourceUrl);
  }

  const news = readJson(path.join(DATA, "news/summaries.json"));
  for (const block of Object.values(news?.regional ?? {})) {
    for (const item of block.keyDevelopments ?? []) {
      if (new Date(item.date) >= RECENT_CUTOFF && validUrl(item.url)) urls.add(item.url);
    }
  }

  let reachable = 0;
  let restricted = 0;
  let unavailable = 0;
  const checks = [...urls].map(async (url) => {
    try {
      let response = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok && !(response.status >= 300 && response.status < 400)) {
        response = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(12_000),
        });
      }
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        reachable += 1;
      } else if ([401, 403, 429].includes(response.status)) {
        restricted += 1;
        warnings.push(`${url}: reachable but returned HTTP ${response.status}`);
      } else if ([404, 410].includes(response.status)) {
        errors.push(`${url}: broken source URL (HTTP ${response.status})`);
      } else {
        unavailable += 1;
        warnings.push(`${url}: source check returned HTTP ${response.status}`);
      }
    } catch (error) {
      unavailable += 1;
      warnings.push(`${url}: source check failed (${error.message})`);
    }
  });
  await Promise.all(checks);
  metrics.curatedUrlsChecked = urls.size;
  metrics.curatedUrlsReachable = reachable;
  metrics.curatedUrlsRestricted = restricted;
  metrics.curatedUrlsUnavailable = unavailable;
}

auditJson();
auditLegislation();
auditMunicipal();
auditNews();
auditFacilities();
auditEnergyAndPoliticians();
if (CHECK_URLS) await auditCuratedUrls();

console.log(JSON.stringify({ metrics, warnings, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
