import type { MunicipalEntity } from "@/types";

import connecticut from "@/data/municipal/connecticut.json";
import florida from "@/data/municipal/florida.json";
import georgia from "@/data/municipal/georgia.json";
import maryland from "@/data/municipal/maryland.json";
import minnesota from "@/data/municipal/minnesota.json";
import newYork from "@/data/municipal/new-york.json";
import northCarolina from "@/data/municipal/north-carolina.json";
import oregon from "@/data/municipal/oregon.json";
import southCarolina from "@/data/municipal/south-carolina.json";
import tennessee from "@/data/municipal/tennessee.json";
import texas from "@/data/municipal/texas.json";
import virginia from "@/data/municipal/virginia.json";
import wisconsin from "@/data/municipal/wisconsin.json";
import alabama from "@/data/municipal/alabama.json";
import arizona from "@/data/municipal/arizona.json";
import colorado from "@/data/municipal/colorado.json";
import illinois from "@/data/municipal/illinois.json";
import indiana from "@/data/municipal/indiana.json";
import iowa from "@/data/municipal/iowa.json";
import kentucky from "@/data/municipal/kentucky.json";
import massachusetts from "@/data/municipal/massachusetts.json";
import michigan from "@/data/municipal/michigan.json";
import mississippi from "@/data/municipal/mississippi.json";
import missouri from "@/data/municipal/missouri.json";
import nebraska from "@/data/municipal/nebraska.json";
import nevada from "@/data/municipal/nevada.json";
import newJersey from "@/data/municipal/new-jersey.json";
import ohio from "@/data/municipal/ohio.json";
import oklahoma from "@/data/municipal/oklahoma.json";
import pennsylvania from "@/data/municipal/pennsylvania.json";
import utah from "@/data/municipal/utah.json";
import washington from "@/data/municipal/washington.json";

const ALL: MunicipalEntity[] = ([] as unknown[])
  .concat(
    connecticut,
    florida,
    georgia,
    maryland,
    minnesota,
    newYork,
    northCarolina,
    oregon,
    southCarolina,
    tennessee,
    texas,
    virginia,
    wisconsin,
    alabama,
    arizona,
    colorado,
    illinois,
    indiana,
    iowa,
    kentucky,
    massachusetts,
    michigan,
    mississippi,
    missouri,
    nebraska,
    nevada,
    newJersey,
    ohio,
    oklahoma,
    pennsylvania,
    utah,
    washington,
  )
  .filter(Boolean) as MunicipalEntity[];

/** All municipal entities indexed by 5-digit FIPS. */
const BY_FIPS = new Map<string, MunicipalEntity>();
for (const m of ALL) {
  if (m?.fips) BY_FIPS.set(String(m.fips).padStart(5, "0"), m);
}

/** All municipal entities grouped by state name. */
const BY_STATE = new Map<string, MunicipalEntity[]>();
for (const m of ALL) {
  if (!m?.state) continue;
  const bucket = BY_STATE.get(m.state) ?? [];
  bucket.push(m);
  BY_STATE.set(m.state, bucket);
}

export function getAllMunicipalities(): MunicipalEntity[] {
  return ALL;
}

export function getMunicipalityByFips(
  fips: string,
): MunicipalEntity | undefined {
  return BY_FIPS.get(String(fips).padStart(5, "0"));
}

export function getMunicipalitiesByState(state: string): MunicipalEntity[] {
  return BY_STATE.get(state) ?? [];
}
