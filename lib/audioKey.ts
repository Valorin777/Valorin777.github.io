/**
 * Shared by the recording script (scripts/build-audio.ts) and the player: the same sentence
 * always maps to the same file name, so recorded lesson audio is found without a server.
 */

/** The text that is actually spoken: no markup, single spaces. */
export function audioText(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_{3,}/g, "blank")
    .replace(/\s+/g, " ")
    .trim();
}

function fnv1a(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** 16 hex characters; stable across runs and platforms. */
export function audioKey(text: string, voice: string): string {
  const t = `${voice}|${audioText(text)}`;
  return fnv1a(t, 0x811c9dc5) + fnv1a(t, 0x1b873593);
}
