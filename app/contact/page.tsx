import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact · Track Policy",
};

export default function ContactPage() {
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
          Contact
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold text-ink tracking-tight leading-[1.05] mb-10">
          Get in touch
        </h1>

        <div className="text-base text-ink/80 leading-relaxed space-y-5">
          <p>
            We welcome corrections, suggestions, tips on bills we&rsquo;re
            missing, and disagreements with our stance calls. The goal is a
            more accurate map; fights about classification are the best way to
            get there.
          </p>
          <p>
            General:{" "}
            <a
              href="mailto:hello@trackpolicy.example"
              className="text-ink underline underline-offset-2 hover:text-muted transition-colors"
            >
              hello@trackpolicy.example
            </a>
          </p>
          <p>
            Press:{" "}
            <a
              href="mailto:press@trackpolicy.example"
              className="text-ink underline underline-offset-2 hover:text-muted transition-colors"
            >
              press@trackpolicy.example
            </a>
          </p>
          <p>
            Source tips or data corrections:{" "}
            <a
              href="mailto:tips@trackpolicy.example"
              className="text-ink underline underline-offset-2 hover:text-muted transition-colors"
            >
              tips@trackpolicy.example
            </a>
          </p>
          <p className="text-muted italic">
            These are placeholder addresses — real contact channels coming
            soon.
          </p>
        </div>
      </div>
    </main>
  );
}
