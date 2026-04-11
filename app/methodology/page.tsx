import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology · Track Policy",
};

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-8 py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors mb-16"
        >
          ← Back
        </Link>

        <div className="text-[13px] font-medium text-muted tracking-tight mb-3">
          Methodology
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold text-ink tracking-tight leading-[1.05] mb-10">
          How we build the data
        </h1>

        <div className="text-base text-ink/80 leading-relaxed space-y-5">
          <p>
            Every bill on the site comes from official legislative tracking
            sites — state legislature portals, congress.gov, the EU&rsquo;s
            eur-lex, and equivalent sources in each jurisdiction we cover.
            We re-check each active bill weekly for stage changes.
          </p>
          <p>
            Each bill is coded against a set of{" "}
            <strong className="text-ink font-semibold">impact tags</strong> —
            grid strain, water use, emissions, local control, and so on —
            drawn from its summary, committee testimony, and bill text.
            Tags are assigned by hand; we don&rsquo;t use automated sentiment
            analysis because policy nuance doesn&rsquo;t survive it.
          </p>
          <p>
            The{" "}
            <strong className="text-ink font-semibold">stance</strong> of a
            jurisdiction — restrictive, concerning, under review, favorable,
            or no action — is a judgment call based on the direction and
            weight of its active legislation, not a score. A state with one
            enacted moratorium weighs more than a state with five filed
            study bills.
          </p>
          <p>
            When a bill has no clear impact, we leave the tag list empty
            rather than forcing it into a bucket. When a jurisdiction has
            contradictory bills — one moratorium and one incentive — we
            flag it as <em>concerning</em> rather than picking a side.
          </p>
          <p className="text-muted italic">
            This is placeholder content while we build out the full site.
          </p>
        </div>
      </div>
    </main>
  );
}
