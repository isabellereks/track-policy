"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from "react";
import {
  DATACENTER_DIMENSIONS,
  AI_DIMENSIONS,
  STABLECOIN_DIMENSIONS,
  DIMENSION_LABEL,
  REGION_LABEL,
  REGION_ORDER,
  type Dimension,
  type DimensionLens,
  type NaView,
  type Region,
  type ViewTarget,
} from "@/types";
import { getEntity, getOverviewEntity, ENTITIES } from "@/lib/placeholder-data";
import { STANCE_HEX, type SetTooltip, type TooltipState } from "@/lib/map-utils";
import {
  DIMENSION_TAGS,
  DIMENSION_COLOR,
  DIMENSION_TEXT,
  DIMENSION_GRADIENT,
} from "@/lib/dimensions";
import { ALL_FACILITIES } from "@/lib/datacenters";
import { plantsInState } from "@/lib/energy-data";
import { FUEL_COLOR, FUEL_LABEL, collapseFuel } from "@/lib/energy-colors";
import type { FuelType } from "@/types";
import { findRelatedFacilities } from "@/lib/action-facility-link";
import { IMPACT_TAG_LABEL, STANCE_LABEL, STATE_FIPS } from "@/types";
import SidePanel from "@/components/panel/SidePanel";
import DepthStepper from "@/components/ui/DepthStepper";
import TopToolbar from "@/components/ui/TopToolbar";
import VisitorsWidget from "@/components/ui/VisitorsWidget";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { useLocale, type Locale } from "@/contexts/LocaleContext";
import dynamic from "next/dynamic";

// Code-split each region map — only the active region's JS + d3
// projection data loads. Saves ~200–400 KB off the initial bundle
// since only one of five is visible at a time. ssr:false because
// these render into an SVG inside a fixed-position overlay; nothing
// meaningful to prerender.
const NorthAmericaMap = dynamic(() => import("./NorthAmericaMap"), { ssr: false });
const AfricaMap = dynamic(() => import("./AfricaMap"), { ssr: false });
const USStatesMap = dynamic(() => import("./USStatesMap"), { ssr: false });
const CountyMap = dynamic(() => import("./CountyMap"), { ssr: false });
const EuropeMap = dynamic(() => import("./EuropeMap"), { ssr: false });
const AsiaMap = dynamic(() => import("./AsiaMap"), { ssr: false });
import {
  getMunicipalitiesByState,
  getMunicipalityByFips,
} from "@/lib/municipal-data";
import type {
  DataCenter,
  Entity,
  Legislation,
  MunicipalAction,
  MunicipalActionStatus,
  MunicipalEntity,
  Stage,
  StanceType,
} from "@/types";

type ViewState = ViewTarget;

// ─── MunicipalEntity → Entity adapter ──────────────────────────────
// Lets the existing SidePanel / LegislationList UI render county actions
// without any structural changes. A municipal "action" becomes a
// pseudo-Legislation row; the county's overall stance is derived from
// the most severe action status.

const ACTION_STATUS_TO_STAGE: Record<MunicipalActionStatus, Stage> = {
  enacted: "Enacted",
  "under-review": "Committee",
  proposed: "Filed",
  failed: "Dead",
};

function actionStance(status: MunicipalActionStatus): StanceType {
  if (status === "enacted") return "restrictive";
  if (status === "under-review") return "concerning";
  if (status === "proposed") return "review";
  return "none";
}

function countyStance(actions: MunicipalAction[]): StanceType {
  const order: StanceType[] = ["restrictive", "concerning", "review", "none"];
  for (const s of order) {
    if (actions.some((a) => actionStance(a.status) === s)) return s;
  }
  return "none";
}

function actionToLegislation(
  a: MunicipalAction,
  idx: number,
  relatedFacilityIds?: string[],
): Legislation {
  return {
    id: `county-action-${idx}`,
    billCode: "Local",
    title: a.title,
    summary: a.summary,
    stage: ACTION_STATUS_TO_STAGE[a.status],
    stance: actionStance(a.status),
    impactTags: [],
    category: "data-center-siting",
    updatedDate: a.date,
    sourceUrl: a.sourceUrl,
    ...(relatedFacilityIds && relatedFacilityIds.length > 0
      ? { relatedFacilityIds }
      : {}),
  };
}

function municipalityToEntity(m: MunicipalEntity): Entity {
  const dcStance = countyStance(m.actions);
  // Match each action to nearby data centers (same state) via keyword
  // search on operator + location. This gives us the action → facility
  // edge used inside BillExpanded and the facility → actions edge used
  // inside FacilityDetail.
  const stateFacilities = ALL_FACILITIES.filter(
    (f) => f.state === m.state,
  );
  return {
    id: `muni-${m.id}`,
    geoId: m.fips,
    name: `${m.name}, ${m.stateCode}`,
    region: "na",
    level: "state",
    // County actions are all data-center siting decisions; AI stance isn't
    // meaningful at this level, so mirror the DC stance for consistency.
    stanceDatacenter: dcStance,
    stanceAI: dcStance,
    contextBlurb: m.contextBlurb,
    legislation: m.actions.map((a, idx) =>
      actionToLegislation(a, idx, findRelatedFacilities(a, stateFacilities)),
    ),
    keyFigures: [],
    news: [],
  };
}

// Pre-computed DC count by state name and country name so the tooltip
// can show it without filtering on every hover.
const DC_COUNT_BY_NAME: Record<string, number> = {};
for (const f of ALL_FACILITIES) {
  if (f.state) {
    DC_COUNT_BY_NAME[f.state] = (DC_COUNT_BY_NAME[f.state] ?? 0) + 1;
  }
  if (f.country) {
    DC_COUNT_BY_NAME[f.country] = (DC_COUNT_BY_NAME[f.country] ?? 0) + 1;
  }
}

/**
 * Tooltip-only stance phrasing — capitalized, short, reads as a label
 * (not a sentence fragment like "under review"). Paired with a colored
 * dot in the tooltip rows.
 */
const STANCE_READOUT: Record<StanceType, string> = {
  restrictive: "Restrictive",
  concerning: "Concerning",
  review: "Under review",
  favorable: "Favorable",
  none: "No action",
  pioneering: "Dedicated Legislation",
};

/**
 * Tooltip-only dimension labels — trimmed to single words where possible
 * so rows read as a chart, not a sentence. The long-form labels stay in
 * `DIMENSION_LABEL` for other surfaces.
 */
const SHORT_DIMENSION_LABEL: Record<Exclude<Dimension, "overall">, string> = {
  environmental: "Environmental",
  energy: "Energy",
  community: "Community",
  "land-use": "Land use",
  "ai-governance-dim": "Governance",
  "ai-consumer": "Consumer",
  "ai-workforce": "Workforce",
  "ai-public": "Public services",
  "ai-synthetic": "Synthetic media",
  // Stablecoin lens
  "sc-issuance": "Issuance",
  "sc-reserve": "Reserve",
  "sc-consumer": "Consumer",
  "sc-cross-border": "Cross-Border",
  "sc-sovereignty": "Sovereignty",
};

const DIMENSION_LABEL_LOCALIZED: Record<Locale, Record<Dimension, string>> = {
  en: DIMENSION_LABEL,
  zh: {
    overall: "总体",
    environmental: "环境影响",
    energy: "能源与电网",
    community: "社区影响",
    "land-use": "土地使用",
    "ai-governance-dim": "治理",
    "ai-consumer": "消费者保护",
    "ai-workforce": "劳动力与就业",
    "ai-public": "公共服务",
    "ai-synthetic": "合成媒体",
    "sc-issuance": "发行",
    "sc-reserve": "储备与背书",
    "sc-consumer": "消费者保护",
    "sc-cross-border": "跨境",
    "sc-sovereignty": "货币主权",
  },
};

const OVERALL_LEGEND_LABEL: Record<Locale, string[]> = {
  en: [
    "Dedicated Legislation",
    "Innovation-Friendly",
    "Under Discussion",
    "Concerning",
    "Restrictive",
    "No Action",
  ],
  zh: [
    "专门立法",
    "创新友好",
    "讨论中",
    "审慎推进",
    "限制性",
    "无行动",
  ],
};

const ISSUANCE_LEGEND_LABEL: Record<Locale, string[]> = {
  en: ["Non-bank permitted", "Bank-only", "Banned", "Unclear / in progress"],
  zh: ["允许非银行发行", "仅银行发行", "禁止", "不明确 / 推进中"],
};

const STANCE_SEVERITY: Record<StanceType, number> = {
  restrictive: 4,
  concerning: 3,
  review: 2,
  favorable: 1,
  pioneering: 1,
  none: 0,
};

function aggregateStance(
  stances: (StanceType | undefined)[],
  fallback: StanceType,
): StanceType {
  const counts = new Map<StanceType, number>();
  for (const s of stances) {
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  if (counts.size === 0) return fallback;
  let winner: StanceType = fallback;
  let best = -1;
  for (const [s, n] of counts) {
    if (
      n > best ||
      (n === best && STANCE_SEVERITY[s] > STANCE_SEVERITY[winner])
    ) {
      winner = s;
      best = n;
    }
  }
  return winner;
}

const INITIAL_VIEW: ViewState = {
  region: "na",
  naView: "countries",
  selectedGeoId: null,
};

function normalizeRegion(region: Region): Region {
  if (region === "latam") return "na";
  if (region === "oceania") return "asia";
  return region;
}

function normalizeViewState(view: ViewState): ViewState {
  const region = normalizeRegion(view.region);
  return region === view.region ? view : { ...view, region };
}

function viewsEqual(a: ViewState, b: ViewState): boolean {
  const left = normalizeViewState(a);
  const right = normalizeViewState(b);
  return (
    left.region === right.region &&
    left.naView === right.naView &&
    left.selectedGeoId === right.selectedGeoId
  );
}

interface MapShellProps {
  revealProgress?: number;
  dimension?: Dimension;
  lens?: DimensionLens;
  navigateRef?: MutableRefObject<((target: ViewTarget) => void) | null>;
}

export default function MapShell({
  revealProgress = 1,
  navigateRef,
}: Omit<MapShellProps, "dimension" | "lens">) {
  const { locale } = useLocale();
  // Stablecoin issuance is the primary view for this tracker.
  const [activeDimension, setActiveDimension] = useState<Dimension>("overall");
  const [activeLens, setActiveLens] = useState<DimensionLens>("stablecoin");

  // Convenience aliases so all the existing code that reads `dimension`
  // and `lens` still works without touching every reference.
  const dimension = activeDimension;
  const lens = activeLens;

  const [history, setHistory] = useState<ViewState[]>([INITIAL_VIEW]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [tooltip, setTooltipInternal] = useState<TooltipState | null>(null);
  const [hoveredFacility, setHoveredFacility] = useState<{
    dc: DataCenter;
    x: number;
    y: number;
    clusterSize: number;
  } | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<DataCenter | null>(
    null,
  );
  // Mid-drill animation target. While set, USStatesMap lifts that state
  // (scales it up, fades the rest) before naView flips to "counties" and
  // CountyMap takes over with its own zoom-in. Gives the puzzle-piece
  // "this state breaks free and we focus on it" feel.
  const [drillingTo, setDrillingTo] = useState<string | null>(null);

  // Forward-declared so the hover gates below can read it. Filled in
  // further down where the swipe gesture state actually lives.
  const isDraggingRef = useRef(false);

  // Hover updates fire dozens of times per second as the pointer crosses
  // map cells. During a region drag-swipe that thrashes React state and
  // re-renders all three mounted maps, which is the swipe-lag people
  // were feeling. Gate every hover-driven state setter behind the drag
  // flag so the gesture stays in the compositor.
  const setTooltip = useCallback<SetTooltip>((next) => {
    if (isDraggingRef.current) return;
    setTooltipInternal(next);
  }, []);

  // Data center dot visibility is driven by the lens: when the user is
  // looking at the "Data Centers" lens, show the dots; otherwise hide them.
  const showDataCenters = false;
  const handleHoverFacility = useCallback(
    (dc: DataCenter, x: number, y: number, clusterSize: number) => {
      if (isDraggingRef.current) return;
      setHoveredFacility({ dc, x, y, clusterSize });
    },
    [],
  );
  const handleLeaveFacility = useCallback(() => setHoveredFacility(null), []);
  const handleSelectFacility = (dc: DataCenter) => {
    // Drill into the state when clicking a US facility from the NA
    // continent view — otherwise the user is reading "California data
    // center" while the map still shows the whole continent. Skip the
    // drill if already scoped (avoids redundant history entries) or if
    // the facility isn't in a recognized US state.
    const shouldDrill =
      region === "na" &&
      naView === "countries" &&
      dc.country === "United States" &&
      !!dc.state &&
      !!STATE_FIPS[dc.state];
    if (shouldDrill) {
      navigateTo({
        region: "na",
        naView: "states",
        selectedGeoId: dc.state!,
      });
    }
    setSelectedFacility(dc);
    // Desktop: clear the hover state so the tooltip doesn't duplicate
    // the now-pinned panel content. Also auto-expand the panel.
    // Mobile: keep the panel as the island, and LEAVE hoveredFacility
    // set for ~2.5s so the DataCenterCard shows as a quick-peek
    // tooltip, then auto-dismisses. Users get the gist without
    // committing to opening the full sidebar.
    if (!isMobileViewport) {
      setHoveredFacility(null);
      if (panelSize === "min") setExplicitPanelSize("md");
    } else {
      // Auto-dismiss the peek tooltip after a short read window.
      window.setTimeout(() => {
        setHoveredFacility((h) => (h?.dc.id === dc.id ? null : h));
      }, 2500);
    }
  };
  const handleCloseFacility = () => setSelectedFacility(null);

  const current = history[historyIdx];
  const { region, naView, selectedGeoId } = current;
  const selectedStateName = current.selectedStateName ?? null;
  const selectedCountyFips = current.selectedCountyFips ?? null;

  const overviewEntity = useMemo(() => getOverviewEntity(region), [region]);

  const selectedEntity = useMemo((): Entity | null => {
    // In county view, synthesize an Entity from the MunicipalEntity so the
    // existing SidePanel UI keeps working without changes.
    if (region === "na" && naView === "counties" && selectedCountyFips) {
      const muni = getMunicipalityByFips(selectedCountyFips);
      if (muni) return municipalityToEntity(muni);
    }
    // When looking at a state in counties view without a county selected,
    // fall back to the overall state entity.
    if (region === "na" && naView === "counties" && selectedStateName) {
      const stateEntity = getEntity(selectedStateName, region);
      if (stateEntity) return stateEntity;
    }
    if (!selectedGeoId) return overviewEntity;
    const found = getEntity(selectedGeoId, region);
    return found ?? ENTITIES.find((e) => e.geoId === selectedGeoId) ?? overviewEntity;
  }, [
    selectedGeoId,
    region,
    naView,
    selectedStateName,
    selectedCountyFips,
    overviewEntity,
  ]);

  // ─── Browser-history sync ──────────────────────────────────────────
  //
  // We keep a rich internal stack of drill states (so the chrome Back /
  // Forward buttons can walk it) but mirror each step into
  // `window.history` so swipe-back / ⌘← and the browser chrome walk the
  // SAME stack. Without this, a trackpad swipe-back takes users out of
  // the page entirely instead of popping one drill level.
  //
  // The pointer between the two: a monotonic `navId` tagged on
  // history.state. Because we push in lock-step with navigateTo, the
  // navId doubles as the stack index for the lifetime of this mount.

  // Keep a ref mirror of `history` so the popstate handler (which only
  // binds once) can read the latest length without closing over stale
  // state.
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Tag the first entry so we can recognize it when the user pops back
    // to the initial view after drilling.
    window.history.replaceState(
      { __govNavId: 0 },
      "",
      window.location.href,
    );
    const onPopState = (e: PopStateEvent) => {
      const id = (e.state as { __govNavId?: number } | null)?.__govNavId;
      if (typeof id !== "number") return;
      const clamped = Math.max(
        0,
        Math.min(historyRef.current.length - 1, id),
      );
      setHistoryIdx(clamped);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateTo = (next: ViewState) => {
    const normalized = normalizeViewState(next);
    if (viewsEqual(current, normalized)) return;
    // Any navigation invalidates the current hover state — the geography
    // the tooltip was anchored to may no longer be on screen, so the
    // tooltip would otherwise stick in place until the user happens to
    // mouse over a fresh path.
    setTooltipInternal(null);
    setHoveredFacility(null);
    const newHistory = [...history.slice(0, historyIdx + 1), normalized];
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
    if (typeof window !== "undefined") {
      window.history.pushState(
        { __govNavId: newHistory.length - 1 },
        "",
        window.location.href,
      );
    }
  };

  // Expose navigateTo to the parent (page.tsx) so the legislation table
  // can drive map navigation when the user clicks a row.
  if (navigateRef) navigateRef.current = navigateTo;

  const handleSelectEntity = (geoId: string) => {
    setSelectedFacility(null);

    // Mobile shortcut: single-tap on a drillable US state drops the
    // user straight into the county view. Double-tap-to-drill doesn't
    // work reliably on touch (small states are hard targets, the
    // second tap often lands on the sidebar). Desktop keeps the
    // double-click flow so a single click can still "just select".
    if (
      isMobileViewport &&
      region === "na" &&
      naView === "states" &&
      getMunicipalitiesByState(geoId).length > 0
    ) {
      stageCountyDrill(geoId);
      return;
    }

    navigateTo({ ...current, selectedGeoId: geoId });
    // Desktop: clicking a country while collapsed expands the panel
    // so the user immediately sees the detail. Mobile: keep the panel
    // as the island — the user pulls it up when they want to read.
    if (!isMobileViewport && panelSize === "min") {
      setExplicitPanelSize("md");
    }
  };

  // Region pans are AMBIENT — they replace the current entry in place
  // instead of pushing a new one. Otherwise every swipe between NA/EU/
  // Asia would land in the browser back stack, and swipe-back would
  // walk through every region the user glanced at before popping a
  // real drill level. Drill navigation (selecting countries, drilling
  // into states/counties) still goes through navigateTo → pushState.
  // Any navigation between regions / drill levels should reset the
  // pinch-zoom back to 1× so the next view lands centered instead of
  // carrying over the previous view's pan offset.
  useEffect(() => {
    setUserZoom(1);
    setUserPan({ x: 0, y: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, naView, selectedStateName]);

  // iOS Safari fallback — WebKit fires native `gesture*` events for
  // multi-touch pinch *in addition to* pointer events, and on older
  // iOS versions the pointer path can drop frames or miss the second
  // finger entirely. Using gesture.scale directly is the most
  // reliable path on Safari; we preventDefault to block the browser's
  // own pinch-to-zoom-page on the same gesture.
  useEffect(() => {
    const el = mapRootRef.current;
    if (!el) return;
    let startZoom = 1;
    let startPanX = 0;
    let startPanY = 0;
    interface GestureEvent extends Event {
      scale: number;
      preventDefault(): void;
    }
    const onGestureStart = (e: Event) => {
      const g = e as GestureEvent;
      startZoom = userZoom;
      startPanX = userPan.x;
      startPanY = userPan.y;
      g.preventDefault();
    };
    const onGestureChange = (e: Event) => {
      const g = e as GestureEvent;
      g.preventDefault();
      const rawZoom = startZoom * g.scale;
      const nextZoom = Math.max(1, Math.min(3.5, rawZoom));
      if (nextZoom <= 1.02) {
        // Pinch-out past 1× → snap home.
        setUserZoom(1);
        setUserPan({ x: 0, y: 0 });
        return;
      }
      setUserZoom(nextZoom);
      // Gesture events don't give a centroid — keep the pan offset
      // steady so the map doesn't jitter. Users can two-finger drag
      // after zooming in via the pointer handlers.
      setUserPan({ x: startPanX, y: startPanY });
    };
    const onGestureEnd = (e: Event) => {
      (e as GestureEvent).preventDefault();
    };
    el.addEventListener("gesturestart", onGestureStart, { passive: false });
    el.addEventListener("gesturechange", onGestureChange, { passive: false });
    el.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegionChange = (next: Region) => {
    const updated: ViewState = {
      region: normalizeRegion(next),
      naView: "countries",
      selectedGeoId: null,
    };
    if (viewsEqual(current, updated)) return;
    setSelectedFacility(null);
    setHistory((h) => {
      const copy = [...h];
      copy[historyIdx] = updated;
      return copy;
    });
  };

  const handleResetRegion = () =>
    navigateTo({ region, naView: "countries", selectedGeoId: null });

  const handleResetStates = () =>
    navigateTo({ ...current, selectedGeoId: null });

  const handleViewStates = () => {
    navigateTo({ region: "na", naView: "states", selectedGeoId: null });
    // On mobile the expanded panel would still be covering the map
    // after this navigation, so the user's "View state policies" tap
    // looked like it opened a white screen. Collapse back to the
    // island so the new view is the first thing they see.
    if (isMobileViewport) setExplicitPanelSize("min");
  };

  // Clicking a US state from the continental (countries) view drills into
  // the states view with that state preselected. Keeps a single click flow.
  const handleSelectUsState = (stateName: string) => {
    setSelectedFacility(null);
    navigateTo({
      region: "na",
      naView: "states",
      selectedGeoId: stateName,
    });
  };

  const handleDoubleClickUsState = (stateName: string) => {
    if (getMunicipalitiesByState(stateName).length > 0) {
      stageCountyDrill(stateName);
    } else {
      handleSelectUsState(stateName);
    }
  };

  // Two-phase drill: first lift the target state in USStatesMap, then
  // (after the lift settles) flip to CountyMap which runs its own
  // zoom-in. Total perceived motion ~1s.
  const DRILL_LIFT_MS = 360;
  const stageCountyDrill = (stateName: string) => {
    setDrillingTo(stateName);
    // On mobile, collapse the panel so the lift animation + county
    // map are actually visible instead of happening behind an opaque
    // sheet. Desktop keeps the panel open — there's room.
    if (isMobileViewport) setExplicitPanelSize("min");
    window.setTimeout(() => {
      handleViewCounties(stateName);
      // Reset on the next frame so the fade-out doesn't briefly ghost
      // back over CountyMap.
      requestAnimationFrame(() => setDrillingTo(null));
    }, DRILL_LIFT_MS);
  };

  const handleViewCounties = (stateName: string) =>
    navigateTo({
      region: "na",
      naView: "counties",
      selectedGeoId: null,
      selectedStateName: stateName,
      selectedCountyFips: null,
    });

  const handleSelectCounty = (fips: string) => {
    setSelectedFacility(null);
    navigateTo({
      ...current,
      naView: "counties",
      selectedCountyFips: fips,
    });
    if (panelSize === "min") {
      setExplicitPanelSize("md");
    }
  };

  const handleResetCounties = () =>
    navigateTo({
      ...current,
      naView: "counties",
      selectedCountyFips: null,
    });

  const handleDoubleClickEntity = (_geoId: string) => {
    // State/county drill-down disabled for stablecoin policy view
  };

  const handleSearchNavigate = (target: ViewTarget) => navigateTo(target);

  // ─── Keyboard navigation ───────────────────────────────────────────
  // The map is discrete-view (NA / EU / Asia / Africa + drill levels), not a
  // continuous pan, so WASD / arrows step between views rather than
  // panning pixels. Mapping:
  //   A / ←  → previous region          D / →  → next region
  //   1 / 2 / 3 / 4                      jump to NA / EU / Asia / Africa
  //   W / ↑                              drill out (browser-back, follows the rich stack)
  //   S / ↓                              drill into the currently-selected country / state
  //   Esc                                close facility card or reset selection
  // Listener bound to window because the SVG <Map> isn't focusable on its own.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onKeyDown(e: KeyboardEvent) {
      // Don't hijack typing in inputs, textareas, contenteditable surfaces,
      // or while a modifier is held (so ⌘← back gestures still work).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          t.isContentEditable
        ) {
          return;
        }
      }

      const key = e.key.toLowerCase();
      const idx = REGION_ORDER.indexOf(region);
      switch (key) {
        case "a":
        case "arrowleft": {
          const prev = REGION_ORDER[(idx - 1 + REGION_ORDER.length) % REGION_ORDER.length];
          handleRegionChange(prev);
          e.preventDefault();
          return;
        }
        case "d":
        case "arrowright": {
          const next = REGION_ORDER[(idx + 1) % REGION_ORDER.length];
          handleRegionChange(next);
          e.preventDefault();
          return;
        }
        case "1":
          handleRegionChange("na");
          e.preventDefault();
          return;
        case "2":
          handleRegionChange("eu");
          e.preventDefault();
          return;
        case "3":
          handleRegionChange("asia");
          e.preventDefault();
          return;
        case "4":
          handleRegionChange("africa");
          e.preventDefault();
          return;
        case "w":
        case "arrowup": {
          // Drill out follows the same stack the browser back button walks,
          // so the cue stays consistent across keyboard / swipe / chrome.
          if (history.length > 1 && historyIdx > 0) {
            window.history.back();
            e.preventDefault();
          }
          return;
        }
        case "s":
        case "arrowdown": {
          // Drill in: continental US selected → states map; state selected
          // with municipal data → counties; otherwise no-op.
          // State/county drill-down disabled
          return;
        }
        case "escape": {
          if (selectedFacility) {
            handleCloseFacility();
            e.preventDefault();
          } else if (selectedGeoId) {
            handleResetRegion();
            e.preventDefault();
          }
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [region, naView, selectedGeoId, selectedFacility, history.length, historyIdx]);

  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const items: BreadcrumbItem[] = [
      {
        label: REGION_LABEL[region],
        onClick:
          (region === "na" && (naView === "states" || selectedGeoId)) ||
          (region !== "na" && selectedGeoId)
            ? handleResetRegion
            : undefined,
      },
    ];

    // The US has two distinct drill stages — looking at the federal
    // entity from the country view, vs. drilling into the states map.
    // Use different labels so a zoom-to-drill from one to the other is
    // visible in the depth path.
    if (
      region === "na" &&
      naView === "countries" &&
      selectedGeoId === "840"
    ) {
      items.push({ label: "US Federal" });
    } else if (region === "na" && naView === "states") {
      items.push({
        label: "US States",
        onClick: selectedGeoId ? handleResetStates : undefined,
      });
      if (selectedGeoId && selectedEntity && !selectedEntity.isOverview) {
        items.push({ label: selectedEntity.name });
      }
    } else if (region === "na" && naView === "counties" && selectedStateName) {
      items.push({
        label: "US States",
        onClick: handleViewStates,
      });
      items.push({
        label: selectedStateName,
        onClick: selectedCountyFips ? handleResetCounties : undefined,
      });
      if (selectedCountyFips) {
        const muni = getMunicipalityByFips(selectedCountyFips);
        if (muni) items.push({ label: muni.name });
      }
    } else if (
      selectedGeoId &&
      selectedEntity &&
      !selectedEntity.isOverview
    ) {
      items.push({ label: selectedEntity.name });
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    region,
    naView,
    selectedGeoId,
    selectedStateName,
    selectedCountyFips,
    selectedEntity,
    history,
    historyIdx,
  ]);

  const showViewStatesButton = false;

  // Show "View local actions →" in the panel when the selected US state
  // has county-level municipal data. Gives a discoverable entry point
  // that doesn't rely on the user guessing the double-click gesture.
  const showViewCountiesButton =
    region === "na" &&
    naView === "states" &&
    selectedGeoId !== null &&
    getMunicipalitiesByState(selectedGeoId).length > 0;

  // Aggregate the selected state's county actions into Legislation rows
  // for the sidebar's "Local" tab. This lets users browse local actions
  // without drilling — the zoom is for folks who want the geographic
  // layout, not a required step.
  const stateLocalActions: Legislation[] = useMemo(() => {
    if (region !== "na" || naView !== "counties") return [];
    const stateName = selectedStateName ?? selectedGeoId;
    if (!stateName) return [];
    const munis = getMunicipalitiesByState(stateName);
    if (munis.length === 0) return [];
    const stateFacilities = ALL_FACILITIES.filter(
      (f) => f.state === stateName,
    );
    const rows: Legislation[] = [];
    let idx = 0;
    for (const m of munis) {
      for (const a of m.actions) {
        const base = actionToLegislation(
          a,
          idx++,
          findRelatedFacilities(a, stateFacilities),
        );
        // Prefix county name so each row is identifiable when the list
        // is flattened across many counties.
        rows.push({
          ...base,
          title: `${m.name} · ${base.title}`,
        });
      }
    }
    // Enacted first, then under-review, proposed, failed. Within each,
    // most recent updatedDate wins.
    const order: Record<string, number> = {
      Enacted: 4,
      Floor: 3,
      Committee: 2,
      Filed: 1,
      "Carried Over": 0,
      Dead: -1,
    };
    rows.sort((a, b) => {
      const diff = (order[b.stage] ?? 0) - (order[a.stage] ?? 0);
      if (diff !== 0) return diff;
      return (b.updatedDate ?? "").localeCompare(a.updatedDate ?? "");
    });
    return rows;
  }, [region, naView, selectedGeoId, selectedStateName]);

  const regionIdx = REGION_ORDER.indexOf(region);

  const zoomT = Math.max(0, Math.min(1, (revealProgress - 0.55) / 0.45));
  const baseMapScale = 0.88 + zoomT * 0.12;
  const chromeOpacity = Math.max(0, Math.min(1, (revealProgress - 0.85) / 0.12));

  // Panel state lives here so the map can react to it. The panel defaults
  // to the expanded `md` shape on every viewport — users on mobile can still
  // collapse it to the Dynamic Island via the drag-down gesture. Their
  // explicit choice (if any) takes precedence over the default.
  const isMobileViewport = useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(max-width: 1023px)");
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 1023px)").matches
        : false,
    () => false,
  );
  const [explicitPanelSize, setExplicitPanelSize] = useState<
    "min" | "md" | null
  >(null);
  // Mobile defaults to the Dynamic Island so the map gets the full
  // viewport. Desktop defaults to the expanded panel since the sidebar
  // sits to the side and doesn't steal map real estate.
  const panelSize: "min" | "md" =
    explicitPanelSize ?? (isMobileViewport ? "min" : "md");

  // The map SVG is authored at a 960×600 aspect ratio (1.6:1). In a
  // narrow portrait viewport, "fit to width + preserve aspect" leaves
  // huge vertical whitespace. Scaling the container up via CSS is the
  // cheapest fix — 1.65× fills most phones without pushing the US off
  // screen, and the rail transition still works since the scale is
  // applied above it.
  // Mobile states view needed a touch more margin so the east coast
  // doesn't clip off the right edge; dial from 2.0 → 1.8. Still fills
  // the vertical whitespace but keeps NY/ME in frame.
  const panelExtraZoom =
    panelSize === "min" ? (isMobileViewport ? 1.8 : 1.55) : 1.0;

  const mapRootRef = useRef<HTMLDivElement>(null);

  // ─── Mobile pinch-zoom + two-finger pan ────────────────────────────
  //
  // A user-controlled zoom/pan layer sits between the base map scale and
  // the rail. Two simultaneous pointers activate pinch mode: the map
  // scales around the pinch midpoint and translates with the centroid.
  // A single pointer always falls through to the region-swipe path so
  // horizontal flicks still work.
  //
  // State is reset whenever the user changes region or drill level so
  // a zoom applied to "NA / counties / Loudoun" doesn't follow them
  // back out to "NA / states".
  const [userZoom, setUserZoom] = useState(1);
  const [userPan, setUserPan] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{
    startDist: number;
    startMidX: number;
    startMidY: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );


  // ─── Interactive drag-swipe between regions ──────────────────────
  //
  // The rail follows the pointer in real time (finger-tracking), with
  // rubber-band resistance at the terminal regions, and commits on
  // release via either distance OR velocity — so a quick flick switches
  // regions even if the absolute displacement is small. This is what
  // makes the gesture feel native instead of "tap to switch".
  //
  // We keep the rail's transform as `translate3d(pxOffset, 0, 0)` on
  // top of the index-based `translateX(-N * 100%)` so the drag state
  // stays in the compositor (no React re-render per pointer move for
  // the map subtree — only the thin rail div updates).
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    time: number;
    lastX: number;
    lastT: number;
    velocity: number;
    active: boolean;
    axisLocked: "x" | "y" | null;
    swiped: boolean;
    pointerId: number;
    // Single-finger PAN mode — set when the gesture starts while the
    // user is already zoomed in. Pinned userPan values so move deltas
    // are applied relative to the finger's initial position, not the
    // accumulated pan from prior gestures.
    panMode: boolean;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  // The drag runs entirely in the DOM layer — no React state updates
  // from pointerdown through pointerup, so the D3 map subtrees (which
  // aren't memoized) don't re-render during the gesture. We only let
  // React take over when a drag COMMITS to a new region, at which point
  // `handleRegionChange` triggers the one needed render.
  const railRef = useRef<HTMLDivElement>(null);
  const dragPxRef = useRef(0);

  const SNAP_TRANSITION = "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)";

  const writeRailTransform = (offsetPx: number) => {
    const el = railRef.current;
    if (!el) return;
    const idx = REGION_ORDER.indexOf(region);
    el.style.transform = `translate3d(calc(${-idx * 100}% + ${offsetPx}px), 0, 0)`;
  };

  const AXIS_LOCK_THRESHOLD = 8;
  const COMMIT_DISTANCE_RATIO = 0.22; // 22% of viewport width
  const COMMIT_VELOCITY = 0.5; // px/ms — flick threshold
  const RUBBER_BAND = 0.38;

  const applyRubberBand = (dx: number, atEdge: boolean) => {
    if (!atEdge) return dx;
    const sign = Math.sign(dx);
    const mag = Math.abs(dx);
    // Diminishing-returns resistance à la iOS scrollview.
    return sign * mag * RUBBER_BAND;
  };

  const onMapPointerDown = (e: React.PointerEvent) => {
    // Only drag from primary mouse button / touch / pen. Right-click
    // and middle-click shouldn't start a gesture.
    if (e.pointerType === "mouse" && e.button !== 0) return;

    activePointersRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
    });

    // Second touch arriving — enter pinch mode. Cancel any region-swipe
    // in progress so the finger drag doesn't fight the pinch gesture.
    if (activePointersRef.current.size === 2) {
      const [p1, p2] = Array.from(activePointersRef.current.values());
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      pinchRef.current = {
        startDist: Math.hypot(dx, dy) || 1,
        startMidX: (p1.x + p2.x) / 2,
        startMidY: (p1.y + p2.y) / 2,
        startZoom: userZoom,
        startPanX: userPan.x,
        startPanY: userPan.y,
      };
      swipeRef.current = null;
      isDraggingRef.current = false;
      return;
    }

    swipeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      time: performance.now(),
      lastX: e.clientX,
      lastT: performance.now(),
      velocity: 0,
      active: false,
      axisLocked: null,
      swiped: false,
      pointerId: e.pointerId,
      // When already zoomed, single-finger drags pan the map instead
      // of swiping regions. User has to zoom out first to change
      // regions (or will snap to baseline on pinch out).
      panMode: userZoom > 1.02,
      startPanX: userPan.x,
      startPanY: userPan.y,
    };
  };

  const onMapPointerMove = (e: React.PointerEvent) => {
    // Update latest position for this pointer (needed by pinch logic).
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });
    }

    // Pinch-zoom / two-finger pan — consumes the move; no region swipe.
    if (pinchRef.current && activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const [p1, p2] = pts;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const b = pinchRef.current;
      const rawZoom = b.startZoom * (dist / b.startDist);
      const nextZoom = Math.max(1, Math.min(3.5, rawZoom));
      // Snap to baseline the moment zoom collapses back to (near) 1×.
      // Resets pan too so pinching out feels like "home" rather than
      // leaving the map parked at whatever offset it had at 1.01×.
      if (nextZoom <= 1.02) {
        setUserZoom(1);
        setUserPan({ x: 0, y: 0 });
        e.preventDefault();
        return;
      }
      const nextPanX = b.startPanX + (midX - b.startMidX);
      const nextPanY = b.startPanY + (midY - b.startMidY);
      // Clamp pan so the user can't fling the map into empty viewport —
      // ceiling grows with zoom level (more room to pan when zoomed in).
      const w = mapRootRef.current?.clientWidth ?? window.innerWidth;
      const h = mapRootRef.current?.clientHeight ?? window.innerHeight;
      const maxPanX = (w * (nextZoom - 1)) / 2 + 120;
      const maxPanY = (h * (nextZoom - 1)) / 2 + 120;
      setUserZoom(nextZoom);
      setUserPan({
        x: Math.max(-maxPanX, Math.min(maxPanX, nextPanX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, nextPanY)),
      });
      e.preventDefault();
      return;
    }

    const s = swipeRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    // Single-finger PAN when already zoomed — move the map, not the
    // region rail. Clamped to the same bounds the pinch handler uses.
    if (s.panMode) {
      e.preventDefault();
      const w = mapRootRef.current?.clientWidth ?? window.innerWidth;
      const h = mapRootRef.current?.clientHeight ?? window.innerHeight;
      const maxPanX = (w * (userZoom - 1)) / 2 + 120;
      const maxPanY = (h * (userZoom - 1)) / 2 + 120;
      const nextPanX = s.startPanX + dx;
      const nextPanY = s.startPanY + dy;
      setUserPan({
        x: Math.max(-maxPanX, Math.min(maxPanX, nextPanX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, nextPanY)),
      });
      return;
    }

    // Axis lock — once the finger has moved ~8px in either axis, we
    // commit to that axis for the rest of the gesture. Horizontal →
    // we own it and drive the rail; vertical → bail so the page can
    // scroll (mobile) without hijacking.
    if (!s.axisLocked) {
      if (Math.abs(dx) > AXIS_LOCK_THRESHOLD || Math.abs(dy) > AXIS_LOCK_THRESHOLD) {
        s.axisLocked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (s.axisLocked === "x") {
          s.active = true;
          isDraggingRef.current = true;
          // Clear any stale tooltip / hover card on drag start so the
          // chrome doesn't track a stationary pointer.
          setTooltipInternal(null);
          setHoveredFacility(null);
          // Kill the transition so the rail tracks 1:1 with the finger.
          // Restored on release via `finishDrag`.
          if (railRef.current) railRef.current.style.transition = "none";
          // Capture further pointer events so we keep tracking even if
          // the finger leaves the map bounds. Bind to currentTarget so
          // unmounting SVG paths mid-drag can't drop the capture.
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        }
      }
    }
    if (s.axisLocked !== "x") return;
    e.preventDefault();

    // Velocity tracking — exponential smoothing keeps it responsive
    // without jittering on a single noisy sample.
    const now = performance.now();
    const dt = Math.max(1, now - s.lastT);
    const instV = (e.clientX - s.lastX) / dt;
    s.velocity = s.velocity * 0.6 + instV * 0.4;
    s.lastX = e.clientX;
    s.lastT = now;

    const idx = REGION_ORDER.indexOf(region);
    const atLeftEdge = idx === 0 && dx > 0;
    const atRightEdge = idx === REGION_ORDER.length - 1 && dx < 0;
    const offset = applyRubberBand(dx, atLeftEdge || atRightEdge);
    dragPxRef.current = offset;
    writeRailTransform(offset);
  };

  const endDrag = (commitIdx: number | null) => {
    const s = swipeRef.current;
    dragPxRef.current = 0;
    isDraggingRef.current = false;
    const idx = REGION_ORDER.indexOf(region);
    const committing = s && commitIdx != null && commitIdx !== idx;
    const el = railRef.current;

    if (committing) {
      // Let React drive the snap: handleRegionChange updates `region`,
      // which re-renders the rail with transition restored and the
      // new `-commitIdx * 100%` transform — the browser interpolates
      // from the current dragged position (which we leave in place on
      // the element; React's style-prop diff will overwrite it to the
      // new canonical value so the transition runs from "here" → target).
      if (el) el.style.transition = SNAP_TRANSITION;
      s!.swiped = true;
      handleRegionChange(REGION_ORDER[commitIdx!]);
    } else if (el) {
      // Snap back to the current region without touching React state —
      // no re-render, no map repaint, just a GPU-composited transition.
      el.style.transition = SNAP_TRANSITION;
      el.style.transform = `translate3d(${-idx * 100}%, 0, 0)`;
    }
  };

  const onMapPointerUp = (e: React.PointerEvent) => {
    // Lifting a finger during pinch — exit pinch mode as soon as we
    // drop below two active pointers.
    activePointersRef.current.delete(e.pointerId);
    if (pinchRef.current && activePointersRef.current.size < 2) {
      pinchRef.current = null;
      swipeRef.current = null;
      return;
    }

    const s = swipeRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    if (!s.active) {
      swipeRef.current = null;
      return;
    }
    const width = mapRootRef.current?.clientWidth ?? window.innerWidth;
    const dx = e.clientX - s.startX;
    const idx = REGION_ORDER.indexOf(region);
    const len = REGION_ORDER.length;

    // Commit on distance OR flick velocity. Velocity wins first because
    // a quick flick should always switch even if distance is tiny.
    let commitIdx = idx;
    if (s.velocity <= -COMMIT_VELOCITY && idx < len - 1) {
      commitIdx = idx + 1;
    } else if (s.velocity >= COMMIT_VELOCITY && idx > 0) {
      commitIdx = idx - 1;
    } else if (Math.abs(dx) > width * COMMIT_DISTANCE_RATIO) {
      if (dx < 0 && idx < len - 1) commitIdx = idx + 1;
      else if (dx > 0 && idx > 0) commitIdx = idx - 1;
    }
    endDrag(commitIdx);
  };

  const onMapPointerCancel = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (pinchRef.current && activePointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    const s = swipeRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    endDrag(null);
    swipeRef.current = null;
  };

  const onMapClickCapture = (e: React.MouseEvent) => {
    if (swipeRef.current?.swiped || swipeRef.current?.active) {
      e.stopPropagation();
      e.preventDefault();
      swipeRef.current = null;
    }
  };

  // Click on empty map area = "step out of detail." Cascades:
  //   pinned facility  →  clear facility
  //   any selection    →  clear selection (back to region / counties overview)
  //   no selection     →  pop one drill level (counties → states → countries)
  // We detect "empty" by checking the click target — geography paths and
  // data-center circles are the only real interactive primitives. Clicks
  // on those bubble up here too, so we ignore the event when the target
  // sits inside one.
  const onMapBackgroundClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current || swipeRef.current?.swiped) return;
    const target = e.target as Element | null;
    // Interactive primitives we never want to treat as "empty map area":
    // geography fills (path), facility glyph hit-targets (rect / circle),
    // cluster count labels (text). rect was missing here, which is why
    // clicking a DC from county/state view reset the view — the click
    // bubbled up and this handler fired "step out of detail."
    if (target?.closest?.("path, rect, circle, text")) return;

    if (selectedFacility) {
      setSelectedFacility(null);
      return;
    }
    if (region === "na" && naView === "counties" && selectedCountyFips) {
      handleResetCounties();
      return;
    }
    if (selectedGeoId) {
      navigateTo({
        ...current,
        selectedGeoId: null,
      });
      return;
    }
    if (region === "na" && naView === "counties") {
      handleViewStates();
      return;
    }
    if (region === "na" && naView === "states") {
      handleResetRegion();
      return;
    }
  };

  // ─── Wheel gestures: drill (cmd+wheel / pinch) + region swipe ──────
  //
  // Two gestures share one wheel listener:
  //
  //   1. ⌘/ctrl + wheel (or trackpad pinch, which fires `wheel` with
  //      ctrlKey=true on macOS) drills the NA stack one level.
  //   2. Horizontal trackpad swipe (deltaX-dominant wheel events with
  //      no modifier) navigates between regions, mirroring the touch
  //      swipe behavior on mobile.
  //
  // The listener is bound to the map root, not window — so wheel
  // gestures over the chrome (depth pill, panel, search) don't trigger
  // these. We gate on `chromeOpacity` so we don't hijack scroll during
  // the hero reveal phase.
  useEffect(() => {
    const el = mapRootRef.current;
    if (!el) return;
    if (chromeOpacity < 0.5) return;

    let lastZoomAction = 0;
    let lastZoomEventAt = 0;
    let zoomAccum = 0;
    const ZOOM_THRESHOLD = 14;
    const ZOOM_COOLDOWN_MS = 550;
    const ZOOM_GAP_MS = 140;

    let lastSwipeAction = 0;
    let lastSwipeEventAt = 0;
    let swipeAccum = 0;
    const SWIPE_THRESHOLD = 60;
    const SWIPE_COOLDOWN_MS = 700;
    const SWIPE_GAP_MS = 160;

    const drillIn = () => {
      if (region === "na" && naView === "countries") {
        navigateTo({ region: "na", naView: "states", selectedGeoId: null });
        return true;
      }
      return false;
    };

    const drillOut = () => {
      if (region === "na" && naView === "counties") {
        navigateTo({
          region: "na",
          naView: "states",
          selectedGeoId: selectedStateName,
        });
        return true;
      }
      if (region === "na" && naView === "states") {
        navigateTo({
          region: "na",
          naView: "countries",
          selectedGeoId: null,
        });
        return true;
      }
      return false;
    };

    const swipeRegion = (dir: 1 | -1) => {
      // Clamp at the ends instead of wrapping. The wrap (Asia → NA) jumps
      // halfway across the globe, which trackpad inertia turns into a
      // double-fire and feels glitchy. Hitting a wall at Asia is more
      // predictable.
      const idx = REGION_ORDER.indexOf(region);
      const next = idx + dir;
      if (next < 0 || next >= REGION_ORDER.length) return false;
      handleRegionChange(REGION_ORDER[next]);
      return true;
    };

    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      const isZoom = e.ctrlKey || e.metaKey;

      if (isZoom) {
        // preventDefault stops the browser's native page-zoom and lets
        // us own the gesture. Requires { passive: false }.
        e.preventDefault();
        if (now - lastZoomAction < ZOOM_COOLDOWN_MS) {
          lastZoomEventAt = now;
          return;
        }
        if (now - lastZoomEventAt > ZOOM_GAP_MS) zoomAccum = 0;
        lastZoomEventAt = now;
        zoomAccum += e.deltaY;
        if (zoomAccum <= -ZOOM_THRESHOLD) {
          if (drillIn()) {
            lastZoomAction = now;
            zoomAccum = 0;
          }
        } else if (zoomAccum >= ZOOM_THRESHOLD) {
          if (drillOut()) {
            lastZoomAction = now;
            zoomAccum = 0;
          }
        }
        return;
      }

      // Region swipe — only when the gesture is dominantly horizontal,
      // so vertical page scrolling still works over the map area.
      const horizontal = Math.abs(e.deltaX);
      const vertical = Math.abs(e.deltaY);
      if (horizontal < 4 || horizontal < vertical * 1.4) {
        return;
      }
      // Block the browser's own swipe-back navigation while we use the
      // gesture for region changes.
      e.preventDefault();
      if (now - lastSwipeAction < SWIPE_COOLDOWN_MS) {
        lastSwipeEventAt = now;
        return;
      }
      if (now - lastSwipeEventAt > SWIPE_GAP_MS) swipeAccum = 0;
      lastSwipeEventAt = now;
      swipeAccum += e.deltaX;
      if (swipeAccum >= SWIPE_THRESHOLD) {
        if (swipeRegion(1)) {
          lastSwipeAction = now;
          swipeAccum = 0;
        }
      } else if (swipeAccum <= -SWIPE_THRESHOLD) {
        if (swipeRegion(-1)) {
          lastSwipeAction = now;
          swipeAccum = 0;
        }
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // navigateTo / handleRegionChange close over current state; rebind
    // on view changes so the handler always reflects the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chromeOpacity, region, naView, selectedStateName]);

  // ─── Direction-aware drill animation ──────────────────────────────
  //
  // Each NA drill stage has a depth: countries=0, states=1, counties=2.
  // We compare against the previous render to choose the right keyframe
  // — drilling deeper plays `drill-in` (zoom-from-far), pulling back
  // plays `drill-out` (settle-from-close). On region change we don't
  // animate (the slide rail handles that).
  const NA_DEPTH: Record<NaView, number> = useMemo(
    () => ({ countries: 0, states: 1, counties: 2 }),
    [],
  );
  const prevDepthRef = useRef<number>(NA_DEPTH[naView]);
  const prevRegionRef = useRef<Region>(region);
  const drillAnimClass = useMemo(() => {
    const prev = prevDepthRef.current;
    const next = NA_DEPTH[naView];
    const sameRegion = prevRegionRef.current === region;
    if (!sameRegion || prev === next) return "";
    return next > prev ? "animate-drill-in" : "animate-drill-out";
  }, [naView, region, NA_DEPTH]);
  useEffect(() => {
    prevDepthRef.current = NA_DEPTH[naView];
    prevRegionRef.current = region;
  }, [naView, region, NA_DEPTH]);

  // Stepper breadcrumb — same as the internal breadcrumb, but with a
  // trailing "Data center" segment when a facility is pinned so the
  // user can pop out of facility mode from the bottom pill.
  const stepperBreadcrumb: BreadcrumbItem[] = useMemo(() => {
    if (selectedFacility) {
      return [
        ...breadcrumbItems,
        { label: "Data center", onClick: () => setSelectedFacility(null) },
      ];
    }
    return breadcrumbItems;
  }, [breadcrumbItems, selectedFacility]);

  return (
    <div ref={mapRootRef} className="fixed inset-0 bg-white overflow-hidden z-0">
      {/* Outer wrapper — animated extra zoom driven by panel state.
          Inner wrapper — scroll-driven base zoom (snaps with scroll). */}
      <div
        className="absolute inset-0"
        style={{
          transform: `scale(${panelExtraZoom})`,
          transformOrigin: "center center",
          // NO `will-change: transform` here — it promotes the subtree
          // to its own GPU layer, which caches the SVG as a bitmap and
          // scales THAT. On mobile with 1.8× zoom the cached bitmap
          // reads as blurry. Letting the compositor re-rasterize SVG
          // geometry each frame costs a bit of CPU but keeps vectors
          // crisp.
          touchAction: "pan-y",
          transition: "transform 500ms cubic-bezier(0.5, 1.55, 0.4, 1)",
        }}
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerUp}
        onPointerCancel={onMapPointerCancel}
        onClickCapture={onMapClickCapture}
        onClick={onMapBackgroundClick}
      >
      <div
        className="absolute inset-0"
        style={{
          transform: `scale(${baseMapScale})`,
          transformOrigin: "center center",
        }}
      >
      {/* User pinch/pan layer — sits between baseMapScale and the rail
          so pinch-zoom transforms the content without fighting the
          region rail's own translate. Transition is absent so the
          map tracks the pinch 1:1; it snaps back softly when reset. */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate3d(${userPan.x}px, ${userPan.y}px, 0) scale(${userZoom})`,
          transformOrigin: "center center",
          // will-change dropped for the same reason as the base scale
          // wrapper — prevents the browser from caching the SVG as a
          // bitmap and scaling it, which looks blurry at 2–3× zoom.
          transition:
            pinchRef.current === null
              ? "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)"
              : "none",
        }}
      >
        {/* Sliding region rail — all three regions rendered side-by-side.
            During a finger-drag we disable the CSS transition and drive
            the rail with a pixel offset so it tracks the pointer 1:1.
            On release the transition snaps into a spring-ish curve that
            settles past the target for a subtle "stuck the landing" cue. */}
        <div
          ref={railRef}
          className="absolute inset-0 flex"
          style={{
            transform: `translate3d(${-regionIdx * 100}%, 0, 0)`,
            transition: SNAP_TRANSITION,
            willChange: "transform",
          }}
        >
          {REGION_ORDER.map((r) => (
          <div
            key={r}
            className="w-full h-full flex-shrink-0 flex items-center justify-center"
          >
            {r === "na" && (
              <div
                key={`na-${naView}-${selectedStateName ?? ""}`}
                className={`w-full h-full ${drillAnimClass}`}
              >
                {naView === "countries" && (
                  <NorthAmericaMap
                    onSelectEntity={handleSelectEntity}
                    onDoubleClickEntity={handleDoubleClickEntity}
                    onSelectUsState={() => {}}
                    onDoubleClickUsState={() => {}}
                    selectedGeoId={selectedGeoId}
                    setTooltip={setTooltip}
                    dimension={dimension} lens={lens}
                    showDataCenters={showDataCenters}
                    onHoverFacility={handleHoverFacility}
                    onLeaveFacility={handleLeaveFacility}
                    onSelectFacility={handleSelectFacility}
                  />
                )}
                {naView === "states" && (
                  <USStatesMap
                    onSelectEntity={handleSelectEntity}
                    onDoubleClickEntity={handleDoubleClickEntity}
                    selectedGeoId={selectedGeoId}
                    setTooltip={setTooltip}
                    dimension={dimension} lens={lens}
                    showDataCenters={showDataCenters}
                    onHoverFacility={handleHoverFacility}
                    onLeaveFacility={handleLeaveFacility}
                    onSelectFacility={handleSelectFacility}
                    drillingTo={drillingTo}
                  />
                )}
                {naView === "counties" && selectedStateName && (
                  <CountyMap
                    stateName={selectedStateName}
                    onSelectCounty={handleSelectCounty}
                    selectedCountyFips={selectedCountyFips}
                    setTooltip={setTooltip}
                    showDataCenters={showDataCenters}
                    onHoverFacility={handleHoverFacility}
                    onLeaveFacility={handleLeaveFacility}
                    onSelectFacility={handleSelectFacility}
                  />
                )}
              </div>
            )}
            {r === "eu" && (
              <EuropeMap
                onSelectEntity={handleSelectEntity}
                selectedGeoId={r === region ? selectedGeoId : null}
                setTooltip={setTooltip}
                dimension={dimension} lens={lens}
                showDataCenters={showDataCenters}
                onHoverFacility={handleHoverFacility}
                onLeaveFacility={handleLeaveFacility}
                onSelectFacility={handleSelectFacility}
              />
            )}
            {r === "asia" && (
              <AsiaMap
                onSelectEntity={handleSelectEntity}
                selectedGeoId={r === region ? selectedGeoId : null}
                setTooltip={setTooltip}
                dimension={dimension} lens={lens}
                showDataCenters={showDataCenters}
                onHoverFacility={handleHoverFacility}
                onLeaveFacility={handleLeaveFacility}
                onSelectFacility={handleSelectFacility}
              />
            )}
            {r === "africa" && (
              <AfricaMap
                onSelectEntity={handleSelectEntity}
                selectedGeoId={r === region ? selectedGeoId : null}
                setTooltip={setTooltip}
                dimension={dimension} lens={lens}
                showDataCenters={showDataCenters}
                onHoverFacility={handleHoverFacility}
                onLeaveFacility={handleLeaveFacility}
                onSelectFacility={handleSelectFacility}
              />
            )}
          </div>
        ))}
        </div>
      </div>
      </div>
      </div>

      {/* Floating side panel — self-positioned via its own state. */}
      <SidePanel
        entity={selectedEntity}
        showViewStatesButton={showViewStatesButton}
        onViewStates={handleViewStates}
        showViewCountiesButton={showViewCountiesButton}
        onViewCounties={
          selectedGeoId
            ? () => stageCountyDrill(selectedGeoId)
            : undefined
        }
        visibility={chromeOpacity}
        size={panelSize}
        onSizeChange={setExplicitPanelSize}
        isMobileViewport={isMobileViewport}
        facility={selectedFacility}
        onCloseFacility={handleCloseFacility}
        onSelectFacility={handleSelectFacility}
        lens={lens}
        localActions={stateLocalActions}
      />

      {/* Top toolbar — region tabs + search trigger + ?  shortcut help.
          Replaces the old separate top-right RegionNav and floating
          SearchPill so the chrome reads as one intentional bar. */}
      <div
        style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity < 0.5 ? "none" : "auto" }}
      >
        <TopToolbar
          region={region}
          onRegionChange={handleRegionChange}
          onSearchNavigate={handleSearchNavigate}
        />
      </div>

      {/* Visitors widget — top-right of the map, desktop only. Matches
          the toolbar's fixed-chrome pattern: gated on chromeOpacity so
          it fades in with the rest of the map UI once the hero reveal
          is complete. */}
      <div
        className="hidden md:block fixed top-16 right-6 z-30"
        style={{
          opacity: chromeOpacity,
          pointerEvents: chromeOpacity < 0.5 ? "none" : "auto",
        }}
      >
        <VisitorsWidget />
      </div>

      {/* Bottom-right zoom controls — give users a + / − way to scale
          the map when pinch isn't available (desktop trackpad that
          doesn't ctrl+scroll, or mobile browsers that don't fire the
          gesture events cleanly). Stacked vertically so they don't
          fight the depth stepper or data-center legend at the bottom
          right. Same chrome language as the toolbar. */}
      <div
        className="fixed bottom-28 right-4 lg:bottom-6 lg:right-6 z-30"
        style={{
          opacity: chromeOpacity,
          pointerEvents: chromeOpacity < 0.5 ? "none" : "auto",
        }}
      >
        <div
          className="flex flex-col rounded-full bg-white/85 backdrop-blur-2xl border border-black/[.04] overflow-hidden"
          style={{
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              setUserZoom((z) => Math.min(3.5, +(z * 1.25).toFixed(3)))
            }
            className="w-9 h-9 flex items-center justify-center text-ink/70 hover:text-ink active:scale-95 transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M7 3 V11 M3 7 H11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="h-px bg-black/[.06]" aria-hidden />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => {
              setUserZoom((z) => {
                const next = Math.max(1, +(z / 1.25).toFixed(3));
                // Snap back to a centered view when returning to 1×
                // so a previous pinch-pan doesn't leave the map
                // lopsided after zooming fully out.
                if (next === 1) setUserPan({ x: 0, y: 0 });
                return next;
              });
            }}
            className="w-9 h-9 flex items-center justify-center text-ink/70 hover:text-ink active:scale-95 transition"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M3 7 H11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom-center depth stepper — drill breadcrumb. Visible in
          every drill state; grows with depth. */}
      <div
        style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity < 0.5 ? "none" : "auto" }}
      >
        <DepthStepper
          region={region}
          onRegionChange={handleRegionChange}
          segments={stepperBreadcrumb}
        />
      </div>

      {/* Mobile legend moved into the `?` help sheet in the top toolbar —
          it was stealing valuable vertical space from the map. Desktop
          still gets the DC legend block below when the DC layer is on. */}

      {/* Data center legend — Apple-style card, shown when the DC layer
          is active. Hidden on mobile (below `lg`) because the
          bottom-anchored side panel already occupies that area and
          would overlap. The dot colors are intuitive enough without it
          on small screens. */}
      {showDataCenters && (
        <div
          className="hidden lg:block fixed bottom-28 right-6 z-20 w-[13.5rem]"
          style={{
            opacity: chromeOpacity,
            pointerEvents: "none",
          }}
        >
          <div
            className="rounded-2xl bg-white/92 backdrop-blur-2xl border border-black/[.04] overflow-hidden"
            style={{
              boxShadow:
                "0 8px 32px rgba(0,0,0,0.08), 0 2px 10px rgba(0,0,0,0.04)",
            }}
          >
            <div className="px-4 pt-3 pb-3">
              <div className="text-[11px] font-semibold text-muted tracking-tight mb-2.5">
                Data centers
              </div>
              <div className="flex flex-col gap-1.5">
                <LegendRow color="#0A84FF" label="Operational" />
                <LegendRow color="#FF9500" label="Under construction" />
                <LegendRow color="#5856D6" label="Proposed" hollow />
              </div>
              <div className="mt-3 pt-2.5 border-t border-black/[.05]">
                {/* Size-band key — dot size scales with cluster total MW,
                    mirroring the three buckets in DataCenterDots. Stacked
                    vertically so it reads alongside the status rows above. */}
                <div className="flex flex-col gap-1.5 mb-2.5">
                  <SizeBandSwatch r={4} label="< 100 MW" />
                  <SizeBandSwatch r={7} label="100–500 MW" />
                  <SizeBandSwatch r={11} label="500+ MW" />
                </div>
                <p className="text-[11px] text-muted tracking-tight leading-[1.45]">
                  A number inside a dot means several facilities sit
                  nearby.
                </p>
                <p className="mt-1.5 text-[11px] text-muted/70 tracking-tight">
                  Epoch AI (CC-BY) · research
                </p>
              </div>
              {region === "na" && naView === "counties" && selectedStateName && (
                <PowerPlantLegend stateName={selectedStateName} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating "Color map by" dimension selector — pinned to the
          right edge so it stays visible above the mobile detail sheet. */}
      <div
        className="hidden sm:block fixed top-28 right-4 z-20"
        style={{
          opacity: chromeOpacity,
          pointerEvents: chromeOpacity < 0.5 ? "none" : "auto",
        }}
      >
        <div
          className="rounded-2xl bg-white/92 backdrop-blur-2xl border border-black/[.04] px-3.5 pt-2.5 pb-3"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 2px 10px rgba(0,0,0,0.04)" }}
        >
          <div className="text-[10.5px] font-semibold text-muted tracking-tight mb-2">
            {locale === "zh" ? "地图着色依据" : "Color map by"}
          </div>
          <div className="flex flex-wrap gap-1.5 max-w-[14rem]">
            {(["overall", ...STABLECOIN_DIMENSIONS] as Dimension[]).map((d) => {
              const active = activeDimension === d;
              const bgColor = active ? (d === "overall" ? "#1D1D1F" : DIMENSION_COLOR[d]) : undefined;
              const textColor = active ? (d === "overall" ? "#FFFFFF" : DIMENSION_TEXT[d]) : undefined;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setActiveDimension(d);
                    setActiveLens("stablecoin");
                  }}
                  style={active ? { backgroundColor: bgColor, color: textColor } : undefined}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all duration-200 active:scale-[0.97] ${
                    active
                      ? "border-transparent"
                      : "border-black/[.08] text-muted hover:text-ink hover:bg-black/[.03]"
                  }`}
                >
                  {DIMENSION_LABEL_LOCALIZED[locale][d]}
                </button>
              );
            })}
          </div>
          {/* Overall stance color legend */}
          {activeDimension === "overall" && (
            <div className="mt-2.5 pt-2 border-t border-black/[.05] flex flex-col gap-1">
              {[
                "#7EBC8E",
                "#A8D4B2",
                "#D9C980",
                "#D9A766",
                "#D98080",
                "#C9CBD1",
              ].map((color, index) => (
                <span key={color} className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                  {OVERALL_LEGEND_LABEL[locale][index]}
                </span>
              ))}
            </div>
          )}
          {/* Issuance color legend */}
          {activeDimension === "sc-issuance" && (
            <div className="mt-2.5 pt-2 border-t border-black/[.05] flex flex-col gap-1">
              {["#34C759", "#FF9500", "#FF3B30", "#8E8E93"].map((color, index) => (
                <span key={color} className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                  {ISSUANCE_LEGEND_LABEL[locale][index]}
                </span>
              ))}
            </div>
          )}
          {/* Gradient legend for all other stablecoin dimensions */}
          {activeDimension !== "overall" && activeDimension !== "sc-issuance" && (() => {
            const grad = DIMENSION_GRADIENT[activeDimension as Exclude<Dimension, "overall">];
            if (!grad) return null;
            return (
              <div className="mt-2.5 pt-2 border-t border-black/[.05]">
                <div
                  className="h-2 rounded-full w-full mb-1.5"
                  style={{ background: `linear-gradient(to right, ${grad.from}, ${grad.to})` }}
                />
                <div className="flex justify-between text-[9.5px] text-muted">
                  <span>{locale === "zh" ? "活动较少" : "Less activity"}</span>
                  <span>{locale === "zh" ? "活动较多" : "More activity"}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Tooltip rendered OUTSIDE the slide rail so its position:fixed
          is relative to the viewport, not the transformed rail. */}
      {tooltip && !hoveredFacility && (() => {
        // ─── County hover (rich municipality card) ────────────────────
        // Rendered inside the same tooltip slot as the state/country
        // card so positioning and z-index stay aligned. Matches the
        // state card's visual language: small header row, muted context
        // blurb, compact status rows, a footer hint.
        if (tooltip.countyFips) {
          const muni = getMunicipalityByFips(tooltip.countyFips);
          if (muni) {
            const stance = countyStance(muni.actions);
            const stanceDot = STANCE_HEX[stance];
            const actionCount = muni.actions.length;
            const topActions = [...muni.actions]
              .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
              .slice(0, 3);
            const blurb = (muni.contextBlurb ?? "").trim();
            const firstSentence = blurb.match(/^[^.!?]+[.!?]/)?.[0] ?? blurb;
            const clipped =
              firstSentence.length > 140
                ? `${firstSentence.slice(0, 137).trimEnd()}…`
                : firstSentence;
            const concerns = muni.concerns ?? [];
            const visibleConcerns = concerns.slice(0, 4);
            const hiddenConcerns = concerns.length - visibleConcerns.length;

            return (
              <div
                className="fixed pointer-events-none z-50 w-[19rem]"
                style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
              >
                <div
                  className="rounded-xl bg-white/92 backdrop-blur-2xl border border-black/[.04] px-3.5 py-3"
                  style={{
                    boxShadow:
                      "0 6px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)",
                  }}
                >
                  {/* Header — name + stance label in muted color, same
                      shape as the state card's header. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold text-ink tracking-tight truncate">
                      {muni.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted tracking-tight whitespace-nowrap">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: stanceDot }}
                        aria-hidden
                      />
                      {STANCE_LABEL[stance]}
                    </span>
                  </div>

                  {clipped && (
                    <p className="mt-1.5 text-[12px] text-ink/70 tracking-tight leading-[1.45]">
                      {clipped}
                    </p>
                  )}

                  {/* Issues — small muted chips, the "why this matters"
                      signal. Capped at 4 with "+N more" overflow. */}
                  {visibleConcerns.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {visibleConcerns.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10.5px] text-muted bg-black/[.04] px-2 py-0.5 rounded-full tracking-tight"
                        >
                          {IMPACT_TAG_LABEL[tag]}
                        </span>
                      ))}
                      {hiddenConcerns > 0 && (
                        <span className="text-[10.5px] text-muted/70 px-1 py-0.5 tracking-tight">
                          +{hiddenConcerns}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions — top 3 most recent, each with stance dot,
                      title (2-line clamp), and a muted date tag. */}
                  {topActions.length > 0 && (
                    <div className="mt-2.5 pt-2.5 border-t border-black/[.05] flex flex-col gap-1.5">
                      {topActions.map((a, i) => {
                        const color = STANCE_HEX[actionStance(a.status)];
                        return (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-[12px] tracking-tight leading-snug"
                          >
                            <span
                              className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                              aria-hidden
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-ink/85 line-clamp-2">
                                {a.title}
                              </div>
                              {a.date && (
                                <div className="text-[10.5px] text-muted/80 mt-0.5 tracking-tight">
                                  {a.date}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer — total action count, replaces the old
                      "Click to open" hint. */}
                  <div className="mt-2.5 text-[11px] text-muted tracking-tight">
                    {actionCount} total {actionCount === 1 ? "action" : "actions"}
                    {actionCount > topActions.length && (
                      <span className="text-muted/70">
                        {" "}
                        · {actionCount - topActions.length} more on open
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          }
        }

        const ent = tooltip.geoId && tooltip.region
          ? getEntity(tooltip.geoId, tooltip.region)
          : null;
        const lensEntStance: StanceType = ent
          ? lens === "ai"
            ? (ent.stanceAI ?? ent.stance ?? "none")
            : lens === "stablecoin"
              ? (ent.stance ?? ent.stanceDatacenter ?? "none")
              : (ent.stanceDatacenter ?? ent.stance ?? "none")
          : "none";
        const dcCount = DC_COUNT_BY_NAME[tooltip.label] ?? 0;
        const bills = ent?.legislation ?? [];
        const billCount = bills.length;
        const activeCount = bills.filter(
          (b) => b.stage !== "Dead" && b.stage !== "Enacted",
        ).length;
        const enactedCount = bills.filter((b) => b.stage === "Enacted").length;
        // Per-dimension aggregation — a bill counts toward a dimension
        // if EITHER its `impactTags` overlap the dimension's tag set OR
        // it carries an explicit `dimensionStances[dim]` override. The
        // stance we show per row is the majority of per-dimension
        // overrides first, falling back to each bill's own `stance`
        // (NOT the entity-level stance, which would smear a single
        // overall color across every row).
        //
        // Lens preference: we compute rows for the ACTIVE lens first so
        // the tooltip mirrors what the map is showing. If the entity has
        // no coverage in that lens (e.g. Texas — all AI bills, no DC
        // tags — hovered while on the DC lens), we fall back to the
        // other lens's dimensions so the user still sees something
        // actionable instead of an empty card.
        const computeDimRows = (
          dims: Exclude<Dimension, "overall">[],
        ): { dim: Exclude<Dimension, "overall">; count: number; stance: StanceType }[] => {
          if (!ent) return [];
          const rows: { dim: Exclude<Dimension, "overall">; count: number; stance: StanceType }[] = [];
          for (const dim of dims) {
            // sc-* dimensions use stablecoin tags — skip DC/AI table scoring
            if (dim.startsWith("sc-")) continue;
            const tags = DIMENSION_TAGS[dim as Exclude<Dimension, "overall" | `sc-${string}`>];
            const perBillStances: (StanceType | undefined)[] = [];
            let count = 0;
            for (const b of bills) {
              const tagMatch = (b.impactTags ?? []).some((t) =>
                tags.includes(t),
              );
              const override = b.dimensionStances?.[dim];
              if (!tagMatch && !override) continue;
              count += 1;
              perBillStances.push(override ?? b.stance);
            }
            if (count === 0) continue;
            rows.push({
              dim,
              count,
              stance: aggregateStance(perBillStances, lensEntStance),
            });
          }
          return rows.sort((a, b) => b.count - a.count);
        };
        const activeLensDims = (
          lens === "ai" ? AI_DIMENSIONS : lens === "stablecoin" ? STABLECOIN_DIMENSIONS : DATACENTER_DIMENSIONS
        ) as Exclude<Dimension, "overall">[];
        const fallbackLensDims = (
          lens === "ai" ? DATACENTER_DIMENSIONS : lens === "stablecoin" ? [] : AI_DIMENSIONS
        ) as Exclude<Dimension, "overall">[];
        let dimRows = computeDimRows(activeLensDims);
        if (dimRows.length === 0 && fallbackLensDims.length > 0) dimRows = computeDimRows(fallbackLensDims);
        const visibleRows = dimRows.slice(0, 3);
        const hiddenRows = dimRows.length - visibleRows.length;
        const isRich = ent || dcCount > 0;

        if (!isRich) {
          return (
            <div
              className="fixed bg-white/90 text-ink text-[11px] font-medium px-2.5 py-1 rounded-md pointer-events-none z-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-black/[.04] tracking-tight"
              style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
            >
              {tooltip.label}
            </div>
          );
        }

        return (
          <div
            className="fixed pointer-events-none z-50 w-[18rem]"
            style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
          >
            <div
              className="rounded-xl bg-white/92 backdrop-blur-2xl border border-black/[.04] px-4 py-3"
              style={{
                boxShadow: "0 6px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              {/* Type scale (shared with DataCenterCard):
                    13/600 ink     — title (entity name)
                    12/400 ink     — body (blurb, dim labels)
                    11/400 muted   — caption (stance, footer, +N more)
                    11/500 ink     — emphasis inline (counts)
                  Tracking-tight on everything for Inter; spacing — not
                  rules — carries section separation. */}
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold text-ink tracking-tight truncate">
                  {tooltip.label}
                </span>
                {ent && (
                  <span className="text-[11px] text-muted tracking-tight whitespace-nowrap">
                    {STANCE_LABEL[lensEntStance]}
                  </span>
                )}
              </div>

              {(() => {
                const raw = lens === "stablecoin"
                  ? (ent?.stablecoinMeta?.summaryEn ?? ent?.contextBlurb ?? "")
                  : (ent?.contextBlurb ?? "");
                if (!raw) return null;
                const b = raw.trim();
                const firstSentence = b.match(/^[^.!?]+[.!?]/);
                let clip = (firstSentence?.[0] ?? b).trim();
                if (clip.length > 120) {
                  clip = `${clip.slice(0, 117).trimEnd()}…`;
                }
                return (
                  <p className="mt-1.5 text-[12px] text-ink/70 tracking-tight leading-[1.45]">
                    {clip}
                  </p>
                );
              })()}

              {visibleRows.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {visibleRows.map((row) => (
                    <div
                      key={row.dim}
                      className="flex items-center justify-between gap-3 text-[12px] tracking-tight"
                    >
                      <span className="text-ink truncate">
                        {SHORT_DIMENSION_LABEL[row.dim]}
                      </span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: STANCE_HEX[row.stance] }}
                        />
                        <span className="text-[11px] text-muted">
                          {STANCE_READOUT[row.stance]}
                        </span>
                      </span>
                    </div>
                  ))}
                  {hiddenRows > 0 && (
                    <div className="text-[11px] text-muted tracking-tight mt-0.5">
                      +{hiddenRows} more
                    </div>
                  )}
                </div>
              )}

              {(billCount > 0 || dcCount > 0) && (
                <div className="mt-2.5 text-[11px] text-muted tracking-tight flex items-center gap-1.5 flex-wrap">
                  {billCount > 0 && (
                    <span>
                      <span className="font-medium text-ink">{billCount}</span>{" "}
                      {billCount === 1 ? "bill" : "bills"}
                      {activeCount > 0 && (
                        <span>, {activeCount} active</span>
                      )}
                      {enactedCount > 0 && (
                        <span>, {enactedCount} enacted</span>
                      )}
                    </span>
                  )}
                  {billCount > 0 && dcCount > 0 && (
                    <span aria-hidden>·</span>
                  )}
                  {dcCount > 0 && (
                    <span>
                      <span className="font-medium text-ink">{dcCount}</span>{" "}
                      {dcCount === 1 ? "facility" : "facilities"}
                    </span>
                  )}
                </div>
              )}

              {tooltip.drillable && (
                <div className="mt-2 text-[11px] text-ink/60 tracking-tight">
                  Double-click to see counties →
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Rich facility detail card — overrides the plain tooltip when
          a data center dot is being hovered. Suppressed only when hovering
          the exact facility that's already pinned (its info is in the
          panel). Hovering OTHER facilities still shows the card so users
          can browse without first closing the pinned one. */}
    </div>
  );
}

/**
 * One band in the data-center size key — a dot at the map's actual
 * pixel radius paired with the MW bucket label. The three bands mirror
 * `SIZE_BANDS` in DataCenterDots so the map key and the visual dots on
 * the map stay in lock-step.
 */
function SizeBandSwatch({ r, label }: { r: number; label: string }) {
  const d = r * 2;
  // Fixed-width dot column = the largest dot's diameter, so the three
  // labels line up on the same x regardless of circle size.
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 22 }}
      >
        <span
          className="inline-block rounded-full bg-muted/30"
          style={{ width: d, height: d }}
        />
      </span>
      <span className="text-[11px] text-muted tracking-tight whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

function PowerPlantLegend({ stateName }: { stateName: string }) {
  const plants = plantsInState(stateName);
  if (plants.length === 0) return null;
  const present = new Set<FuelType>(plants.map((p) => collapseFuel(p.fuelType)));
  const ORDER: FuelType[] = [
    "natural-gas",
    "nuclear",
    "coal",
    "hydro",
    "solar",
    "wind",
    "biomass",
    "geothermal",
    "battery",
    "other",
  ];
  const fuels = ORDER.filter((f) => present.has(f));
  return (
    <div className="mt-3 pt-2.5 border-t border-black/[.05]">
      <div className="text-[11px] font-semibold text-muted tracking-tight mb-2">
        Power plants
      </div>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-1">
        {fuels.map((f) => (
          <div key={f} className="flex items-center gap-1.5 min-w-0">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: FUEL_COLOR[f], opacity: 0.7 }}
            />
            <span className="text-[11px] text-muted tracking-tight truncate">
              {FUEL_LABEL[f]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  hollow = false,
}: {
  color: string;
  label: string;
  hollow?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex items-center justify-center flex-shrink-0 w-3.5 h-3.5">
        <span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color, opacity: 0.18 }}
        />
        <span
          className="relative w-2 h-2 rounded-full"
          style={{
            backgroundColor: hollow ? "#FFFFFF" : color,
            border: hollow ? `1.25px solid ${color}` : "none",
          }}
        />
      </span>
      <span className="text-[12px] text-ink font-medium tracking-tight">
        {label}
      </span>
    </div>
  );
}
