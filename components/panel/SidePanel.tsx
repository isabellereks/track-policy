"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { Entity, GovLevel } from "@/types";
import StanceBadge from "@/components/ui/StanceBadge";
import Breadcrumb, { type BreadcrumbItem } from "@/components/ui/Breadcrumb";
import ContextBlurb from "./ContextBlurb";
import LegislationList from "./LegislationList";
import KeyFigures from "./KeyFigures";
import NewsSection from "./NewsSection";

interface SidePanelProps {
  entity: Entity | null;
  breadcrumbItems: BreadcrumbItem[];
  showViewStatesButton?: boolean;
  onViewStates?: () => void;
  onClose?: () => void;
  visibility?: number;
  size: "min" | "md";
  onSizeChange: (s: "min" | "md") => void;
  isMobileViewport: boolean;
}

const LEVEL_LABEL: Record<GovLevel, string | null> = {
  federal: "Federal Government",
  state: "State Government",
  bloc: null,
};

type Layer = "legislation" | "figures" | "news";
type Position = "left" | "right" | "bottom";
type Size = "min" | "md";

const LEGISLATION_PREVIEW = 5;
const FIGURES_PREVIEW = 3;
const NEWS_PREVIEW = 3;

// Bouncy spring — more pronounced overshoot for the rubber-band feel.
const SPRING = "cubic-bezier(0.5, 1.55, 0.4, 1)";
const DUR = "650ms";
const TRANSITION = `transform ${DUR} ${SPRING}, width ${DUR} ${SPRING}, min-height ${DUR} ${SPRING}, max-height ${DUR} ${SPRING}, opacity 250ms ease`;

function ShowAllLink({
  total,
  shown,
  label,
  href,
}: {
  total: number;
  shown: number;
  label: string;
  href?: string;
}) {
  if (total <= shown) return null;
  const className =
    "inline-block text-xs text-muted hover:text-ink transition-colors mt-3";
  const content = `Show all ${total} ${label} →`;
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <a href="#" className={className}>
      {content}
    </a>
  );
}

function ToolbarButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-6 h-6 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-black/[.04] transition-colors flex-shrink-0"
    >
      {children}
    </button>
  );
}

export default function SidePanel({
  entity,
  breadcrumbItems,
  showViewStatesButton = false,
  onViewStates,
  onClose,
  visibility = 1,
  size,
  onSizeChange,
  isMobileViewport,
}: SidePanelProps) {
  // Mobile defaults to the bottom-anchored card; desktop to top-left.
  // Derived state (not initial useState) so it actually tracks the
  // useSyncExternalStore matchMedia subscription on the client. Once the
  // user makes an explicit pick it sticks.
  const [explicitPosition, setExplicitPosition] = useState<Position | null>(
    null,
  );
  const position: Position =
    explicitPosition ?? (isMobileViewport ? "bottom" : "left");
  const setPosition = (p: Position) => setExplicitPosition(p);
  const [preferredLayer, setPreferredLayer] = useState<Layer>("legislation");
  const setSize = onSizeChange;
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const hasLegislation = !!entity && entity.legislation.length > 0;
  const hasFigures = !!entity && entity.keyFigures.length > 0;
  const hasNews = !!entity && entity.news.length > 0;
  const availableLayers: Layer[] = [];
  if (hasLegislation) availableLayers.push("legislation");
  if (hasFigures) availableLayers.push("figures");
  if (hasNews) availableLayers.push("news");
  const activeLayer: Layer =
    availableLayers.length > 0 && !availableLayers.includes(preferredLayer)
      ? availableLayers[0]
      : preferredLayer;

  const isDragging = dragOffset !== null;

  // Position the panel via direct top/right/bottom/left (not via calc-with-%
  // in a transform — that doesn't resolve reliably in all browsers).
  // Min mode is always top-centered. md mode honors the position pick.
  const positionStyle: CSSProperties = (() => {
    if (size === "min") {
      return {
        top: "1.5rem",
        left: "50%",
        right: "auto",
        bottom: "auto",
      };
    }
    if (position === "left") {
      return {
        top: "5rem",
        left: "1.5rem",
        right: "auto",
        bottom: "auto",
      };
    }
    if (position === "right") {
      return {
        top: "5rem",
        right: "1.5rem",
        left: "auto",
        bottom: "auto",
      };
    }
    return {
      bottom: "8rem",
      left: "50%",
      right: "auto",
      top: "auto",
    };
  })();

  // Transform: handle horizontal centering (-50%) for centered anchors,
  // plus the drag offset.
  const horizCentered = size === "min" || position === "bottom";
  const dx = dragOffset?.x ?? 0;
  const dy = dragOffset?.y ?? 0;
  const transformValue = horizCentered
    ? `translate(calc(-50% + ${dx}px), ${dy}px)`
    : `translate(${dx}px, ${dy}px)`;

  // Two discrete sizes:
  //   min — Dynamic Island-style horizontal pill (~13rem × 2.5rem), top-centered
  //   md  — full panel (24/28rem wide, content-driven height), positioned by `position`
  const sizeStyle: CSSProperties = (() => {
    if (size === "min") {
      return {
        width: "fit-content",
        minWidth: "7rem",
        maxWidth: "min(15rem, calc(100vw - 2rem))",
        minHeight: "2.5rem",
        maxHeight: "2.5rem",
      };
    }
    if (position === "bottom") {
      // Compact square-ish card on bottom-anchor positions, including
      // mobile. Sized so the map has plenty of room above it.
      return {
        width: "min(20rem, calc(100vw - 2rem))",
        minHeight: "0px",
        maxHeight: "min(22rem, 45vh)",
      };
    }
    return {
      width: "min(22rem, calc(100vw - 2rem))",
      minHeight: "0px",
      maxHeight: "calc(100vh - 9rem)",
    };
  })();

  const onDragPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragOffset({ x: 0, y: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragPointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    setDragOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const onDragPointerUp = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const totalDx = e.clientX - dragStartRef.current.x;
    const totalDy = e.clientY - dragStartRef.current.y;
    const totalDist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
    setDragOffset(null);
    dragStartRef.current = null;

    // Tap (no significant movement) — toggle minimized → expanded.
    // 12px threshold is forgiving enough for touch micro-movement.
    if (totalDist < 12) {
      if (size === "min") setSize("md");
      return;
    }

    // Mobile: a clear downward drag collapses the panel to the Dynamic Island.
    if (isMobileViewport && totalDy > 60 && totalDy > Math.abs(totalDx)) {
      setSize("min");
      return;
    }

    // Otherwise it's a drag — snap to the nearest anchor.
    const x = e.clientX;
    const y = e.clientY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let next: Position;
    if (y > vh * 0.65) {
      next = "bottom";
    } else if (x < vw * 0.5) {
      next = "left";
    } else {
      next = "right";
    }
    setPosition(next);
  };

  // ─── Render branches by size ───────────────────────────────────────────

  const renderMin = () => (
    <div
      onPointerDown={onDragPointerDown}
      onPointerMove={onDragPointerMove}
      onPointerUp={onDragPointerUp}
      onPointerCancel={onDragPointerUp}
      className={`block w-full h-full px-6 text-center text-[14px] font-semibold text-ink tracking-tight whitespace-nowrap truncate select-none touch-none leading-[2.5rem] ${
        isDragging ? "cursor-grabbing" : "cursor-pointer"
      }`}
    >
      {entity?.name ?? "Select a region"}
    </div>
  );

  const renderMd = () => (
    <>
      <div
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
        className={`flex items-center px-3 pt-2 pb-1 flex-shrink-0 select-none touch-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* Left spacer — same width as right cluster so the handle stays centered */}
        <div className="w-14 flex-shrink-0" />
        <div className="flex-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-black/15" />
        </div>
        {/* Desktop-only minimize / close cluster. Mobile uses drag-down. */}
        <div className="w-14 flex items-center justify-end gap-0.5 flex-shrink-0">
          <div className="hidden lg:flex items-center gap-0.5">
            <ToolbarButton
              onClick={() => setSize("min")}
              ariaLabel="Minimize panel"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 6h6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </ToolbarButton>
            {onClose && (
              <ToolbarButton onClick={onClose} ariaLabel="Close panel">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 3l6 6M9 3l-6 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </ToolbarButton>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pt-1 pb-3 flex-shrink-0">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      {!entity ? (
        <div className="flex-1 flex items-center justify-center px-8 py-12 min-h-[160px]">
          <p className="text-xs text-muted text-center">
            Select a country or region to explore legislation
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-1 pb-5 border-b border-black/[.06]">
            <h2 className="text-2xl font-semibold text-ink tracking-tight">
              {entity.name}
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <StanceBadge stance={entity.stance} size="md" />
              {LEVEL_LABEL[entity.level] && (
                <span className="text-xs text-muted">
                  {LEVEL_LABEL[entity.level]}
                </span>
              )}
            </div>
          </div>

          <div className="p-6 flex flex-col gap-6">
            <ContextBlurb text={entity.contextBlurb} />

            {showViewStatesButton && onViewStates && (
              <button
                type="button"
                onClick={onViewStates}
                className="self-start rounded-full bg-ink text-white text-xs font-medium px-4 py-2 hover:bg-ink/90 transition-colors"
              >
                View State Legislation →
              </button>
            )}

            {availableLayers.length > 0 && (
              <>
                <div className="inline-flex items-center gap-1 p-1 rounded-full bg-black/[.04] self-start">
                  {availableLayers.map((layer) => {
                    const active = layer === activeLayer;
                    const label =
                      layer === "legislation"
                        ? "Legislation"
                        : layer === "figures"
                          ? "Key Figures"
                          : "News";
                    return (
                      <button
                        key={layer}
                        type="button"
                        onClick={() => setPreferredLayer(layer)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                          active
                            ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                            : "text-muted hover:text-ink"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {activeLayer === "legislation" && hasLegislation && (
                  <section>
                    <LegislationList
                      legislation={entity.legislation.slice(
                        0,
                        LEGISLATION_PREVIEW,
                      )}
                    />
                    <ShowAllLink
                      total={entity.legislation.length}
                      shown={LEGISLATION_PREVIEW}
                      label="bills"
                      href={`/legislation/${encodeURIComponent(entity.id)}`}
                    />
                  </section>
                )}

                {activeLayer === "figures" && hasFigures && (
                  <section>
                    <KeyFigures
                      figures={entity.keyFigures.slice(0, FIGURES_PREVIEW)}
                    />
                    <ShowAllLink
                      total={entity.keyFigures.length}
                      shown={FIGURES_PREVIEW}
                      label="figures"
                    />
                  </section>
                )}

                {activeLayer === "news" && hasNews && (
                  <section>
                    <NewsSection news={entity.news.slice(0, NEWS_PREVIEW)} />
                    <ShowAllLink
                      total={entity.news.length}
                      shown={NEWS_PREVIEW}
                      label="articles"
                    />
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  const isMin = size === "min";

  return (
    <aside
      style={{
        ...positionStyle,
        ...sizeStyle,
        transform: transformValue,
        opacity: visibility,
        pointerEvents: visibility < 0.5 ? "none" : "auto",
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        borderColor: "rgba(0, 0, 0, 0.04)",
        borderRadius: isMin ? "9999px" : "1.5rem",
        transition: isDragging
          ? "none"
          : `${TRANSITION}, background-color 350ms ease, border-color 350ms ease, border-radius 350ms ease`,
        willChange: "transform",
      }}
      className="fixed z-30 backdrop-blur-2xl border shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] flex flex-col overflow-hidden"
    >
      {isMin ? renderMin() : renderMd()}
    </aside>
  );
}
