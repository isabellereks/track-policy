import type { Entity, ImpactTag, Legislation } from "@/types";

import algeria from "@/data/international/algeria.json";
import argentina from "@/data/international/argentina.json";
import australia from "@/data/international/australia.json";
import austria from "@/data/international/austria.json";
import belgium from "@/data/international/belgium.json";
import brazil from "@/data/international/brazil.json";
import bulgaria from "@/data/international/bulgaria.json";
import canada from "@/data/international/canada.json";
import china from "@/data/international/china.json";
import croatia from "@/data/international/croatia.json";
import cyprus from "@/data/international/cyprus.json";
import czechia from "@/data/international/czechia.json";
import denmark from "@/data/international/denmark.json";
import egypt from "@/data/international/egypt.json";
import estonia from "@/data/international/estonia.json";
import finland from "@/data/international/finland.json";
import france from "@/data/international/france.json";
import germany from "@/data/international/germany.json";
import greece from "@/data/international/greece.json";
import greenland from "@/data/international/greenland.json";
import hongKong from "@/data/international/hong-kong.json";
import hungary from "@/data/international/hungary.json";
import india from "@/data/international/india.json";
import ireland from "@/data/international/ireland.json";
import italy from "@/data/international/italy.json";
import japan from "@/data/international/japan.json";
import latvia from "@/data/international/latvia.json";
import lithuania from "@/data/international/lithuania.json";
import netherlands from "@/data/international/netherlands.json";
import russia from "@/data/international/russia.json";
import saudiArabia from "@/data/international/saudi-arabia.json";
import singapore from "@/data/international/singapore.json";
import southKorea from "@/data/international/south-korea.json";
import spain from "@/data/international/spain.json";
import switzerland from "@/data/international/switzerland.json";
import turkey from "@/data/international/turkey.json";
import unitedArabEmirates from "@/data/international/united-arab-emirates.json";
import unitedKingdom from "@/data/international/united-kingdom.json";
import unitedStates from "@/data/international/united-states.json";
import indonesia from "@/data/international/indonesia.json";
import thailand from "@/data/international/thailand.json";
import philippines from "@/data/international/philippines.json";
import malaysia from "@/data/international/malaysia.json";
import mexico from "@/data/international/mexico.json";
import taiwan from "@/data/international/taiwan.json";

const VALID_IMPACT_TAGS = new Set<ImpactTag>([
  "water-consumption",
  "carbon-emissions",
  "protected-land",
  "environmental-review",
  "renewable-energy",
  "grid-capacity",
  "energy-rates",
  "water-infrastructure",
  "noise-vibration",
  "local-zoning",
  "local-control",
  "residential-proximity",
  "property-values",
  "tax-incentives",
  "job-creation",
  "economic-development",
  "nda-transparency",
  "algorithmic-transparency",
  "ai-safety",
  "deepfake-regulation",
  "ai-in-healthcare",
  "ai-in-employment",
  "ai-in-education",
  "child-safety",
  "data-privacy",
]);

function sanitizeLegislation(l: Legislation): Legislation {
  return {
    ...l,
    impactTags: (l.impactTags ?? []).filter((t): t is ImpactTag =>
      VALID_IMPACT_TAGS.has(t as ImpactTag),
    ),
  };
}

function sanitizeEntity(e: Entity): Entity {
  return {
    ...e,
    legislation: (e.legislation ?? []).map(sanitizeLegislation),
    keyFigures: e.keyFigures ?? [],
    news: e.news ?? [],
  };
}

const modules: Entity[] = [];
function register(mod: unknown) {
  if (mod && typeof mod === "object" && "id" in (mod as Record<string, unknown>)) {
    modules.push(sanitizeEntity(mod as Entity));
  }
}

register(algeria);
register(argentina);
register(australia);
register(austria);
register(belgium);
register(brazil);
register(bulgaria);
register(canada);
register(china);
register(croatia);
register(cyprus);
register(czechia);
register(denmark);
register(egypt);
register(estonia);
register(finland);
register(france);
register(germany);
register(greece);
register(greenland);
register(hongKong);
register(hungary);
register(india);
register(ireland);
register(italy);
register(japan);
register(latvia);
register(lithuania);
register(netherlands);
register(russia);
register(saudiArabia);
register(singapore);
register(southKorea);
register(spain);
register(switzerland);
register(turkey);
register(unitedArabEmirates);
register(unitedKingdom);
register(unitedStates);
register(indonesia);
register(thailand);
register(philippines);
register(malaysia);
register(mexico);
register(taiwan);

export const RESEARCHED_INTERNATIONAL: Entity[] = modules;
