import type { StanceType } from "@/types";

interface StanceBadgeProps {
  stance: StanceType;
  size?: "sm" | "md";
}

const LABELS: Record<StanceType, string> = {
  restrictive: "Restricting",
  concerning: "Cautionary",
  review: "Under Review",
  none: "No Activity",
  favorable: "Encouraging",
};

const DOT_COLOR: Record<StanceType, string> = {
  restrictive: "var(--color-stance-restrictive)",
  review: "var(--color-stance-review)",
  favorable: "var(--color-stance-favorable)",
  concerning: "var(--color-stance-concerning)",
  none: "var(--color-stance-none)",
};

export default function StanceBadge({ stance, size = "md" }: StanceBadgeProps) {
  const text = size === "md" ? "text-xs" : "text-[11px]";
  const dot = size === "md" ? "w-1.5 h-1.5" : "w-1 h-1";
  return (
    <span className={`inline-flex items-center gap-1.5 ${text} text-ink`}>
      <span
        className={`${dot} rounded-full`}
        style={{ backgroundColor: DOT_COLOR[stance] }}
      />
      <span>{LABELS[stance]}</span>
    </span>
  );
}
