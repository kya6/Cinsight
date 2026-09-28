import type { Metadata } from "next";
import { BatchView } from "./batch-view";

export const metadata: Metadata = { title: "Batch scoring" };

export default function BatchPage() {
  return <BatchView />;
}
