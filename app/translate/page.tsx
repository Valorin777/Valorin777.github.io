import type { Metadata } from "next";
import { TranslateScreen } from "@/components/translate/TranslateScreen";

export const metadata: Metadata = { title: "Переводчик" };

export default function Page() {
  return <TranslateScreen />;
}
