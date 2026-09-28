import type { Metadata } from "next";
import { ScoreView } from "./score-view";

export const metadata: Metadata = { title: "Score a complaint" };

export default function ScorePage() {
  return <ScoreView />;
}
