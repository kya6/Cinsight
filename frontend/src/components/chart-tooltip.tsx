import type { ReactNode } from "react";

/** Hover tooltip for charts: a small card, values in ink, labels in secondary ink. */
export function ChartTooltip({ title, rows }: { title: ReactNode; rows: [label: string, value: ReactNode][] }) {
  return (
    <div className="flex min-w-36 flex-col gap-1.5 rounded-lg border border-line bg-page px-3 py-2.5 shadow-lg">
      <p className="text-12 leading-15 font-semibold text-ink">{title}</p>
      {rows.map(([label, value]) => (
        <p key={label} className="flex justify-between gap-4 text-12 leading-15">
          <span className="text-ink-3">{label}</span>
          <span className="text-ink tabular-nums">{value}</span>
        </p>
      ))}
    </div>
  );
}
