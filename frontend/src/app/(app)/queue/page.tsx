import { Suspense } from "react";
import type { Metadata } from "next";
import { QueueView } from "./queue-view";

export const metadata: Metadata = { title: "High-risk queue" };

export default function QueuePage() {
  // The filters live in the URL, so the view reads search params and renders on the client
  return (
    <Suspense>
      <QueueView />
    </Suspense>
  );
}
