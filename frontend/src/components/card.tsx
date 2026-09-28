import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The Figma "card": surface, 1px line, 14px radius, 21px padding. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("flex min-w-0 flex-col gap-3.5 rounded-card border border-line bg-surface p-5.25", className)}
      {...props}
    />
  );
}

export function CardTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-16 font-semibold text-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Small uppercase-style label used above values ("Received", "Top reasons"). */
export function FieldLabel({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-12 leading-15 font-semibold tracking-label text-ink-3", className)} {...props} />;
}
