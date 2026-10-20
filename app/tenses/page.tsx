import type { Metadata } from "next";
import { TensesScreen } from "@/components/tenses/TensesScreen";

export const metadata: Metadata = { title: "All the tenses" };

export default function Page() {
  return <TensesScreen />;
}
