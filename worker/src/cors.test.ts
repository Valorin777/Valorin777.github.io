import { describe, expect, it } from "vitest";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins, preflightHeaders } from "./cors";

const ALLOWED = parseAllowedOrigins(
  "https://valorin777.github.io, http://localhost:3000/,http://127.0.0.1:3000,,*",
);

describe("parseAllowedOrigins", () => {
  it("trims, lowercases, drops trailing slashes, empties and wildcards", () => {
    expect(ALLOWED).toEqual(["https://valorin777.github.io", "http://localhost:3000", "http://127.0.0.1:3000"]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("null")).toEqual([]);
  });
});

describe("isAllowedOrigin", () => {
  it("matches exact origins only", () => {
    expect(isAllowedOrigin("https://valorin777.github.io", ALLOWED)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", ALLOWED)).toBe(true);
    expect(isAllowedOrigin("https://evil.github.io", ALLOWED)).toBe(false);
    expect(isAllowedOrigin("https://valorin777.github.io.evil.com", ALLOWED)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3001", ALLOWED)).toBe(false);
    expect(isAllowedOrigin("null", ALLOWED)).toBe(false);
    expect(isAllowedOrigin(null, ALLOWED)).toBe(false);
    expect(isAllowedOrigin("https://anything.io", [])).toBe(false);
  });
});

describe("corsHeaders", () => {
  it("echoes an allowed origin", () => {
    expect(corsHeaders("https://valorin777.github.io", ALLOWED)).toEqual({
      "Access-Control-Allow-Origin": "https://valorin777.github.io",
      Vary: "Origin",
    });
  });

  it("gives other origins nothing but Vary", () => {
    expect(corsHeaders("https://evil.example", ALLOWED)).toEqual({ Vary: "Origin" });
    expect(corsHeaders(null, ALLOWED)).toEqual({ Vary: "Origin" });
  });
});

describe("preflightHeaders", () => {
  it("allows POST with content-type and x-device-id for a day", () => {
    const headers = preflightHeaders("http://localhost:3000");
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Headers"]?.toLowerCase()).toBe("content-type, x-device-id");
    expect(headers["Access-Control-Max-Age"]).toBe("86400");
  });
});
