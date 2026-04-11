import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About · Track Policy",
};

export default function AboutPage() {
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
          About
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold text-ink tracking-tight leading-[1.05] mb-10">
          What this is
        </h1>

        <div className="text-base text-ink/80 leading-relaxed space-y-5">
          <p>
            Track Policy is an independent research project tracking
            legislation, regulatory actions, and industry commitments related
            to AI and data center policy worldwide. Our goal is to provide a
            single, up-to-date view of where governments stand on the most
            consequential technology policy questions of this decade.
          </p>
          <p>
            We aggregate data from official legislative sources, agency
            filings, and news coverage. Each entity — country, state, or
            regional bloc — is coded with a stance and a set of impact tags
            drawn from the bills currently moving through it.
          </p>
          <p>
            This project was inspired by{" "}
            <a
              href="https://datacenterbans.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline underline-offset-2 hover:text-muted transition-colors"
            >
              datacenterbans.com
            </a>
            , which maps US-state data center moratoriums. We&rsquo;re
            expanding the scope to cover every major jurisdiction and the full
            policy surface — not just bans, but incentives, disclosures, and
            the regulatory framework being written in real time.
          </p>
          <p className="text-muted italic">
            This is placeholder content while we build out the full site.
          </p>
        </div>
      </div>
    </main>
  );
}
