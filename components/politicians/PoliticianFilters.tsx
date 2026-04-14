"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Legislator } from "@/types";

export type SortKey = "relevance" | "alignment" | "name" | "votes" | "capture";

export interface FilterState {
  country: "all" | "US" | "GB" | "EU";
  chamber: "all" | string;
  party: "all" | string;
  sort: SortKey;
  search: string;
}

interface Props {
  all: Legislator[];
  state: FilterState;
  onChange: (next: FilterState) => void;
}

const COUNTRY_OPTIONS: Array<{ key: FilterState["country"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "US", label: "United States" },
  { key: "GB", label: "United Kingdom" },
  { key: "EU", label: "European Parliament" },
];

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "relevance", label: "Relevance" },
  { key: "alignment", label: "Alignment" },
  { key: "votes", label: "Vote count" },
  { key: "capture", label: "Capture score" },
  { key: "name", label: "Name" },
];

export default function PoliticianFilters({ all, state, onChange }: Props) {
  const chambers = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) {
      if (state.country !== "all" && p.country !== state.country) continue;
      if (p.chamber) s.add(p.chamber);
    }
    return Array.from(s).sort();
  }, [all, state.country]);

  const parties = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) {
      if (state.country !== "all" && p.country !== state.country) continue;
      if (p.party) s.add(partyKey(p.party));
    }
    return Array.from(s).sort();
  }, [all, state.country]);

  return (
    <div className="flex flex-col gap-6">
      <Group label="Country">
        <PillRow
          options={COUNTRY_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
          active={state.country}
          onSelect={(k) =>
            onChange({ ...state, country: k as FilterState["country"], chamber: "all", party: "all" })
          }
        />
      </Group>

      {chambers.length > 1 && (
        <Group label="Chamber">
          <PillRow
            options={[{ key: "all", label: "All" }, ...chambers.map((c) => ({ key: c, label: labelChamber(c) }))]}
            active={state.chamber}
            onSelect={(k) => onChange({ ...state, chamber: k })}
          />
        </Group>
      )}

      {parties.length > 1 && (
        <Group label="Party">
          <PillRow
            options={[{ key: "all", label: "All" }, ...parties.map((p) => ({ key: p, label: p }))]}
            active={state.party}
            onSelect={(k) => onChange({ ...state, party: k })}
          />
        </Group>
      )}

      <Group label="Sort by">
        <PillRow
          options={SORT_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
          active={state.sort}
          onSelect={(k) => onChange({ ...state, sort: k as SortKey })}
        />
      </Group>

      <Group label="Search">
        <SearchPill
          value={state.search}
          onChange={(v) => onChange({ ...state, search: v })}
        />
      </Group>
    </div>
  );
}

function partyKey(party: string): string {
  // US-like "D-NY" → "D"; keep full label for UK/EU.
  const m = party.match(/^([DRI])-[A-Z]{2}$/);
  return m ? m[1] : party;
}

function labelChamber(c: string): string {
  if (c === "house") return "House";
  if (c === "senate") return "Senate";
  if (c === "commons") return "Commons";
  if (c === "lords") return "Lords";
  if (c === "ep") return "Parliament";
  if (c === "executive") return "Executive";
  return c[0].toUpperCase() + c.slice(1);
}

function SearchPill({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
  }, []);

  // ⌘K / Ctrl+K focuses the search input — matches the global pattern
  // bound by TopToolbar everywhere else on the site.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "k") {
        // Only intercept when not already typing in another field — lets
        // the global TopToolbar binding still take precedence elsewhere.
        if (inField) return;
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/95 backdrop-blur-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] border border-black/[.04]">
      <SearchIcon />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder="Search by name"
        className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none min-w-0"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="text-muted hover:text-ink flex-shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 3L9 9M9 3L3 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : (
        <kbd className="text-[10px] font-medium text-muted bg-black/[.04] px-1.5 py-0.5 rounded shrink-0 tracking-tight">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="text-muted flex-shrink-0"
      aria-hidden
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.5 9.5L12.5 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium text-muted tracking-tight">
        {label}
      </div>
      {children}
    </div>
  );
}

function PillRow<T extends string>({
  options,
  active,
  onSelect,
}: {
  options: Array<{ key: T; label: string }>;
  active: T;
  onSelect: (k: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const isActive = o.key === active;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o.key)}
            className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
              isActive
                ? "bg-ink text-white"
                : "bg-black/[.04] text-muted hover:bg-black/[.08] hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
