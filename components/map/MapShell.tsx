"use client";

import {
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
  type Region,
  type ViewTarget,
} from "@/types";
import { getEntity, getOverviewEntity } from "@/lib/placeholder-data";
import type { TooltipState } from "@/lib/map-utils";
import SidePanel from "@/components/panel/SidePanel";
import RegionSlider from "@/components/ui/RegionSlider";
import HistoryNav from "@/components/ui/HistoryNav";
import SearchPill from "@/components/ui/SearchPill";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import NorthAmericaMap from "./NorthAmericaMap";
import USStatesMap from "./USStatesMap";
import EuropeMap from "./EuropeMap";
import AsiaMap from "./AsiaMap";

type ViewState = ViewTarget;

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
  navigateRef?: MutableRefObject<((target: ViewTarget) => void) | null>;
}

export default function MapShell({
  revealProgress = 1,
  dimension = "overall",
  navigateRef,
}: MapShellProps) {
  const [history, setHistory] = useState<ViewState[]>([INITIAL_VIEW]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const current = history[historyIdx];
  const { region, naView, selectedGeoId } = current;

  const overviewEntity = useMemo(() => getOverviewEntity(region), [region]);

  const selectedEntity = useMemo(() => {
    if (!selectedGeoId) return overviewEntity;
    const found = getEntity(selectedGeoId, region);
    return found ?? overviewEntity;
  }, [selectedGeoId, region, overviewEntity]);

  const navigateTo = (next: ViewState) => {
    if (viewsEqual(current, next)) return;
    const newHistory = [...history.slice(0, historyIdx + 1), next];
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
  };

  // Expose navigateTo to the parent (page.tsx) so the legislation table
  // can drive map navigation when the user clicks a row.
  if (navigateRef) navigateRef.current = navigateTo;

  const handleSelectEntity = (geoId: string) => {
    navigateTo({ ...current, selectedGeoId: geoId });
    // Clicking a country while the panel is collapsed to the Dynamic Island
    // expands it back to the full square so the user can read the details.
    if (panelSize === "min") {
      setExplicitPanelSize("md");
    }
  };

  const handleRegionChange = (next: Region) =>
    navigateTo({ region: next, naView: "countries", selectedGeoId: null });

  const handleResetRegion = () =>
    navigateTo({ region, naView: "countries", selectedGeoId: null });

  const handleResetStates = () =>
    navigateTo({ ...current, selectedGeoId: null });

  const handleViewStates = () =>
    navigateTo({ region: "na", naView: "states", selectedGeoId: null });

  const handleDoubleClickEntity = (geoId: string) => {
    if (geoId === "840") handleViewStates();
  };

  const handleSearchNavigate = (target: ViewTarget) => navigateTo(target);

  const canBack = historyIdx > 0;
  const canForward = historyIdx < history.length - 1;
  const goBack = () => canBack && setHistoryIdx(historyIdx - 1);
  const goForward = () => canForward && setHistoryIdx(historyIdx + 1);

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

    if (region === "na" && naView === "states") {
      items.push({
        label: "United States",
        onClick: selectedGeoId ? handleResetStates : undefined,
      });
      if (selectedGeoId && selectedEntity && !selectedEntity.isOverview) {
        items.push({ label: selectedEntity.name });
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
  }, [region, naView, selectedGeoId, selectedEntity, history, historyIdx]);

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

  // When the panel is collapsed to the Dynamic Island, the map gets a little
  // extra zoom so it fills the freed-up space. Expanding the panel returns
  // the map to its baseline scale.
  const panelExtraZoom = panelSize === "min" ? 1.55 : 1.0;

  // Touch swipe between regions (mobile only)
  const swipeRef = useRef<{
    x: number;
    y: number;
    time: number;
    swiped: boolean;
  } | null>(null);

  const onMapPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    swipeRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      swiped: false,
    };
  };

  const onMapPointerUp = (e: React.PointerEvent) => {
    const start = swipeRef.current;
    if (!start || e.pointerType !== "touch") return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = Date.now() - start.time;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && dt < 600) {
      const currentIdx = REGION_ORDER.indexOf(region);
      const nextIdx =
        dx < 0
          ? Math.min(REGION_ORDER.length - 1, currentIdx + 1)
          : Math.max(0, currentIdx - 1);
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

  return (
    <div className="fixed inset-0 bg-white overflow-hidden z-0">
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
            {r === "na" && naView === "countries" && (
              <NorthAmericaMap
                onSelectEntity={handleSelectEntity}
                onDoubleClickEntity={handleDoubleClickEntity}
                selectedGeoId={selectedGeoId}
                setTooltip={setTooltip}
                dimension={dimension}
              />
            )}
            {r === "na" && naView === "states" && (
              <USStatesMap
                onSelectEntity={handleSelectEntity}
                selectedGeoId={selectedGeoId}
                setTooltip={setTooltip}
                dimension={dimension}
              />
            )}
            {r === "eu" && (
              <EuropeMap
                onSelectEntity={handleSelectEntity}
                selectedGeoId={r === region ? selectedGeoId : null}
                setTooltip={setTooltip}
                dimension={dimension}
              />
            )}
            {r === "asia" && (
              <AsiaMap
                onSelectEntity={handleSelectEntity}
                selectedGeoId={r === region ? selectedGeoId : null}
                setTooltip={setTooltip}
                dimension={dimension}
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
        breadcrumbItems={breadcrumbItems}
        showViewStatesButton={showViewStatesButton}
        onViewStates={handleViewStates}
        onClose={() =>
          navigateTo({ ...current, selectedGeoId: null })
        }
        visibility={chromeOpacity}
        size={panelSize}
        onSizeChange={setExplicitPanelSize}
        isMobileViewport={isMobileViewport}
      />

      {/* Top-right history nav (back / forward) */}
      <div
        style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity < 0.5 ? "none" : "auto" }}
      >
        <HistoryNav
          canBack={canBack}
          canForward={canForward}
          onBack={goBack}
          onForward={goForward}
        />
      </div>

      {/* Bottom-center region slider — hidden in the US states drill-down */}
      {!(region === "na" && naView === "states") && (
        <div
          style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity < 0.5 ? "none" : "auto" }}
        >
          <RegionSlider region={region} onChange={handleRegionChange} />
        </div>
      )}

      {/* Bottom-right search pill */}
      <div
        style={{ opacity: chromeOpacity, pointerEvents: chromeOpacity < 0.5 ? "none" : "auto" }}
      >
        <SearchPill onNavigate={handleSearchNavigate} />
      </div>

      {/* Tooltip rendered OUTSIDE the slide rail so its position:fixed
          is relative to the viewport, not the transformed rail. */}
      {tooltip && (
        <div
          className="fixed bg-white/85 backdrop-blur-md text-ink text-xs px-3 py-1.5 rounded-full pointer-events-none z-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] tracking-tight"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
