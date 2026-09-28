"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { API_URL, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** The grey placeholder bars used for loading states in the design ("sk" layers). */
export function Bone({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block h-2.5 animate-pulse rounded-5 bg-chip", className)} />;
}

/** Wraps a loading placeholder so screen readers hear one "Loading" instead of empty shapes. */
export function Loading({ label = "Loading", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action, className }: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg bg-inset px-6 py-10 text-center", className)}>
      <p className="text-14 font-semibold text-ink">{title}</p>
      {children && <p className="max-w-md text-13 text-ink-3">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function describe(error: unknown) {
  if (error instanceof ApiError) {
    if (error.kind === "unreachable") {
      return {
        title: "Can't reach the Cinsight API",
        body: `The backend at ${API_URL} isn't responding. Check that it's running, then try again.`,
      };
    }
    if (error.kind === "config") return { title: "The API address is missing", body: error.message };
    return { title: "The API returned an error", body: error.message };
  }
  return { title: "Something went wrong", body: error instanceof Error ? error.message : "Unexpected error." };
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { title, body } = describe(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-high-line bg-high-bg-2 px-5 py-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <p className="text-14 font-semibold text-high">{title}</p>
        <p className="text-13 text-ink-2">{body}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="md" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
