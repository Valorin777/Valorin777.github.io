import { describe, expect, it } from "vitest";
import { MemoryKv } from "./fakes";
import { kvGetBytes, kvGetJson, kvPut } from "./kv";

describe("kv helpers", () => {
  it("stores bytes (exactly the view, not its whole buffer) and JSON with a TTL", async () => {
    const kv = new MemoryKv();
    const big = new Uint8Array([9, 1, 2, 3, 9]);
    await kvPut(kv, "tts:a", big.subarray(1, 4));
    expect(await kvGetBytes(kv, "tts:a")).toEqual(new Uint8Array([1, 2, 3]));
    expect(kv.store.get("tts:a")?.ttl).toBeUndefined();
    await kvPut(kv, "tr:a", JSON.stringify({ x: 1 }), 60);
    expect(await kvGetJson(kv, "tr:a")).toEqual({ x: 1 });
    expect(kv.store.get("tr:a")?.ttl).toBe(60);
  });

  it("treats a missing binding, a miss, bad JSON and a broken store as a miss", async () => {
    expect(await kvGetBytes(undefined, "k")).toBeNull();
    await expect(kvPut(undefined, "k", "v")).resolves.toBeUndefined();
    const kv = new MemoryKv();
    expect(await kvGetJson(kv, "nope")).toBeNull();
    await kv.put("bad", "{oops");
    expect(await kvGetJson(kv, "bad")).toBeNull();
    kv.broken = true;
    expect(await kvGetBytes(kv, "tts:a")).toBeNull();
    await expect(kvPut(kv, "k", "v")).resolves.toBeUndefined();
  });
});
