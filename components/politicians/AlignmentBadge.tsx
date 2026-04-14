import type { AlignmentScore } from "@/types";

export default function AlignmentBadge({
  alignment,
}: {
  alignment?: AlignmentScore;
}) {
  if (!alignment) {
    return (
      <div className="flex items-center gap-2" aria-label="Insufficient vote data">
        <Ring score={null} color="var(--color-muted)" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-muted">—</span>
          <span className="text-[11px] text-muted">Insufficient data</span>
        </div>
      </div>
    );
  }

  const { score, totalVotes } = alignment;
  const { label, colorVar } = bucketForScore(score);
  return (
    <div
      className="flex items-center gap-2"
      aria-label={`Alignment score ${score} of 100 across ${totalVotes} votes`}
    >
      <Ring score={score} color={`var(${colorVar})`} />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-ink">{score}%</span>
        <span className="text-[11px] text-muted">
          {label} · {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        </span>
      </div>
    </div>
  );
}

function bucketForScore(score: number): { label: string; colorVar: string } {
  if (score >= 80) return { label: "Consistent", colorVar: "--color-stance-favorable" };
  if (score >= 60) return { label: "Mixed", colorVar: "--color-stance-concerning" };
  return { label: "Contradictory", colorVar: "--color-stance-restrictive" };
}

function Ring({ score, color }: { score: number | null; color: string }) {
  const size = 26;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-black/[.06]" strokeWidth={stroke} />
      {score !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}
