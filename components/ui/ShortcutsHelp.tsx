"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  StanceRow,
} from "@/components/map/MobileLegend";
import { useLocale } from "@/contexts/LocaleContext";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

interface Row {
  keys: string[];
  label: string;
}

// Grouped keyboard reference. Each row's `keys` get rendered as separate
// kbd-style chips so combinations read correctly. Pulled from the
// keydown handler in MapShell so this stays a single source of truth.
const KEYBOARD_GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Move between regions",
    rows: [
      { keys: ["A", "←"], label: "Previous region" },
      { keys: ["D", "→"], label: "Next region" },
      { keys: ["1"], label: "North America" },
      { keys: ["2"], label: "Europe" },
      { keys: ["3"], label: "Asia" },
      { keys: ["4"], label: "Africa" },
    ],
  },
  {
    title: "Drill in / out",
    rows: [
      { keys: ["S", "↓"], label: "Drill into selection" },
      { keys: ["W", "↑"], label: "Step back out" },
      { keys: ["Esc"], label: "Clear selection" },
    ],
  },
  {
    title: "Find & search",
    rows: [
      { keys: ["⌘", "K"], label: "Open search" },
      { keys: ["?"], label: "Show this help" },
    ],
  },
];

// Mobile gesture reference — the `?` button shows this instead of the
// keyboard list when there's no keyboard around.
const TOUCH_GROUPS: { title: string; rows: { label: string; hint: string }[] }[] = [
  {
    title: "Move between regions",
    rows: [
      { label: "Switch region", hint: "Tap a pill at the top (Americas / Europe / Asia / Africa)" },
      { label: "Pan the map", hint: "Two-finger drag" },
      { label: "Zoom the map", hint: "Pinch in or out" },
    ],
  },
  {
    title: "Explore a place",
    rows: [
      { label: "Select a country or state", hint: "Tap it" },
      { label: "See counties", hint: "Tap a highlighted state — it drills in" },
      { label: "Open a data center", hint: "Tap a circle on the map" },
    ],
  },
  {
    title: "Sidebar",
    rows: [
      { label: "Read details", hint: "Tap the pill at the top to expand" },
      { label: "Dismiss", hint: "Swipe the sidebar down from the handle" },
    ],
  },
];

function useIsMobile(): boolean {
  return useSyncExternalStore(
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
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.6rem] h-[1.6rem] px-1.5 rounded-md bg-bg/80 border border-black/[.06] text-[11px] font-medium text-ink tracking-tight font-sans">
      {children}
    </kbd>
  );
}

export default function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  const { locale } = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const keyboardGroups =
    locale === "zh"
      ? [
          {
            title: "切换区域",
            rows: [
              { keys: ["A", "←"], label: "上一个区域" },
              { keys: ["D", "→"], label: "下一个区域" },
              { keys: ["1"], label: "北美" },
              { keys: ["2"], label: "欧洲" },
              { keys: ["3"], label: "亚洲" },
              { keys: ["4"], label: "非洲" },
            ],
          },
          {
            title: "进入 / 返回",
            rows: [
              { keys: ["S", "↓"], label: "进入当前选择" },
              { keys: ["W", "↑"], label: "返回上一层" },
              { keys: ["Esc"], label: "清除选择" },
            ],
          },
          {
            title: "查找",
            rows: [
              { keys: ["⌘", "K"], label: "打开搜索" },
              { keys: ["?"], label: "显示帮助" },
            ],
          },
        ]
      : KEYBOARD_GROUPS;
  const touchGroups =
    locale === "zh"
      ? [
          {
            title: "切换区域",
            rows: [
              { label: "切换区域", hint: "点击顶部区域按钮（美洲 / 欧洲 / 亚洲 / 非洲）" },
              { label: "平移地图", hint: "双指拖动" },
              { label: "缩放地图", hint: "双指捏合" },
            ],
          },
          {
            title: "探索地点",
            rows: [
              { label: "选择国家或州", hint: "点击地图区域" },
              { label: "查看县级数据", hint: "点击高亮州进入下一层" },
              { label: "打开数据中心", hint: "点击地图圆点" },
            ],
          },
          {
            title: "侧边栏",
            rows: [
              { label: "查看详情", hint: "点击顶部小胶囊展开" },
              { label: "收起", hint: "从侧边栏把手向下滑动" },
            ],
          },
        ]
      : TOUCH_GROUPS;

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!cardRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isMobile ? (locale === "zh" ? "地图指南" : "Map guide") : (locale === "zh" ? "快捷键" : "Keyboard shortcuts")}
      className={`fixed inset-0 z-40 flex items-start justify-center pt-[14vh] px-4 bg-white/55 backdrop-blur-2xl transition-[opacity,backdrop-filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div
        ref={cardRef}
        className={`w-full max-w-[26rem] rounded-3xl bg-white/95 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.14),0_2px_10px_rgba(0,0,0,0.06)] border border-black/[.04] p-5 transition-[transform,opacity] duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform ${
          open
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 -translate-y-3"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink tracking-tight">
            {isMobile ? (locale === "zh" ? "地图指南" : "Map guide") : (locale === "zh" ? "快捷键" : "Keyboard shortcuts")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {isMobile ? (
          <div className="flex flex-col gap-5">
            {touchGroups.map((group) => (
              <div key={group.title}>
                <div className="text-[11px] font-medium text-muted tracking-tight mb-2">
                  {group.title}
                </div>
                <ul className="flex flex-col gap-2">
                  {group.rows.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-start justify-between gap-4 text-sm"
                    >
                      <span className="text-ink flex-shrink-0">{row.label}</span>
                      <span className="text-muted text-right leading-snug">
                        {row.hint}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Legend — merged in from the old bottom-floating mobile
                legend card. Keeping it inside the help sheet gives the
                map back the full viewport and keeps the reference one
                tap away. */}
            <div className="pt-1 flex flex-col gap-3 border-t border-black/[.06]">
              <div className="text-[11px] font-medium text-muted tracking-tight mt-1">
                {locale === "zh" ? "图例" : "Legend"}
              </div>
              <StanceRow />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {keyboardGroups.map((group) => (
              <div key={group.title}>
                <div className="text-[11px] font-medium text-muted tracking-tight mb-2">
                  {group.title}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {group.rows.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-center justify-between text-sm text-ink"
                    >
                      <span>{row.label}</span>
                      <span className="flex items-center gap-1">
                        {row.keys.map((k, i) => (
                          <span
                            key={k}
                            className="flex items-center gap-1 text-muted"
                          >
                            {i > 0 && <span className="text-[11px]">{locale === "zh" ? "或" : "or"}</span>}
                            <Kbd>{k}</Kbd>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
