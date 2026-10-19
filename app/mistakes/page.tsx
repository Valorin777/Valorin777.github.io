import type { Metadata } from "next";
import { MistakesScreen } from "@/components/practice/MistakesScreen";

export const metadata: Metadata = { title: "Top mistakes" };

export default function Page() {
  return <MistakesScreen />;
}
