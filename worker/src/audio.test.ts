import { describe, expect, it } from "vitest";
import { audioBytes, base64ToBytes, bytesToBase64, sniffAudioType } from "./audio";
import { fakeMp3, streamOf } from "./fakes";

const MP3 = fakeMp3("hello");

describe("base64", () => {
  it("round-trips bytes, including large buffers", () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
    expect(bytesToBase64(new TextEncoder().encode("abc"))).toBe("YWJj");
  });

  it("accepts data URLs and whitespace, rejects non-base64", () => {
    expect(base64ToBytes("data:audio/mpeg;base64,YW\nJj")).toEqual(new TextEncoder().encode("abc"));
    expect(base64ToBytes("not base64!")).toBeNull();
    expect(base64ToBytes("")).toBeNull();
  });
});

describe("audioBytes", () => {
  it("reads every shape a Workers AI audio model returns", async () => {
    const b64 = bytesToBase64(MP3);
    expect(await audioBytes(MP3)).toEqual(MP3);
    expect(await audioBytes(MP3.slice().buffer)).toEqual(MP3);
    expect(await audioBytes(new DataView(MP3.slice().buffer))).toEqual(MP3);
    expect(await audioBytes(streamOf(MP3))).toEqual(MP3);
    expect(await audioBytes(new Response(MP3))).toEqual(MP3);
    expect(await audioBytes({ audio: b64 })).toEqual(MP3);
    expect(await audioBytes(b64)).toEqual(MP3);
  });

  it("returns null for empty, unknown or oversized output", async () => {
    expect(await audioBytes(new Uint8Array(0))).toBeNull();
    expect(await audioBytes({ audio: 42 })).toBeNull();
    expect(await audioBytes(null)).toBeNull();
    expect(await audioBytes(streamOf(new Uint8Array(64)), 32)).toBeNull();
  });
});

describe("sniffAudioType", () => {
  it("recognizes mp3 (ID3 or frame sync), wav and ogg, and nothing else", () => {
    expect(sniffAudioType(MP3)).toBe("audio/mpeg");
    expect(sniffAudioType(new Uint8Array([0xff, 0xf3, 0x44, 0xc4]))).toBe("audio/mpeg");
    expect(sniffAudioType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WAVEfmt "))).toBe("audio/wav");
    expect(sniffAudioType(new TextEncoder().encode("OggS\u0000"))).toBe("audio/ogg");
    expect(sniffAudioType(new TextEncoder().encode('{"error":"x"}'))).toBeNull();
  });
});
