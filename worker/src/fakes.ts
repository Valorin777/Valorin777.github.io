// Test doubles shared by the *.test.ts files (no network, no Workers runtime).
import type { AiBinding, KvLike, RateLimiter } from "./env";

export type AiHandler = (input: unknown) => unknown;

/** Answers per model; a model without a handler fails like Workers AI does. */
export class FakeAi implements AiBinding {
  readonly calls: Array<{ model: string; input: unknown }> = [];
  constructor(private readonly handlers: Record<string, AiHandler> = {}) {}

  async run(model: string, input: unknown): Promise<unknown> {
    this.calls.push({ model, input });
    const handler = this.handlers[model];
    if (!handler) throw new Error("4006: you have used up your daily free allocation of 10,000 neurons");
    return handler(input);
  }

  models(): string[] {
    return this.calls.map((call) => call.model);
  }
}

export class MemoryKv implements KvLike {
  readonly store = new Map<string, { value: string | ArrayBuffer; ttl: number | undefined }>();
  broken = false;

  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  async get(key: string, type: "text" | "arrayBuffer"): Promise<string | ArrayBuffer | null> {
    if (this.broken) throw new Error("kv down");
    const entry = this.store.get(key);
    if (!entry) return null;
    if (type === "text") return typeof entry.value === "string" ? entry.value : new TextDecoder().decode(entry.value);
    return typeof entry.value === "string" ? (new TextEncoder().encode(entry.value).buffer as ArrayBuffer) : entry.value;
  }

  async put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number }): Promise<void> {
    if (this.broken) throw new Error("kv down");
    this.store.set(key, { value, ttl: options?.expirationTtl });
  }

  keys(): string[] {
    return [...this.store.keys()];
  }
}

export class FakeLimiter implements RateLimiter {
  readonly keys: string[] = [];
  constructor(private readonly blocked: (key: string) => boolean = () => false) {}

  async limit(options: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(options.key);
    return { success: !this.blocked(options.key) };
  }
}

/** A tiny "MP3": an ID3 header followed by a tag, so different voices give different bytes. */
export function fakeMp3(tag: string): Uint8Array {
  return new TextEncoder().encode(`ID3\u0004\u0000\u0000${tag}`);
}

export function streamOf(bytes: Uint8Array, chunk = 4): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
}
