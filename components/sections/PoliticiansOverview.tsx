"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { ALL_POLITICIANS } from "@/lib/politicians-data";
import type { Legislator } from "@/types";

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] ?? "")
    .join("")
    .toUpperCase();
}

type Scope = "all" | "US" | "GB" | "EU";

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: "all", label: "All" },
  { key: "US", label: "United States" },
  { key: "GB", label: "United Kingdom" },
  { key: "EU", label: "European Parliament" },
];

const PREVIEW = 9;

/**
 * Hand-picked names that should always surface on the homepage preview
 * regardless of chamber or AI-research depth — the politicians anyone
 * casually browsing AI policy expects to see first.
 */
// Hand-picked 9 — exactly fills the 3×3 homepage grid. Order doesn't
// matter, the score sort handles ranking.
const FEATURED_PRIORITY = new Set(
  [
    "donald trump",
    "xi jinping",
    "mike johnson",
    "chuck schumer",
    "john thune",
    "bernie sanders",
    "alexandria ocasio-cortez",
    "josh hawley",
    "ted cruz",
  ].map((n) => n.toLowerCase()),
);

function featuredScore(p: Legislator): number {
  let s = 0;

  // Hand-picked priority — always pin these names to the top.
  if (FEATURED_PRIORITY.has(p.name.toLowerCase())) s += 100;

  if (p.summary && p.summary.length > 80) s += 30;
  s += Math.min(p.keyPoints?.length ?? 0, 4) * 2;

  // Heads of state and chamber leaders read first to most readers.
  if (p.chamber === "executive") s += 30;
  else if (p.chamber === "senate") s += 15;
  else if (p.chamber === "ep") s += 8;
  else if (p.chamber === "commons") s += 6;

  const role = p.role?.toLowerCase() ?? "";
  if (/president|prime minister|general secretary|speaker/.test(role)) s += 25;
  if (/leader|chair|ranking member|rapporteur|shadow/.test(role)) s += 10;
  if (/ai act|insight forum|commerce|judiciary|energy|armed services/.test(role)) {
    s += 4;
  }

  const curated = p.role?.includes("·") ?? false;
  if (curated) s += 6;
  if (p.stance && p.stance !== "none") s += 3;
  if (p.alignment) s += 5;
  s += Math.min(p.votes?.length ?? 0, 6) * 1;
  if (p.photoUrl) s += 1;
  return s;
}

export default function PoliticiansOverview() {
  const [scope, setScope] = useState<Scope>("all");

  const rows = useMemo(() => {
    const pool =
      scope === "all"
        ? ALL_POLITICIANS
        : ALL_POLITICIANS.filter((p) => p.country === scope);
    return [...pool]
      .sort((a, b) => {
        const diff = featuredScore(b) - featuredScore(a);
        if (diff) return diff;
        return a.name.localeCompare(b.name);
      })
      .slice(0, PREVIEW);
  }, [scope]);

  const totals = useMemo(() => {
    const byCountry = { US: 0, GB: 0, EU: 0 };
    for (const p of ALL_POLITICIANS) {
      if (p.country && p.country in byCountry)
        byCountry[p.country as keyof typeof byCountry]++;
    }
    return byCountry;
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-1.5">
          {SCOPES.map((s) => {
            const active = scope === s.key;
            const count =
              s.key === "all"
                ? ALL_POLITICIANS.length
                : totals[s.key as keyof typeof totals];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setScope(s.key)}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "bg-black/[.04] text-muted hover:bg-black/[.08] hover:text-ink"
                }`}
              >
                {s.label}
                <span className={`ml-1.5 ${active ? "text-white/60" : "text-muted/70"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <Link
          href="/politicians"
          className="text-xs text-muted hover:text-ink transition-colors"
        >
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((p) => (
          <PersonTile key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

function simplifyRole(role: string): string {
  // Strip the "(D-NY-14)" / "(I-VT)" parenthetical — the party badge
  // below already conveys it, and the parenthetical crowds the tile.
  return role.replace(/\s*\([^)]*\)/g, "").trim();
}

function PersonTile({ p }: { p: Legislator }) {
  return (
    <Link
      href={`/politicians?id=${encodeURIComponent(p.id)}`}
      className="group rounded-2xl bg-bg/60 hover:bg-bg p-4 flex items-start gap-3 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5"
    >
      <Avatar p={p} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink tracking-tight truncate">
          {p.name}
        </div>
        <div className="text-xs text-muted mt-0.5 leading-snug line-clamp-2">
          {simplifyRole(p.role)}
        </div>
      </div>
    </Link>
  );
}

function Avatar({ p }: { p: Legislator }) {
  const [errored, setErrored] = useState(false);
  if (p.photoUrl && !errored) {
    return (
      <Image
        src={p.photoUrl}
        alt=""
        width={40}
        height={40}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-black/[.04]"
        unoptimized
        onError={() => setErrored(true)}
      />
    );
  }
  const initials = initialsFor(p.name);
  return (
    <div className="w-10 h-10 rounded-full bg-black/[.04] flex items-center justify-center text-[11px] font-medium text-muted flex-shrink-0">
      {initials}
    </div>
  );
}
