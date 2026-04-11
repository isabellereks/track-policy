"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Hero from "@/components/hero/Hero";
import MapShell from "@/components/map/MapShell";
import SummaryBar from "@/components/sections/SummaryBar";
import DimensionToggle from "@/components/sections/DimensionToggle";
import AIOverview from "@/components/sections/AIOverview";
import NuanceLegend from "@/components/sections/NuanceLegend";
import LegislationTable from "@/components/sections/LegislationTable";
import { useScrollProgress } from "@/lib/use-scroll-progress";
import type { Dimension, Region, ViewTarget } from "@/types";

export default function Page() {
  const progress = useScrollProgress();
  const [dimension, setDimension] = useState<Dimension>("overall");
  const navigateRef = useRef<((t: ViewTarget) => void) | null>(null);

  const handleNavigateToEntity = (t: ViewTarget) => {
    navigateRef.current?.(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGlobeRegionClick = (region: Region) => {
    // Update the map state first — the map is already mounted under the hero,
    // so by the time the user scrolls into view it's already on the right
    // region. Then run a custom RAF-driven scroll so the reveal animation
    // plays slowly and smoothly, with an ease-out curve instead of the
    // browser's default (which is both too fast and not tunable).
    navigateRef.current?.({
      region,
      naView: "countries",
      selectedGeoId: null,
    });
    if (typeof window === "undefined") return;
    const targetY = window.innerHeight * 2.2;
    const startY = window.scrollY;
    const distance = targetY - startY;
    if (Math.abs(distance) < 1) return;
    const duration = 1800;
    const startTime = performance.now();
    // ease-out quart — strong, smooth deceleration
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      window.scrollTo(0, startY + distance * ease(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return (
    <>
      <MapShell
        revealProgress={progress}
        dimension={dimension}
        navigateRef={navigateRef}
      />
      <Hero progress={progress} onRegionClick={handleGlobeRegionClick} />
      <div className="h-[400vh]" aria-hidden />

      {/* Section 1 — At a glance: summary stats + color-by toggle */}
      <section className="relative z-10 bg-white border-t border-black/[.06]">
        <div className="max-w-5xl mx-auto px-8 pt-20 pb-16">
          <div className="text-[13px] font-medium text-muted tracking-tight mb-2">
            01 · At a glance
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-ink tracking-tight leading-[1.1] mb-10">
            State of AI data center policy
          </h2>
          <SummaryBar />
          <div className="mt-12">
            <DimensionToggle dimension={dimension} onChange={setDimension} />
          </div>
        </div>
      </section>

      {/* Section 2 — AI overview narrative */}
      <section className="relative z-10 bg-bg border-t border-black/[.06]">
        <div className="max-w-5xl mx-auto px-8 py-20">
          <div className="text-[13px] font-medium text-muted tracking-tight mb-2">
            02 · Latest developments
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-ink tracking-tight leading-[1.1] mb-10">
            What happened this week
          </h2>
          <AIOverview />
        </div>
      </section>

      {/* Section 3 — Impact tag legend */}
      <section className="relative z-10 bg-white border-t border-black/[.06]">
        <div className="max-w-5xl mx-auto px-8 py-20">
          <div className="text-[13px] font-medium text-muted tracking-tight mb-2">
            03 · How we categorize
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-ink tracking-tight leading-[1.1] mb-10">
            Impact tags by dimension
          </h2>
          <NuanceLegend />
        </div>
      </section>

      {/* Section 4 — Full legislation table */}
      <section className="relative z-10 bg-bg border-t border-black/[.06]">
        <div className="max-w-5xl mx-auto px-8 pt-20 pb-24">
          <div className="text-[13px] font-medium text-muted tracking-tight mb-2">
            04 · The full record
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-ink tracking-tight leading-[1.1] mb-10">
            Every bill we&rsquo;re tracking
          </h2>
          <LegislationTable
            dimension={dimension}
            onNavigateToEntity={handleNavigateToEntity}
          />
        </div>
      </section>

      {/* Footer */}
      <section className="relative z-10 bg-white border-t border-black/[.06]">
        <div className="max-w-5xl mx-auto px-8 py-10 flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
          <span>Track Policy</span>
          <div className="flex gap-6">
            <Link href="/about" className="hover:text-ink transition-colors">
              About
            </Link>
            <Link
              href="/methodology"
              className="hover:text-ink transition-colors"
            >
              Methodology
            </Link>
            <Link href="/contact" className="hover:text-ink transition-colors">
              Contact
            </Link>
          </div>
          <span>
            Inspired by{" "}
            <a
              href="https://datacenterbans.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ink transition-colors"
            >
              datacenterbans.com
            </a>
            <span aria-hidden> · </span>
            Icons by{" "}
            <a
              href="https://streamlinehq.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ink transition-colors"
            >
              Streamline
            </a>
          </span>
        </div>
      </section>
    </>
  );
}
