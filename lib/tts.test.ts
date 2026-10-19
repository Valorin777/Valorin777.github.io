import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSpeechText, speechChunks, truncateAtWord, ttsCacheUrl } from "@/lib/tts";

/* ------------------------------------------------------------------- fakes */

class FakeCache {
  readonly store = new Map<string, Response>();

  async match(key: string): Promise<Response | undefined> {
    return this.store.get(key)?.clone();
  }

  async put(key: string, response: Response): Promise<void> {
    this.store.set(key, response);
  }

  async keys(): Promise<Request[]> {
    return [...this.store.keys()].map((key) => new Request(key));
  }

  async delete(request: Request | string): Promise<boolean> {
    return this.store.delete(typeof request === "string" ? request : request.url);
  }
}

class FakeAudio {
  static instances: FakeAudio[] = [];
  /** Next play() rejects like a browser blocking autoplay. */
  static blockPlay = false;
  private readonly listeners = new Map<string, Set<() => void>>();
  private source = "";
  paused = true;
  ended = false;
  error: { code: number } | null = null;
  preload = "";
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preservesPitch = false;
  plays: string[] = [];

  constructor() {
    FakeAudio.instances.push(this);
  }

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    this.paused = true;
    this.ended = false;
    this.error = null;
  }

  addEventListener(type: string, fn: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  listenerCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }

  emit(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }

  play(): Promise<void> {
    this.plays.push(this.source);
    if (FakeAudio.blockPlay && !this.source.startsWith("data:")) {
      return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  removeAttribute(name: string): void {
    if (name === "src") this.source = "";
  }

  load(): void {}

  /** The current clip plays to its end: "pause" then "ended", as browsers do. */
  playToEnd(): void {
    this.paused = true;
    this.ended = true;
    this.emit("pause");
    this.emit("ended");
  }

  clipPlays(): string[] {
    return this.plays.filter((src) => src.startsWith("blob:"));
  }
}

const audioResponse = (bytes = 3) =>
  new Response(new Uint8Array(bytes).fill(7), { headers: { "Content-Type": "audio/mpeg", "X-TTS-Model": "aura-1" } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function load(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, opts: { cache?: boolean } = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_AI_URL", "https://ai.example.dev");
  vi.stubGlobal("window", {});
  FakeAudio.instances = [];
  FakeAudio.blockPlay = false;
  vi.stubGlobal("Audio", FakeAudio);
  const cache = new FakeCache();
  if (opts.cache !== false) vi.stubGlobal("caches", { open: async () => cache });
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", fetchMock);
  const mod = await import("@/lib/tts");
  return { mod, cache, fetchMock };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/* ------------------------------------------------------------------- tests */

describe("text prep and cache keys", () => {
  it("normalizes spacing, quotes and width but keeps case and punctuation", () => {
    expect(normalizeSpeechText("  I’ve   been\nwaiting… ")).toBe("I've been waiting...");
    expect(normalizeSpeechText("Ｈｅｌｌｏ")).toBe("Hello");
    expect(normalizeSpeechText("")).toBe("");
  });

  it("keys a clip by voice and normalized text", () => {
    const base = "https://ai.example.dev";
    const key = ttsCacheUrl("a1-asteria", "I have known her for years.", base);
    expect(key.startsWith(`${base}/tts-cache/a1-asteria/`)).toBe(true);
    expect(ttsCacheUrl("a1-asteria", "  I have  known her for years. ", base)).toBe(key);
    expect(ttsCacheUrl("a1-luna", "I have known her for years.", base)).not.toBe(key);
    expect(ttsCacheUrl("a1-asteria", "I have known her for years?", base)).not.toBe(key);
    expect(ttsCacheUrl("a1-asteria", "US", base)).not.toBe(ttsCacheUrl("a1-asteria", "us", base));
  });

  it("truncates on a word boundary", () => {
    expect(truncateAtWord("one two three", 9)).toBe("one two");
    expect(truncateAtWord("short", 9)).toBe("short");
    expect(truncateAtWord("abcdefghijkl", 5)).toBe("abcde");
  });

  it("splits long text between sentences, never above the limit, without losing words", () => {
    const sentence = (n: number) => `Sentence ${n} has a few more words in it than you might expect.`;
    const text = Array.from({ length: 12 }, (_, i) => sentence(i)).join(" ");
    const chunks = speechChunks(text);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300);
      expect(chunk.endsWith(".")).toBe(true);
    }
    expect(chunks.join(" ")).toBe(text);
    expect(speechChunks("Hi there.")).toEqual(["Hi there."]);
    expect(speechChunks("   ")).toEqual([]);
    const run = "word ".repeat(150).trim();
    const pieces = speechChunks(run);
    expect(pieces.every((p) => p.length <= 300)).toBe(true);
    expect(pieces.join(" ")).toBe(run);
  });
});

describe("fetchSpeech", () => {
  it("is disabled without NEXT_PUBLIC_AI_URL", async () => {
    vi.resetModules();
    const mod = await import("@/lib/tts");
    await expect(mod.fetchSpeech("Hello", "a1-asteria")).rejects.toMatchObject({ kind: "disabled" });
    expect(mod.neuralAvailable()).toBe(false);
  });

  it("posts on a miss, stores the clip, then serves it from Cache Storage", async () => {
    const { mod, cache, fetchMock } = await load(async () => audioResponse(4));
    expect(mod.neuralAvailable()).toBe(true);
    const blob = await mod.fetchSpeech("  I have   known her. ", "a1-asteria");
    expect(blob.size).toBe(4);
    expect(blob.type).toBe("audio/mpeg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.example.dev/tts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ text: "I have known her.", voice: "a1-asteria" });
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Device-Id"]?.length).toBeGreaterThan(7);
    expect([...cache.store.keys()]).toEqual([mod.ttsCacheUrl("a1-asteria", "I have known her.")]);

    const again = await mod.fetchSpeech("I have known her.", "a1-asteria");
    expect(again.size).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one request between concurrent callers", async () => {
    let release: (r: Response) => void = () => undefined;
    const { mod, fetchMock } = await load(() => new Promise<Response>((resolve) => (release = resolve)));
    const a = mod.fetchSpeech("Hello there.", "a1-luna");
    const b = mod.fetchSpeech("Hello  there.", "a1-luna");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release(audioResponse(2));
    const [x, y] = await Promise.all([a, b]);
    expect(x.size).toBe(2);
    expect(y).toBe(x);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an aborted caller stops waiting without cancelling the shared request", async () => {
    let release: (r: Response) => void = () => undefined;
    const { mod, cache } = await load(() => new Promise<Response>((resolve) => (release = resolve)));
    const controller = new AbortController();
    const first = mod.fetchSpeech("Hello there.", "a1-luna", controller.signal);
    const second = mod.fetchSpeech("Hello there.", "a1-luna");
    controller.abort();
    const error: unknown = await first.catch((e: unknown) => e);
    expect((error as { name?: string }).name).toBe("AbortError");
    release(audioResponse(2));
    expect((await second).size).toBe(2);
    expect(cache.store.size).toBe(1);
  });

  it("maps errors and works without Cache Storage", async () => {
    const limited = await load(async () => json({ error: "rate-limit" }, 429), { cache: false });
    await expect(limited.mod.fetchSpeech("Hi.", "a1-luna")).rejects.toMatchObject({ kind: "rate-limit" });
    const broken = await load(async () => json({ error: "upstream" }, 502));
    await expect(broken.mod.fetchSpeech("Hi.", "a1-luna")).rejects.toMatchObject({ kind: "unavailable" });
    const wrongType = await load(async () => json({ ok: true }));
    await expect(wrongType.mod.fetchSpeech("Hi.", "a1-luna")).rejects.toMatchObject({ kind: "unavailable" });
    const fine = await load(async () => audioResponse(), { cache: false });
    expect((await fine.mod.fetchSpeech("Hi.", "a1-luna")).size).toBe(3);
  });

  it("fails fast offline unless the clip is cached", async () => {
    const { mod, fetchMock } = await load(async () => audioResponse());
    await mod.fetchSpeech("Cached one.", "a1-luna");
    vi.stubGlobal("navigator", { onLine: false });
    expect((await mod.fetchSpeech("Cached one.", "a1-luna")).size).toBe(3);
    await expect(mod.fetchSpeech("New one.", "a1-luna")).rejects.toMatchObject({ kind: "offline" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mod.neuralAvailable()).toBe(false);
  });
});

describe("prefetchSpeech", () => {
  it("fetches two at a time, skips cached clips and duplicates", async () => {
    const pending: Array<(r: Response) => void> = [];
    const { mod, fetchMock } = await load(() => new Promise<Response>((resolve) => pending.push(resolve)));
    pending.length = 0;
    mod.prefetchSpeech(["One.", "Two.", "Three.", "One."], "a1-luna");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()?.(audioResponse());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    for (const resolve of pending.splice(0)) resolve(audioResponse());
    await vi.waitFor(() => expect(pending).toHaveLength(0));
    await new Promise((r) => setTimeout(r, 10));
    for (const resolve of pending.splice(0)) resolve(audioResponse());
    const bodies = fetchMock.mock.calls.map(([, init]) => (JSON.parse(String(init.body)) as { text: string }).text);
    expect(bodies.sort()).toEqual(["One.", "Three.", "Two."]);

    mod.prefetchSpeech(["One.", "Two."], "a1-luna");
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops at the first 429", async () => {
    const { mod, fetchMock } = await load(async () => json({ error: "rate-limit" }, 429));
    mod.prefetchSpeech(["A.", "B.", "C.", "D.", "E."], "a1-luna");
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("speakNeural", () => {
  async function ready() {
    const loaded = await load(async () => audioResponse());
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    return { ...loaded, revoke };
  }

  function track() {
    const events: string[] = [];
    return {
      events,
      opts: {
        rate: 3,
        onStart: () => events.push("start"),
        onEnd: () => events.push("end"),
        onError: (reason: string) => events.push(`error:${reason}`),
      },
    };
  }

  it("plays the clip on one shared element: start, then end exactly once", async () => {
    const { mod, revoke } = await ready();
    const { events, opts } = track();
    mod.speakNeural("Hello there.", "a1-asteria", opts);
    const audio = FakeAudio.instances[0];
    if (!audio) throw new Error("no audio element");
    // The first call primes the element with silence inside the user's tap (iOS unlock).
    expect(audio.plays[0]?.startsWith("data:audio/wav;base64,")).toBe(true);
    await vi.waitFor(() => expect(audio.clipPlays()).toHaveLength(1));
    expect(audio.playbackRate).toBe(1.2);
    expect(audio.defaultPlaybackRate).toBe(1.2);
    expect(audio.preservesPitch).toBe(true);
    audio.emit("playing");
    audio.emit("playing");
    audio.playToEnd();
    audio.playToEnd();
    expect(events).toEqual(["start", "end"]);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(audio.listenerCount()).toBe(0);
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("cancel pauses and fires onEnd once, before or during playback", async () => {
    const { mod } = await ready();
    const a = track();
    const cancelEarly = mod.speakNeural("Early.", "a1-asteria", a.opts);
    cancelEarly();
    cancelEarly();
    expect(a.events).toEqual(["end"]);

    const b = track();
    const cancel = mod.speakNeural("Later.", "a1-asteria", b.opts);
    const audio = FakeAudio.instances[0];
    if (!audio) throw new Error("no audio element");
    await vi.waitFor(() => expect(audio.clipPlays()).toHaveLength(1));
    audio.emit("playing");
    cancel();
    audio.playToEnd();
    expect(b.events).toEqual(["start", "end"]);
    expect(audio.paused).toBe(true);
    expect(a.events).toEqual(["end"]);
  });

  it("a new call ends the previous one (no error)", async () => {
    const { mod } = await ready();
    const a = track();
    const b = track();
    mod.speakNeural("First.", "a1-asteria", a.opts);
    const audio = FakeAudio.instances[0];
    if (!audio) throw new Error("no audio element");
    await vi.waitFor(() => expect(audio.clipPlays()).toHaveLength(1));
    audio.emit("playing");
    mod.speakNeural("Second.", "a1-asteria", b.opts);
    expect(a.events).toEqual(["start", "end"]);
    await vi.waitFor(() => expect(audio.clipPlays()).toHaveLength(2));
    audio.emit("playing");
    audio.playToEnd();
    expect(b.events).toEqual(["start", "end"]);
    expect(a.events).toEqual(["start", "end"]);
  });

  it("reports fetch and playback failures with onError, then onEnd once", async () => {
    const failing = await load(async () => json({ error: "rate-limit" }, 429));
    const a = track();
    failing.mod.speakNeural("Hi.", "a1-luna", a.opts);
    await vi.waitFor(() => expect(a.events).toEqual(["error:rate-limit", "end"]));

    const { mod } = await ready();
    FakeAudio.blockPlay = true;
    const b = track();
    mod.speakNeural("Hi.", "a1-luna", b.opts);
    await vi.waitFor(() => expect(b.events).toEqual(["error:playback", "end"]));

    FakeAudio.blockPlay = false;
    const c = track();
    mod.speakNeural("Broken clip.", "a1-luna", c.opts);
    const audio = FakeAudio.instances[0];
    if (!audio) throw new Error("no audio element");
    await vi.waitFor(() => expect(audio.clipPlays().length).toBeGreaterThan(1));
    audio.emit("error"); // stale: no MediaError on the element
    expect(c.events).toEqual([]);
    audio.error = { code: 4 };
    audio.emit("error");
    audio.emit("error");
    expect(c.events).toEqual(["error:playback", "end"]);
  });

  it("ignores a stale pause left over from the previous source", async () => {
    const { mod } = await ready();
    const a = track();
    mod.speakNeural("Hello.", "a1-luna", a.opts);
    const audio = FakeAudio.instances[0];
    if (!audio) throw new Error("no audio element");
    await vi.waitFor(() => expect(audio.clipPlays()).toHaveLength(1));
    audio.emit("playing");
    audio.emit("pause"); // element is still playing
    expect(a.events).toEqual(["start"]);
    audio.playToEnd();
    expect(a.events).toEqual(["start", "end"]);
  });

  it("stopNeural ends the clip that is playing", async () => {
    const { mod } = await ready();
    const a = track();
    mod.speakNeural("Hello.", "a1-luna", a.opts);
    mod.stopNeural();
    mod.stopNeural();
    expect(a.events).toEqual(["end"]);
  });
});
