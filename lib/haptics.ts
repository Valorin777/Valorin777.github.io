/** Short vibrations where navigator.vibrate exists (Android browsers). No-op elsewhere, never throws. */

export type BuzzKind = "correct" | "close" | "tap";

const PATTERNS: Record<BuzzKind, number | number[]> = {
  correct: 10,
  close: [12, 40, 12],
  tap: 6,
};

export function buzz(kind: BuzzKind): void {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    const pattern = PATTERNS[kind];
    if (pattern === undefined) return;
    navigator.vibrate(pattern);
  } catch {
    // ignore: some browsers throw without user activation or inside iframes
  }
}
