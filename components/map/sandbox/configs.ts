import { geoMercator } from "d3-geo";
import type { ProjectionFunction } from "react-simple-maps";
import {
  euProjection,
  usProjection,
  asiaProjection,
} from "@/lib/projections";
import {
  EU_FACILITIES,
  ASIA_FACILITIES,
  ALL_FACILITIES,
  US_FACILITIES,
} from "@/lib/datacenters";
import type { DataCenter, Region } from "@/types";

export type SandboxView =
  | { kind: "region"; region: Region }
  | { kind: "us-states" }
  | { kind: "counties"; state: string };

export type GeoFeatureLite = {
  id?: string | number;
  properties?: Record<string, unknown> | null;
};

export interface MapLayer {
  id: string;
  geography: string;
  filter?: (g: GeoFeatureLite) => boolean;
  /** Stable string used for entity lookup + selection id. */
  getKey: (g: GeoFeatureLite) => string;
  /** Human-readable label for tooltip. */
  getLabel: (g: GeoFeatureLite) => string;
  entityRegion: Region;
  /** 'primary' is clickable & selectable. 'context' is neutral silhouette. */
  role: "primary" | "context";
  /** Called on double-click; sandbox uses this for drill. */
  onDrillKey?: (key: string) => SandboxView | null;
  /** Stroke-width baseline for this layer (scaled by 1/zoom at render). */
  strokeWidth?: number;
  /**
   * If set, the layer only renders (and its topojson is only fetched) once
   * the current zoom reaches this value. Enables continuous LOD inside a
   * single view — e.g. NA shows countries → US states → counties as the
   * user zooms in, no drill remount.
   */
  zoomFadeIn?: number;
  /**
   * When true, the layer is rendered three times (offset by ±worldWidth)
   * so panning past the antimeridian wraps seamlessly. Only makes sense
   * for world-spanning context layers.
   */
  wrapWorld?: boolean;
}

export interface MapConfig {
  projection: ProjectionFunction;
  /** Center in [lng, lat] for both SVG and GL renderers. */
  initialCenter: [number, number];
  initialZoom?: number;
  /** [lng, lat] clamp for the center while panning. */
  clamp: [[number, number], [number, number]];
  layers: MapLayer[];
  facilities: DataCenter[];
  /** Used by GL + SVG high-detail swap. */
  highDetailUrl?: string;
  /** The geography URL that should be swapped to highDetailUrl above 3×. */
  highDetailTargetUrl?: string;
}

const WORLD_LOW = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const WORLD_HIGH = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const COUNTIES_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

// Shared base layer rendered behind every region — gives the full-world
// context so you can pan out of the focus area and still see something.
// Role is "context" so these shapes are neutral silhouettes (no fill color
// and no click handler).
const WORLD_BASE_LAYER: MapLayer = {
  id: "world-base",
  geography: WORLD_LOW,
  getKey: (g) => String(g.id),
  getLabel: (g) =>
    (g.properties as { name?: string } | null)?.name ?? String(g.id),
  entityRegion: "na", // irrelevant for context role
  role: "context",
  strokeWidth: 0.5,
  wrapWorld: true,
};

// Wide clamp — lets the user pan anywhere on the globe from any starting
// region. Projections still distort at the poles; that's OK for sandbox.
const WORLD_CLAMP: [[number, number], [number, number]] = [
  [-180, -60],
  [180, 80],
];

// --- Europe ---------------------------------------------------------------

const EUROPE_CODES = new Set<number>([
  8, 20, 31, 40, 51, 56, 70, 100, 112, 191, 196, 203, 208, 233, 246, 250, 268,
  276, 292, 300, 336, 348, 352, 372, 380, 428, 438, 440, 442, 470, 492, 498,
  499, 528, 578, 616, 620, 642, 643, 674, 688, 703, 705, 724, 752, 756, 792,
  804, 807, 826,
]);

export const EUROPE_CONFIG: MapConfig = {
  projection: euProjection as unknown as ProjectionFunction,
  initialCenter: [15, 52],
  initialZoom: 1,
  clamp: WORLD_CLAMP,
  facilities: EU_FACILITIES,
  highDetailUrl: WORLD_HIGH,
  highDetailTargetUrl: WORLD_LOW,
  layers: [
    WORLD_BASE_LAYER,
    {
      id: "countries",
      geography: WORLD_LOW,
      filter: (g) => EUROPE_CODES.has(parseInt(String(g.id ?? ""), 10)),
      getKey: (g) => String(g.id),
      getLabel: (g) =>
        (g.properties as { name?: string } | null)?.name ?? String(g.id),
      entityRegion: "eu",
      role: "primary",
      strokeWidth: 1.5,
    },
  ],
};

// --- Asia -----------------------------------------------------------------

const ASIA_CODES = new Set<number>([
  4, 31, 36, 50, 51, 64, 96, 104, 116, 144, 156, 158, 196, 242, 268, 275, 296,
  344, 356, 360, 364, 368, 376, 392, 398, 400, 408, 410, 414, 417, 418, 422,
  446, 458, 462, 469, 496, 512, 524, 540, 548, 554, 586, 598, 608, 626, 634,
  643, 682, 686, 702, 704, 706, 716, 760, 762, 764, 776, 784, 792, 795, 860,
  882, 887,
]);

export const ASIA_CONFIG: MapConfig = {
  projection: asiaProjection as unknown as ProjectionFunction,
  initialCenter: [110, 12],
  initialZoom: 1,
  clamp: WORLD_CLAMP,
  facilities: ASIA_FACILITIES,
  highDetailUrl: WORLD_HIGH,
  highDetailTargetUrl: WORLD_LOW,
  layers: [
    WORLD_BASE_LAYER,
    {
      id: "countries",
      geography: WORLD_LOW,
      filter: (g) => ASIA_CODES.has(parseInt(String(g.id ?? ""), 10)),
      getKey: (g) => String(g.id),
      getLabel: (g) =>
        (g.properties as { name?: string } | null)?.name ?? String(g.id),
      entityRegion: "asia",
      role: "primary",
      strokeWidth: 1.5,
    },
  ],
};

// --- Africa ---------------------------------------------------------------

const AFRICA_CODES = new Set<number>([
  12, 24, 72, 108, 120, 132, 140, 148, 174, 178, 180, 204, 226, 231, 232,
  262, 266, 270, 288, 324, 384, 404, 426, 430, 434, 450, 454, 466, 478, 480,
  504, 508, 516, 562, 566, 646, 686, 690, 694, 706, 710, 716, 728, 729, 732,
  748, 768, 788, 800, 818, 834, 854, 894,
]);

export const AFRICA_CONFIG: MapConfig = {
  projection: geoMercator()
    .center([20, 1])
    .scale(430)
    .translate([480, 300]) as unknown as ProjectionFunction,
  initialCenter: [20, 1],
  initialZoom: 1,
  clamp: WORLD_CLAMP,
  facilities: [],
  highDetailUrl: WORLD_HIGH,
  highDetailTargetUrl: WORLD_LOW,
  layers: [
    WORLD_BASE_LAYER,
    {
      id: "countries",
      geography: WORLD_LOW,
      filter: (g) => AFRICA_CODES.has(parseInt(String(g.id ?? ""), 10)),
      getKey: (g) => String(g.id),
      getLabel: (g) =>
        (g.properties as { name?: string } | null)?.name ?? String(g.id),
      entityRegion: "africa",
      role: "primary",
      strokeWidth: 1.5,
    },
  ],
};

// --- North America (world + clickable US states) -------------------------

export const NA_CONFIG: MapConfig = {
  // Reuse NA Mercator for continental view.
  projection: geoMercator()
    .center([-96, 44])
    .scale(640)
    .translate([480, 300]) as unknown as ProjectionFunction,
  initialCenter: [-96, 44],
  initialZoom: 1,
  clamp: WORLD_CLAMP,
  facilities: ALL_FACILITIES,
  highDetailUrl: WORLD_HIGH,
  highDetailTargetUrl: WORLD_LOW,
  layers: [
    // World silhouette underneath — lets the user pan out and still see
    // the rest of the globe as context.
    WORLD_BASE_LAYER,
    // US states on top. Drill still wired for Static + GL panels via the
    // same config, but the SVG continuous renderer ignores drill in favour
    // of LOD: just keep zooming, the next layer fades in.
    {
      id: "us-states",
      geography: STATES_URL,
      getKey: (g) => (g.properties as { name: string }).name,
      getLabel: (g) => (g.properties as { name: string }).name,
      entityRegion: "na",
      role: "primary",
      onDrillKey: () => ({ kind: "us-states" }),
      strokeWidth: 0.8,
    },
    // Counties revealed at high zoom. No stance data at this granularity
    // (municipal data is per-state and wouldn't match 3k+ counties),
    // so they render as neutral context — visual depth only.
    {
      id: "us-counties",
      geography: COUNTIES_URL,
      getKey: (g) => String(g.id),
      getLabel: (g) =>
        (g.properties as { name?: string } | null)?.name ?? String(g.id),
      entityRegion: "na",
      role: "context",
      strokeWidth: 0.25,
      zoomFadeIn: 4,
    },
  ],
};

// --- US States drill view -------------------------------------------------

export const US_STATES_CONFIG: MapConfig = {
  projection: usProjection as unknown as ProjectionFunction,
  initialCenter: [-96, 38],
  initialZoom: 1,
  clamp: [
    [-130, 20],
    [-65, 52],
  ],
  facilities: US_FACILITIES,
  layers: [
    {
      id: "us-states",
      geography: STATES_URL,
      getKey: (g) => (g.properties as { name: string }).name,
      getLabel: (g) => (g.properties as { name: string }).name,
      entityRegion: "na",
      role: "primary",
      onDrillKey: (name) => ({ kind: "counties", state: name }),
      strokeWidth: 1.2,
    },
  ],
};

export function configFor(view: SandboxView): MapConfig | null {
  // County view is rendered by the existing CountyMap in all three panels
  // — no generic config needed (CountyMap handles projection fitting on
  // its own).
  if (view.kind === "counties") return null;
  if (view.kind === "us-states") return US_STATES_CONFIG;
  switch (view.region) {
    case "eu":
      return EUROPE_CONFIG;
    case "asia":
      return ASIA_CONFIG;
    case "africa":
      return AFRICA_CONFIG;
    case "na":
      return NA_CONFIG;
    default:
      return null;
  }
}
