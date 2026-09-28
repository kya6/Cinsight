import type { ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-30 font-semibold text-ink">{title}</h1>
        <p className="text-12 text-ink-3">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
