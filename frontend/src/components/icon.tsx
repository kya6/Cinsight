import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type IconName =
  | "nav-overview"
  | "nav-score"
  | "nav-queue"
  | "nav-batch"
  | "nav-insights"
  | "plus-square"
  | "arrow-right"
  | "download"
  | "search"
  | "chevron-down"
  | "copy";

/** A Figma icon from /public/icons, drawn in the current text colour. Decorative: label the control instead. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("icon-mask size-4", className)}
      style={{ "--icon": `url(/icons/${name}.svg)` } as CSSProperties}
    />
  );
}
