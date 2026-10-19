"use client";

import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { OfflineNotice } from "@/components/OfflineNotice";
import { SpeechProvider } from "@/components/speech/SpeechProvider";
import { SelectionTranslate } from "@/components/translate/SelectionTranslate";
import { initCloud } from "@/lib/cloud";
import { installAudioUnlock } from "@/lib/tts";
import { useAppState } from "@/lib/store";

function ThemeSync() {
  const theme = useAppState().settings.theme;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
  return null;
}

function AppStart() {
  useEffect(() => {
    initCloud();
    installAudioUnlock();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => undefined);
    }
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", duration: 0.25, bounce: 0 }}>
      <ThemeSync />
      <AppStart />
      <OfflineNotice />
      <SpeechProvider>
        {children}
        <SelectionTranslate />
      </SpeechProvider>
    </MotionConfig>
  );
}
