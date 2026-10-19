import type { Metadata } from "next";
import { CoachScreen } from "@/components/coach/CoachScreen";

export const metadata: Metadata = { title: "Speak with the coach" };

export default function Page() {
  return <CoachScreen />;
}
