import type { IconName } from "./icon";

export const NAV: { href: `/${string}`; label: string; icon: IconName }[] = [
  { href: "/overview", label: "Overview", icon: "nav-overview" },
  { href: "/score", label: "Score a complaint", icon: "nav-score" },
  { href: "/queue", label: "High-risk queue", icon: "nav-queue" },
  { href: "/batch", label: "Batch scoring", icon: "nav-batch" },
  { href: "/insights", label: "Model insights", icon: "nav-insights" },
];

/** There is no authentication: the account shown is the one in the design. */
export const ACCOUNT = { name: "M0X Alkhayat", role: "Admin" };
