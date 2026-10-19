import { afterEach, describe, expect, it, vi } from "vitest";
import { STT_MAX_BYTES, parseSttResponse, sttContentType, transcribe } from "@/lib/stt";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function load(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_AI_URL", "https://ai.example.dev/");
  vi.stubGlobal("window", {});
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", fetchMock);
  const mod = await import("@/lib/stt");
  return { mod, fetchMock };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("stt helpers", () => {
  it("maps recorder types to the bare types the worker accepts", () => {
    expect(sttContentType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(sttContentType("video/webm")).toBe("audio/webm");
    expect(sttContentType("audio/mp4")).toBe("audio/mp4");
    expect(sttContentType("audio/mp4; codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(sttContentType("audio/ogg;codecs=opus")).toBe("audio/ogg");
    expect(sttContentType("audio/x-wav")).toBe("audio/wav");
    expect(sttContentType("audio/mpeg")).toBeNull();
    expect(sttContentType("")).toBeNull();
  });

  it("parses { text }", () => {
    expect(parseSttResponse({ text: "  I have   known her " })).toBe("I have known her");
    expect(parseSttResponse({ text: "" })).toBe("");
    expect(parseSttResponse({ error: "x" })).toBeNull();
    expect(parseSttResponse(null)).toBeNull();
  });

  it("is disabled without NEXT_PUBLIC_AI_URL", async () => {
    await expect(transcribe(new Blob(["x"], { type: "audio/webm" }), "en")).rejects.toMatchObject({ kind: "disabled" });
  });
});

describe("transcribe()", () => {
  it("posts the raw recording with its bare type, device id and language", async () => {
    const { mod, fetchMock } = await load(async () => json({ text: " It has started. " }));
    const blob = new Blob([new Uint8Array(1200)], { type: "audio/webm;codecs=opus" });
    expect(await mod.transcribe(blob, "en")).toBe("It has started.");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.example.dev/stt?lang=en");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(blob);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("audio/webm");
    expect(headers["X-Device-Id"]?.length).toBeGreaterThan(7);
    expect(init.credentials).toBe("omit");

    await mod.transcribe(new Blob(["x"], { type: "audio/mp4" }), "ru");
    const [ruUrl, ruInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(ruUrl).toBe("https://ai.example.dev/stt?lang=ru");
    expect((ruInit.headers as Record<string, string>)["Content-Type"]).toBe("audio/mp4");
  });

  it("skips the request for empty, oversized or unknown audio", async () => {
    const { mod, fetchMock } = await load(async () => json({ text: "x" }));
    expect(await mod.transcribe(new Blob([], { type: "audio/webm" }), "en")).toBe("");
    await expect(
      mod.transcribe(new Blob([new Uint8Array(STT_MAX_BYTES + 1)], { type: "audio/webm" }), "en"),
    ).rejects.toMatchObject({ kind: "unavailable" });
    await expect(mod.transcribe(new Blob(["x"], { type: "text/plain" }), "en")).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps worker errors", async () => {
    const blob = new Blob(["x"], { type: "audio/webm" });
    const tooBig = await load(async () => json({ error: "too large" }, 413));
    await expect(tooBig.mod.transcribe(blob, "en")).rejects.toMatchObject({ kind: "unavailable" });
    const limited = await load(async () => json({ error: "rate-limit" }, 429));
    await expect(limited.mod.transcribe(blob, "en")).rejects.toMatchObject({ kind: "rate-limit" });
    const junk = await load(async () => json({ nope: 1 }));
    await expect(junk.mod.transcribe(blob, "en")).rejects.toMatchObject({ kind: "unavailable" });
    const offline = await load(async () => json({ text: "x" }));
    vi.stubGlobal("navigator", { onLine: false });
    await expect(offline.mod.transcribe(blob, "en")).rejects.toMatchObject({ kind: "offline" });
    expect(offline.fetchMock).not.toHaveBeenCalled();
  });
});
