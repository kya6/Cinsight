import type { ReactNode } from "react";
import type { Tier } from "@/lib/api";
import { formatScore } from "@/lib/format";
import { cn } from "@/lib/utils";

export const TIERS: Tier[] = ["High", "Medium", "Low"];

export const TIER_STYLE: Record<Tier, { text: string; bar: string; tint: string }> = {
  High: { text: "text-high", bar: "bg-high-bar", tint: "bg-high-bg" },
  Medium: { text: "text-medium", bar: "bg-medium", tint: "bg-medium-bg" },
  Low: { text: "text-low", bar: "bg-bar-3", tint: "bg-low-bg" },
};

/**
 * Tier pill. `tone="tinted"` uses the tier's own background (rules panel, selected row);
 * `tone="neutral"` sits on a grey chip (tables).
 */
export function TierChip({
  tier,
  tone = "neutral",
  children,
  className,
}: {
  tier: Tier;
  tone?: "neutral" | "tinted";
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.25 text-12 leading-15 font-semibold whitespace-nowrap",
        tone === "tinted" ? TIER_STYLE[tier].tint : "bg-chip",
        TIER_STYLE[tier].text,
        className,
      )}
    >
      {children ?? tier}
    </span>
  );
}

/** Score cell: a bar the length of the score plus the number (never shown as a percentage). */
export function ScoreBar({ score, tier }: { score: number; tier: Tier }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-2.5 w-12.75 overflow-hidden rounded-5 bg-inset">
        <span
          className={cn("block h-full origin-left animate-grow-x rounded-5", TIER_STYLE[tier].bar)}
          style={{ width: `${score * 100}%` }}
        />
      </span>
      <span className="text-12 leading-15 text-ink-2 tabular-nums">{formatScore(score)}</span>
    </span>
  );
}
