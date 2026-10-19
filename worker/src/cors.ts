export const PREFLIGHT_MAX_AGE_SECONDS = 86_400;

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

/** "https://a.io, http://localhost:3000/" → ["https://a.io", "http://localhost:3000"]. No wildcards. */
export function parseAllowedOrigins(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map(normalizeOrigin)
    .filter((origin) => origin.length > 0 && origin !== "*" && origin !== "null");
}

export function isAllowedOrigin(origin: string | null, allowed: readonly string[]): origin is string {
  if (!origin) return false;
  return allowed.includes(normalizeOrigin(origin));
}

/** Headers for an actual response: the origin is echoed only when it is on the list. */
export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> {
  if (!isAllowedOrigin(origin, allowed)) return { Vary: "Origin" };
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

export function preflightHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-Id",
    "Access-Control-Max-Age": String(PREFLIGHT_MAX_AGE_SECONDS),
    Vary: "Origin",
  };
}
