import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { CacheLike, Deps, Env, FetchInit, FetchLike, RateLimiter } from "./env";
import { handleRequest } from "./handler";
import worker from "./index";
import { OPENROUTER_URL } from "./openrouter";

const ORIGIN = "https://valorin777.github.io";
const DEVICE = "3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f";
const IP = "203.0.113.7";
const KEY = "sk-or-test-secret";
const BASE = "https://b2-sprint-ai.example.workers.dev";

const explainBody = {
  exerciseId: "d1-be-03",
  task: "Yesterday the meeting ___ at nine.",
  given: "is started",
  right: "started",
  rule: "Past simple: no be before the verb",
  category: "be-verb",
  lang: "en",
};

const coachBody = {
  history: [
    { role: "assistant", text: "Hi! What did you do at the weekend?" },
    { role: "user", text: "yesterday i am went to the park with my friends" },
  ],
  scenario: "Weekend small talk",
  focus: ["extra be"],
  level: "B1",
};

class MemoryCache implements CacheLike {
  readonly store = new Map<string, string>();

  async match(request: Request): Promise<Response | undefined> {
    const body = this.store.get(request.url);
    return body === undefined ? undefined : new Response(body);
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, await response.text());
  }
}

class FakeLimiter implements RateLimiter {
  readonly keys: string[] = [];
  constructor(private readonly blocked: (key: string) => boolean = () => false) {}

  async limit(options: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(options.key);
    return { success: !this.blocked(options.key) };
  }
}

function modelAnswer(content: string): Response {
  return new Response(JSON.stringify({ id: "gen-1", choices: [{ message: { role: "assistant", content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

interface Harness {
  env: Env;
  deps: Deps;
  fetchMock: MockInstance<FetchLike>;
  cache: MemoryCache;
  limiter: FakeLimiter;
  settle: () => Promise<void>;
}

function harness(answer: () => Response | Promise<Response> = () => modelAnswer("Ok"), limiter = new FakeLimiter()): Harness {
  const fetchMock = vi.fn<FetchLike>(async () => answer());
  const cache = new MemoryCache();
  const pending: Promise<unknown>[] = [];
  const env: Env = {
    OPENROUTER_API_KEY: KEY,
    ALLOWED_ORIGINS: "https://valorin777.github.io,http://localhost:3000,http://127.0.0.1:3000",
    MODEL: "anthropic/claude-haiku-5.5",
    LIMITER: limiter,
  };
  const deps: Deps = {
    fetch: fetchMock,
    cache,
    waitUntil: (promise) => {
      pending.push(promise);
    },
    upstreamTimeoutMs: 50,
  };
  return {
    env,
    deps,
    fetchMock,
    cache,
    limiter,
    settle: async () => {
      await Promise.all(pending);
    },
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      "X-Device-Id": DEVICE,
      "CF-Connecting-IP": IP,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function upstreamBody(h: Harness, call = 0): Record<string, unknown> {
  const args = h.fetchMock.mock.calls[call] as [string, FetchInit];
  return JSON.parse(args[1].body) as Record<string, unknown>;
}

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routing and CORS", () => {
  it("answers /health with the model", async () => {
    const h = harness();
    const res = await handleRequest(new Request(`${BASE}/health`, { headers: { Origin: ORIGIN } }), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, model: "anthropic/claude-haiku-5.5" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it("answers an allowed preflight and refuses others", async () => {
    const h = harness();
    const ok = await handleRequest(
      new Request(`${BASE}/coach`, { method: "OPTIONS", headers: { Origin: "http://localhost:3000" } }),
      h.env,
      h.deps,
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(ok.headers.get("Access-Control-Allow-Headers")).toContain("X-Device-Id");
    expect(ok.headers.get("Access-Control-Max-Age")).toBe("86400");
    const bad = await handleRequest(
      new Request(`${BASE}/coach`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } }),
      h.env,
      h.deps,
    );
    expect(bad.status).toBe(403);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects POSTs from other or missing origins before doing any work", async () => {
    const h = harness();
    const evil = await handleRequest(post("/explain", explainBody, { Origin: "https://evil.example" }), h.env, h.deps);
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ error: "forbidden" });
    const bare = post("/explain", explainBody);
    bare.headers.delete("Origin");
    expect((await handleRequest(bare, h.env, h.deps)).status).toBe(403);
    expect(h.fetchMock).not.toHaveBeenCalled();
    expect(h.limiter.keys).toEqual([]);
  });

  it("returns 404 for unknown paths and 405 for wrong methods", async () => {
    const h = harness();
    expect((await handleRequest(new Request(`${BASE}/nope`), h.env, h.deps)).status).toBe(404);
    const get = await handleRequest(new Request(`${BASE}/explain`, { headers: { Origin: ORIGIN } }), h.env, h.deps);
    expect(get.status).toBe(405);
  });
});

describe("guards", () => {
  it("requires a UUID-like X-Device-Id", async () => {
    const h = harness();
    const missing = post("/explain", explainBody);
    missing.headers.delete("X-Device-Id");
    expect((await handleRequest(missing, h.env, h.deps)).status).toBe(400);
    const odd = await handleRequest(post("/explain", explainBody, { "X-Device-Id": "x y" }), h.env, h.deps);
    expect(odd.status).toBe(400);
    expect(await odd.json()).toEqual({ error: "invalid" });
  });

  it("rate-limits per device+IP and per IP", async () => {
    const perDevice = harness(undefined, new FakeLimiter((key) => key === `${DEVICE}:${IP}`));
    const res = await handleRequest(post("/explain", explainBody), perDevice.env, perDevice.deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate-limit" });
    expect(perDevice.limiter.keys.sort()).toEqual([`${DEVICE}:${IP}`, `ip:${IP}`].sort());
    expect(perDevice.fetchMock).not.toHaveBeenCalled();

    const perIp = harness(undefined, new FakeLimiter((key) => key.startsWith("ip:")));
    expect((await handleRequest(post("/coach", coachBody), perIp.env, perIp.deps)).status).toBe(429);
  });

  it("fails closed when the limiter is missing or throws", async () => {
    const h = harness();
    const noLimiter = await handleRequest(post("/explain", explainBody), { ...h.env, LIMITER: undefined }, h.deps);
    expect(noLimiter.status).toBe(503);
    const throwing: RateLimiter = {
      limit: async () => {
        throw new Error("down");
      },
    };
    const broken = await handleRequest(post("/explain", explainBody), { ...h.env, LIMITER: throwing }, h.deps);
    expect(broken.status).toBe(429);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it("caps the body at 8 KB by header and by actual size", async () => {
    const h = harness();
    const declared = await handleRequest(post("/explain", explainBody, { "Content-Length": "9000" }), h.env, h.deps);
    expect(declared.status).toBe(413);
    const big = JSON.stringify({ ...explainBody, task: "x".repeat(9000) });
    const actual = await handleRequest(post("/explain", big), h.env, h.deps);
    expect(actual.status).toBe(413);
    expect(await actual.json()).toEqual({ error: "too-large" });
    expect(h.fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid for bad JSON and schema violations", async () => {
    const h = harness();
    for (const body of ["{not json", { ...explainBody, extra: true }, { ...explainBody, given: "x".repeat(201) }]) {
      const res = await handleRequest(post("/explain", body), h.env, h.deps);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid" });
    }
    const coach = await handleRequest(
      post("/coach", { ...coachBody, history: [...coachBody.history, { role: "assistant", text: "Hm?" }] }),
      h.env,
      h.deps,
    );
    expect(coach.status).toBe(400);
    expect(h.fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /explain", () => {
  it("calls OpenRouter once and serves repeats from the cache", async () => {
    const h = harness(() => modelAnswer("Here the verb is past simple, so there is no **be**: just **started**."));
    const first = await handleRequest(post("/explain", explainBody), h.env, h.deps);
    expect(first.status).toBe(200);
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(await first.json()).toEqual({
      text: "Here the verb is past simple, so there is no **be**: just **started**.",
      cached: false,
    });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    expect(h.fetchMock.mock.calls[0]?.[0]).toBe(OPENROUTER_URL);
    const sent = upstreamBody(h);
    expect(sent).toMatchObject({ model: "anthropic/claude-haiku-5.5", max_tokens: 140 });
    expect(sent.response_format).toBeUndefined();
    const sentMessages = sent.messages as Array<{ role: string; content: string }>;
    expect(sentMessages[0]?.content).toContain("At most 35 words");
    expect(sentMessages[1]?.content).toContain('"is started"');

    await h.settle();
    const again = await handleRequest(post("/explain", { ...explainBody, given: "Is  started." }), h.env, h.deps);
    expect(await again.json()).toEqual({
      text: "Here the verb is past simple, so there is no **be**: just **started**.",
      cached: true,
    });
    expect(h.fetchMock).toHaveBeenCalledTimes(1);

    const russian = await handleRequest(post("/explain", { ...explainBody, lang: "ru" }), h.env, h.deps);
    expect(await russian.json()).toMatchObject({ cached: false });
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends temperature 0.4 to models that accept it", async () => {
    const h = harness(() => modelAnswer("Fine."));
    await handleRequest(post("/explain", explainBody), { ...h.env, MODEL: "openai/gpt-x-mini" }, h.deps);
    expect(upstreamBody(h).temperature).toBe(0.4);
  });

  it("maps upstream failures to 502 without leaking details", async () => {
    const h = harness(() => new Response('{"error":{"message":"Insufficient credits for key sk-or-..."}}', { status: 402 }));
    const res = await handleRequest(post("/explain", explainBody), h.env, h.deps);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "upstream" });
    expect(text).not.toContain("credits");
    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("is started");
    expect(logged).not.toContain("Yesterday the meeting");
  });

  it("maps a missing key and a timeout to 502", async () => {
    const h = harness();
    const noKey = await handleRequest(post("/explain", explainBody), { ...h.env, OPENROUTER_API_KEY: "" }, h.deps);
    expect(noKey.status).toBe(502);

    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("abort"))));
    const slow = harness();
    const res = await handleRequest(post("/explain", explainBody), slow.env, { ...slow.deps, fetch: hang });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream" });
  });
});

describe("POST /coach", () => {
  it("returns the reply and a correction that matches what the learner said", async () => {
    const h = harness(() =>
      modelAnswer(
        JSON.stringify({
          reply: "The park sounds lovely! Who did you go with?",
          correction: { wrong: "i am went", right: "I went", why: "Past simple needs no 'am'." },
        }),
      ),
    );
    const res = await handleRequest(post("/coach", coachBody), h.env, h.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reply: "The park sounds lovely! Who did you go with?",
      correction: { wrong: "i am went", right: "I went", why: "Past simple needs no 'am'." },
      ended: false,
    });
    const sent = upstreamBody(h);
    expect(sent).toMatchObject({ max_tokens: 220, response_format: { type: "json_object" } });
    const roles = (sent.messages as Array<{ role: string }>).map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
  });

  it("drops a correction of words the learner never said", async () => {
    const h = harness(() =>
      modelAnswer('{"reply":"Nice! What did you eat?","correction":{"wrong":"I have gone","right":"I went","why":"x"}}'),
    );
    const res = await handleRequest(post("/coach", coachBody), h.env, h.deps);
    expect(await res.json()).toMatchObject({ correction: null });
  });

  it("parses fenced JSON and falls back to plain text", async () => {
    const fenced = harness(() => modelAnswer('```json\n{"reply":"Great! Why?","correction":null}\n```'));
    expect(await (await handleRequest(post("/coach", coachBody), fenced.env, fenced.deps)).json()).toEqual({
      reply: "Great! Why?",
      correction: null,
      ended: false,
    });
    const plain = harness(() => modelAnswer("That sounds fun! What was the best part?"));
    expect(await (await handleRequest(post("/coach", coachBody), plain.env, plain.deps)).json()).toEqual({
      reply: "That sounds fun! What was the best part?",
      correction: null,
      ended: false,
    });
  });

  it("ends the session at 16 turns and tells the model to wrap up", async () => {
    const h = harness(() => modelAnswer('{"reply":"Great talk today, the session is complete!","correction":null}'));
    const history = Array.from({ length: 16 }, (_, i) => ({
      role: i % 2 === 0 ? "assistant" : "user",
      text: i % 2 === 0 ? "And then?" : "then we played football",
    }));
    const res = await handleRequest(post("/coach", { ...coachBody, history }), h.env, h.deps);
    expect(await res.json()).toMatchObject({ ended: true });
    const system = (upstreamBody(h).messages as Array<{ content: string }>)[0]?.content ?? "";
    expect(system).toContain("LAST turn of the session");
  });

  it("maps an unusable model answer to 502", async () => {
    const h = harness(() => modelAnswer('{"oops":true}'));
    const res = await handleRequest(post("/coach", coachBody), h.env, h.deps);
    expect(res.status).toBe(502);
  });
});

describe("worker entry", () => {
  it("wires the global fetch and ctx.waitUntil", async () => {
    const global = vi.spyOn(globalThis, "fetch").mockImplementation(async () => modelAnswer("Short and kind."));
    const waitUntil = vi.fn();
    const env: Env = {
      OPENROUTER_API_KEY: KEY,
      ALLOWED_ORIGINS: ORIGIN,
      LIMITER: new FakeLimiter(),
    };
    const res = await worker.fetch(post("/explain", explainBody), env, { waitUntil });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Short and kind.", cached: false });
    expect(global).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
