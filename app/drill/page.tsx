import type { Metadata } from "next";
import { DrillScreen } from "@/components/practice/DrillScreen";

export const metadata: Metadata = { title: "Daily drill" };

export default function Page() {
  return <DrillScreen />;
}
