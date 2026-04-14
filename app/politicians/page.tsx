import Link from "next/link";
import { Suspense } from "react";
import { ALL_POLITICIANS } from "@/lib/politicians-data";
import PoliticiansClient from "./PoliticiansClient";

export const metadata = {
  title: "Politicians · Track Policy",
  description:
    "How individual legislators have voted on AI and data-centre policy — with alignment scores against their stated stance.",
};

export default function PoliticiansPage() {
  return (
    <main className="min-h-screen bg-bg pt-20">
      <div className="max-w-6xl mx-auto px-8 pb-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors mb-10"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M7.5 2L3.5 6L7.5 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to map
        </Link>
        <h1 className="text-4xl font-semibold text-ink tracking-tight leading-[1.05] mb-2">
          Politicians
        </h1>
        <p className="text-sm text-muted mb-10 max-w-xl">
          Who voted how on AI and data-centre policy — scored against what
          they said they believed.
        </p>
        <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
          <PoliticiansClient all={ALL_POLITICIANS} />
        </Suspense>
      </div>
    </main>
  );
}
