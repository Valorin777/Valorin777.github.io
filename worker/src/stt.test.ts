import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base64ToBytes } from "./audio";
import { FakeAi, fakeMp3 } from "./fakes";
import { cleanTranscript, sttContentType, transcribe, WHISPER, WHISPER_TURBO } from "./stt";

const AUDIO = fakeMp3("speech");

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("sttContentType", () => {
  it("accepts the recorder formats with parameters and nothing else", () => {
    expect(sttContentType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(sttContentType("Audio/MP4")).toBe("audio/mp4");
    for (const type of ["audio/ogg", "audio/mpeg", "audio/wav"]) expect(sttContentType(type)).toBe(type);
    expect(sttContentType("application/json")).toBeNull();
    expect(sttContentType(null)).toBeNull();
  });
});

describe("cleanTranscript", () => {
  it("trims, flattens and drops Whisper's silence hallucinations", () => {
    expect(cleanTranscript("  I have  already\n finished. ")).toBe("I have already finished.");
    expect(cleanTranscript(" Thank you. ")).toBe("");
    expect(cleanTranscript("Продолжение следует...")).toBe("");
    expect(cleanTranscript("Thank you for the help with my homework")).toBe("Thank you for the help with my homework");
  });
});

describe("transcribe", () => {
  it("sends base64 audio + language to whisper-large-v3-turbo", async () => {
    const ai = new FakeAi({ [WHISPER_TURBO]: () => ({ text: " I'll catch up with you later. ", word_count: 6 }) });
    expect(await transcribe(ai, AUDIO, "ru")).toEqual({ text: "I'll catch up with you later.", model: WHISPER_TURBO });
    const input = ai.calls[0]?.input as { audio: string; language: string; task: string };
    expect(base64ToBytes(input.audio)).toEqual(AUDIO);
    expect(input).toMatchObject({ language: "ru", task: "transcribe" });
  });

  it("falls back to classic whisper with a byte array", async () => {
    const ai = new FakeAi({ [WHISPER]: () => ({ text: "hello" }) });
    expect(await transcribe(ai, AUDIO, "en")).toEqual({ text: "hello", model: WHISPER });
    expect(ai.models()).toEqual([WHISPER_TURBO, WHISPER]);
    expect(ai.calls[1]?.input).toEqual({ audio: Array.from(AUDIO) });
  });

  it("returns empty text for silence and throws when both models fail", async () => {
    const silent = new FakeAi({ [WHISPER_TURBO]: () => ({ text: "" }) });
    expect(await transcribe(silent, AUDIO, "en")).toEqual({ text: "", model: WHISPER_TURBO });
    const broken = new FakeAi({ [WHISPER_TURBO]: () => ({ nope: 1 }), [WHISPER]: () => ({}) });
    await expect(transcribe(broken, AUDIO, "en")).rejects.toMatchObject({ name: "UpstreamError" });
  });
});
