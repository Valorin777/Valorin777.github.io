"use client";

import { useEffect, useRef } from "react";

export type HotkeyMap = Partial<Record<string, (e: KeyboardEvent) => void>>;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "BUTTON" || target.tagName === "A" || target.getAttribute("role") === "switch");
}

/**
 * Global keyboard shortcuts. Keys are KeyboardEvent.key values ("Enter", " ", "1", "ArrowRight").
 * Ignored while typing in a field, with modifier keys, and for Enter/Space on a focused button
 * (the browser already activates the button).
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTyping(e.target)) return;
      if ((e.key === "Enter" || e.key === " ") && isActivatable(e.target)) return;
      const handler = ref.current[e.key] ?? ref.current[e.key.toLowerCase()];
      if (!handler) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
