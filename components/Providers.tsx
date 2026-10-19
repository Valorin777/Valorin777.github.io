"use client";

import { MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";
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

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", duration: 0.25, bounce: 0 }}>
      <ThemeSync />
      {children}
    </MotionConfig>
  );
}
