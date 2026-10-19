import type { Metadata } from "next";
import { DiagnosticScreen } from "@/components/practice/DiagnosticScreen";

export const metadata: Metadata = { title: "Quick check" };

export default function Page() {
  return <DiagnosticScreen />;
}
