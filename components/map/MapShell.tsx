"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from "react";
import {
  REGION_LABEL,
  REGION_ORDER,
  type Dimension,
  type DimensionLens,
  type NaView,
  type Region,
  type ViewTarget,
} from "@/types";
import { getEntity, getOverviewEntity } from "@/lib/placeholder-data";
import type { TooltipState } from "@/lib/map-utils";
import SidePanel from "@/components/panel/SidePanel";
import DepthStepper from "@/components/ui/DepthStepper";
import RegionNav from "@/components/ui/RegionNav";
import SearchPill from "@/components/ui/SearchPill";
import MobileLegend from "@/components/map/MobileLegend";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import NorthAmericaMap from "./NorthAmericaMap";
import USStatesMap from "./USStatesMap";
import CountyMap from "./CountyMap";
import EuropeMap from "./EuropeMap";
import AsiaMap from "./AsiaMap";
import DataCenterCard from "./DataCenterCard";
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

function actionToLegislation(a: MunicipalAction, idx: number): Legislation {
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
  };
}

function municipalityToEntity(m: MunicipalEntity): Entity {
  return {
    id: `muni-${m.id}`,
    geoId: m.fips,
    name: `${m.name}, ${m.stateCode}`,
    region: "na",
    level: "state",
    stance: countyStance(m.actions),
    contextBlurb: m.contextBlurb,
    legislation: m.actions.map(actionToLegislation),
    keyFigures: [],
    news: [],
  };
}

const INITIAL_VIEW: ViewState = {
  region: "na",
  naView: "countries",
  selectedGeoId: null,
};

function viewsEqual(a: ViewState, b: ViewState): boolean {
  return (
    a.region === b.region &&
    a.naView === b.naView &&
    a.selectedGeoId === b.selectedGeoId
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
  dimension = "overall",
  lens = "datacenter",
  navigateRef,
}: MapShellProps) {
  const [history, setHistory] = useState<ViewState[]>([INITIAL_VIEW]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredFacility, setHoveredFacility] = useState<{
    dc: DataCenter;
    x: number;
    y: number;
    clusterSize: number;
  } | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<DataCenter | null>(
    null,
  );
  // Data center dot visibility is driven by the lens: when the user is
  // looking at the "Data Centers" lens, show the dots; otherwise hide them.
  const showDataCenters = lens === "datacenter";
  const handleHoverFacility = (
    dc: DataCenter,
    x: number,
    y: number,
    clusterSize: number,
  ) => setHoveredFacility({ dc, x, y, clusterSize });
  const handleLeaveFacility = () => setHoveredFacility(null);
  const handleSelectFacility = (dc: DataCenter) => {
    setSelectedFacility(dc);
    setHoveredFacility(null);
    if (panelSize === "min") setExplicitPanelSize("md");
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
    return found ?? overviewEntity;
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
    if (viewsEqual(current, next)) return;
    const newHistory = [...history.slice(0, historyIdx + 1), next];
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
    navigateTo({ ...current, selectedGeoId: geoId });
    // Clicking a country while the panel is collapsed to the Dynamic Island
    // expands it back to the full square so the user can read the details.
    if (panelSize === "min") {
      setExplicitPanelSize("md");
    }
  };

  // Region pans are AMBIENT — they replace the current entry in place
  // instead of pushing a new one. Otherwise every swipe between NA/EU/
  // Asia would land in the browser back stack, and swipe-back would
  // walk through every region the user glanced at before popping a
  // real drill level. Drill navigation (selecting countries, drilling
  // into states/counties) still goes through navigateTo → pushState.
  const handleRegionChange = (next: Region) => {
    const updated: ViewState = {
      region: next,
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

  const handleViewStates = () =>
    navigateTo({ region: "na", naView: "states", selectedGeoId: null });

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
      handleViewCounties(stateName);
    } else {
      handleSelectUsState(stateName);
    }
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

  const handleDoubleClickEntity = (geoId: string) => {
    if (geoId === "840") handleViewStates();
    // Double-clicking a US state drills into counties (for states with data)
    if (
      region === "na" &&
      naView === "states" &&
      getMunicipalitiesByState(geoId).length > 0
    ) {
      handleViewCounties(geoId);
    }
  };

  const handleSearchNavigate = (target: ViewTarget) => navigateTo(target);

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

  const showViewStatesButton =
    region === "na" &&
    naView === "countries" &&
    selectedEntity?.canDrillDown === true;

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
  const panelSize: "min" | "md" = explicitPanelSize ?? "md";

  // When the panel is collapsed to the Dynamic Island, the map gets a
  // little extra zoom so it fills the freed-up space. On desktop (where
  // the panel sits to the side) the bump is larger; on mobile (where
  // the panel was at the bottom) a gentle bump is enough — 1.55x pushes
  // the US off-screen on narrow viewports.
  const panelExtraZoom =
    panelSize === "min" ? (isMobileViewport ? 1.12 : 1.55) : 1.0;

  // Touch swipe between regions (mobile only)
  const swipeRef = useRef<{
    x: number;
    y: number;
    time: number;
    swiped: boolean;
  } | null>(null);

  // Pointer-based swipe between regions. Works for touch AND mouse on
  // desktop — a click-and-drag horizontally over the map is equivalent
  // to a touch swipe. Pen pointers are accepted too. We require the
  // gesture to start on the map background (not on chrome / interactive
  // elements) to avoid eating clicks.
  const onMapPointerDown = (e: React.PointerEvent) => {
    swipeRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      swiped: false,
    };
  };

  const onMapPointerUp = (e: React.PointerEvent) => {
    const start = swipeRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = Date.now() - start.time;
    const maxDt = e.pointerType === "touch" ? 600 : 800;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && dt < maxDt) {
      const len = REGION_ORDER.length;
      const currentIdx = REGION_ORDER.indexOf(region);
      const nextIdx = dx < 0
        ? (currentIdx + 1) % len
        : (currentIdx - 1 + len) % len;
      if (nextIdx !== currentIdx) {
        handleRegionChange(REGION_ORDER[nextIdx]);
        start.swiped = true;
      }
    }
  };

  const onMapClickCapture = (e: React.MouseEvent) => {
    if (swipeRef.current?.swiped) {
      e.stopPropagation();
      e.preventDefault();
      swipeRef.current = null;
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
  const mapRootRef = useRef<HTMLDivElement>(null);

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
      const len = REGION_ORDER.length;
      const idx = REGION_ORDER.indexOf(region);
      const next = (idx + dir + len) % len;
      if (next === idx) return false;
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
          willChange: "transform",
          touchAction: "pan-y",
          transition: "transform 500ms cubic-bezier(0.5, 1.55, 0.4, 1)",
        }}
        onPointerDown={onMapPointerDown}
        onPointerUp={onMapPointerUp}
        onPointerCancel={() => (swipeRef.current = null)}
        onClickCapture={onMapClickCapture}
      >
      <div
        className="absolute inset-0"
        style={{
          transform: `scale(${baseMapScale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        {/* Sliding region rail — all three regions rendered side-by-side. */}
        <div
          className="absolute inset-0 flex transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ transform: `translateX(-${regionIdx * 100}%)` }}
        >
          {REGION_ORDER.map((r) => (
          <div
            key={r}
            className="w-full h-full flex-shrink-0 flex items-center justify-center pb-[40vh] lg:pb-0"
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
                    onSelectUsState={handleSelectUsState}
                    onDoubleClickUsState={handleDoubleClickUsState}
                    selectedGeoId={selectedGeoId}
                    setTooltip={setTooltip}
                    dimension={dimension}
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
                    dimension={dimension}
                    showDataCenters={showDataCenters}
                    onHoverFacility={handleHoverFacility}
                    onLeaveFacility={handleLeaveFacility}
                    onSelectFacility={handleSelectFacility}
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
                dimension={dimension}
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
                dimension={dimension}
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

      {/* Floating side panel — self-positioned via its own state. */}
      <SidePanel
        entity={selectedEntity}
        showViewStatesButton={showViewStatesButton}
        onViewStates={handleViewStates}
        visibility={chromeOpacity}
        size={panelSize}
        onSizeChange={setExplicitPanelSize}
        isMobileViewport={isMobileViewport}
        facility={selectedFacility}
        onCloseFacility={handleCloseFacility}
      />

      {/* Top-right region nav — pan between NA / EU / Asia. Browser
          back / swipe-back covers drill history, so this slot is freed
          up for a more useful "move around" affordance. */}
      <div
        style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity < 0.5 ? "none" : "auto" }}
      >
        <RegionNav region={region} onChange={handleRegionChange} />
      </div>

      {/* Bottom-center depth stepper — region picker + drill breadcrumb.
          Visible in every drill state; grows with depth. */}
      <div
        style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity < 0.5 ? "none" : "auto" }}
      >
        <DepthStepper
          region={region}
          onRegionChange={handleRegionChange}
          segments={stepperBreadcrumb}
        />
      </div>

      {/* Bottom-right search pill */}
      <div
        style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity < 0.5 ? "none" : "auto" }}
      >
        <SearchPill onNavigate={handleSearchNavigate} />
      </div>

      {/* Comprehensive mobile legend — only shown when the side panel
          is collapsed to the Dynamic Island (so the bottom of the
          screen is free) AND we're on a mobile viewport. Bundles
          stance / dimension colors with the data-center key. */}
      {isMobileViewport && panelSize === "min" && (
        <MobileLegend
          dimension={dimension}
          showDataCenters={showDataCenters}
          visibility={chromeOpacity}
        />
      )}

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
            fontFamily:
              "-apple-system, 'SF Pro Text', system-ui, sans-serif",
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
              <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.07em] mb-2.5">
                Data centers
              </div>
              <div className="flex flex-col gap-2">
                <LegendRow
                  color="#0A84FF"
                  label="Operational"
                  sublabel="Running today"
                />
                <LegendRow
                  color="#FF9500"
                  label="Under construction"
                  sublabel="Breaking ground"
                />
                <LegendRow
                  color="#5856D6"
                  label="Proposed"
                  sublabel="Planned or announced"
                  hollow
                />
              </div>
              <div className="mt-3 pt-2.5 border-t border-black/[.05]">
                <p className="text-[10px] text-muted leading-[1.45]">
                  Dot size scales with power capacity. A number inside a dot
                  means several facilities sit nearby.
                </p>
                <p className="text-[9px] text-muted/70 tracking-tight mt-1.5">
                  Epoch AI (CC-BY) · research
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip rendered OUTSIDE the slide rail so its position:fixed
          is relative to the viewport, not the transformed rail. */}
      {tooltip && !hoveredFacility && (
        <div
          className="fixed bg-white/85 backdrop-blur-md text-ink text-xs px-3 py-1.5 rounded-full pointer-events-none z-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] tracking-tight"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          {tooltip.label}
        </div>
      )}

      {/* Rich facility detail card — overrides the plain tooltip when
          a data center dot is being hovered. Hidden while a facility is
          pinned so it doesn't float over the open panel. */}
      {hoveredFacility && !selectedFacility && (
        <DataCenterCard
          facility={hoveredFacility.dc}
          x={hoveredFacility.x}
          y={hoveredFacility.y}
          clusterSize={hoveredFacility.clusterSize}
        />
      )}
    </div>
  );
}

function LegendRow({
  color,
  label,
  sublabel,
  hollow = false,
}: {
  color: string;
  label: string;
  sublabel: string;
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
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] text-ink font-medium tracking-tight">
          {label}
        </span>
        <span className="text-[9.5px] text-muted">{sublabel}</span>
      </div>
    </div>
  );
}
