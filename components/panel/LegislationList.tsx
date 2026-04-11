import type { Legislation } from "@/types";
import BillTimeline from "@/components/ui/BillTimeline";

interface LegislationListProps {
  legislation: Legislation[];
}

export default function LegislationList({ legislation }: LegislationListProps) {
  return (
    <div className="flex flex-col gap-3">
      {legislation.map((bill) => {
        const href = bill.legiscanUrl ?? bill.sourceUrl;
        return (
        <a
          key={bill.id}
          href={href ?? "#"}
          target={href ? "_blank" : undefined}
          rel={href ? "noopener noreferrer" : undefined}
          className="block bg-bg/60 rounded-2xl p-4 hover:bg-bg transition-colors"
        >
          <div className="text-xs text-muted">{bill.billCode}</div>
          <div className="text-sm font-medium mt-1 text-ink tracking-tight">
            {bill.title}
          </div>
          <p className="text-xs text-muted mt-1.5 leading-relaxed">
            {bill.summary}
          </p>
          <BillTimeline stage={bill.stage} />
        </a>
        );
      })}
    </div>
  );
}
