import type { Metadata } from "next";
import { InsightsView } from "./insights-view";

export const metadata: Metadata = { title: "Model insights" };

export default function InsightsPage() {
  return <InsightsView />;
}
