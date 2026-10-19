import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buzz } from "@/lib/haptics";
import { playCue } from "@/lib/sound";
import {
  clampRate,
  collectTranscripts,
  getSupport,
  listen,
  loadVoices,
  mapRecognitionError,
  pickVoice,
  plainText,
  rankVoices,
  speak,
  stopSpeaking,
  type RecognitionError,
  type RecognitionResultListLike,
  type VoiceLike,
} from "@/lib/speech";

function v(name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike {
  return { name, lang, voiceURI: name, localService: true, default: false, ...extra };
}

function apple(name: string, lang: string, uri: string, extra: Partial<VoiceLike> = {}): VoiceLike {
  return v(name, lang, { voiceURI: uri, ...extra });
}

const NOVELTY = new Set([
  "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Good News", "Jester", "Organ",
  "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox", "Fred", "Junior", "Ralph", "Kathy",
]);

function isNoveltyOrEloquence(voice: VoiceLike): boolean {
  return NOVELTY.has(voice.name) || voice.voiceURI.includes("eloquence");
}

const MACOS_SAFARI: VoiceLike[] = [
  apple("Albert", "en-US", "com.apple.speech.synthesis.voice.Albert"),
  apple("Anna", "de-DE", "com.apple.voice.compact.de-DE.Anna"),
  apple("Bad News", "en-US", "com.apple.speech.synthesis.voice.BadNews"),
  apple("Bahh", "en-US", "com.apple.speech.synthesis.voice.Bahh"),
  apple("Bells", "en-US", "com.apple.speech.synthesis.voice.Bells"),
  apple("Boing", "en-US", "com.apple.speech.synthesis.voice.Boing"),
  apple("Bubbles", "en-US", "com.apple.speech.synthesis.voice.Bubbles"),
  apple("Cellos", "en-US", "com.apple.speech.synthesis.voice.Cellos"),
  apple("Daniel", "en-GB", "com.apple.voice.compact.en-GB.Daniel"),
  apple("Eddy (English (UK))", "en-GB", "com.apple.eloquence.en-GB.Eddy"),
  apple("Eddy (English (US))", "en-US", "com.apple.eloquence.en-US.Eddy"),
  apple("Flo (English (UK))", "en-GB", "com.apple.eloquence.en-GB.Flo"),
  apple("Fred", "en-US", "com.apple.speech.synthesis.voice.Fred"),
  apple("Good News", "en-US", "com.apple.speech.synthesis.voice.GoodNews"),
  apple("Grandma (English (US))", "en-US", "com.apple.eloquence.en-US.Grandma"),
  apple("Grandpa (English (UK))", "en-GB", "com.apple.eloquence.en-GB.Grandpa"),
  apple("Jester", "en-US", "com.apple.speech.synthesis.voice.Hysterical"),
  apple("Junior", "en-US", "com.apple.speech.synthesis.voice.Junior"),
  apple("Karen", "en-AU", "com.apple.voice.compact.en-AU.Karen"),
  apple("Kathy", "en-US", "com.apple.speech.synthesis.voice.Kathy"),
  apple("Milena", "ru-RU", "com.apple.voice.compact.ru-RU.Milena", { default: true }),
  apple("Moira", "en-IE", "com.apple.voice.compact.en-IE.Moira"),
  apple("Organ", "en-US", "com.apple.speech.synthesis.voice.Organ"),
  apple("Ralph", "en-US", "com.apple.speech.synthesis.voice.Ralph"),
  apple("Reed (English (UK))", "en-GB", "com.apple.eloquence.en-GB.Reed"),
  apple("Rishi", "en-IN", "com.apple.voice.compact.en-IN.Rishi"),
  apple("Rocko (English (US))", "en-US", "com.apple.eloquence.en-US.Rocko"),
  apple("Samantha", "en-US", "com.apple.voice.compact.en-US.Samantha"),
  apple("Samantha (Enhanced)", "en-US", "com.apple.voice.enhanced.en-US.Samantha"),
  apple("Sandy (English (UK))", "en-GB", "com.apple.eloquence.en-GB.Sandy"),
  apple("Shelley (English (US))", "en-US", "com.apple.eloquence.en-US.Shelley"),
  apple("Superstar", "en-US", "com.apple.speech.synthesis.voice.Princess"),
  apple("Tessa", "en-ZA", "com.apple.voice.compact.en-ZA.Tessa"),
  apple("Thomas", "fr-FR", "com.apple.voice.compact.fr-FR.Thomas"),
  apple("Trinoids", "en-US", "com.apple.speech.synthesis.voice.Trinoids"),
  apple("Whisper", "en-US", "com.apple.speech.synthesis.voice.Whisper"),
  apple("Wobble", "en-US", "com.apple.speech.synthesis.voice.Deranged"),
  apple("Zarvox", "en-US", "com.apple.speech.synthesis.voice.Zarvox"),
  apple("Zoe (Premium)", "en-US", "com.apple.voice.premium.en-US.Zoe"),
];

const CHROME_WINDOWS: VoiceLike[] = [
  v("Microsoft David - English (United States)", "en-US", { default: true }),
  v("Microsoft Irina - Russian (Russia)", "ru-RU"),
  v("Microsoft Mark - English (United States)", "en-US"),
  v("Microsoft Zira - English (United States)", "en-US"),
  v("Google Deutsch", "de-DE", { localService: false }),
  v("Google US English", "en-US", { localService: false }),
  v("Google UK English Female", "en-GB", { localService: false }),
  v("Google UK English Male", "en-GB", { localService: false }),
  v("Google español", "es-ES", { localService: false }),
  v("Google русский", "ru-RU", { localService: false }),
  v("Google 日本語", "ja-JP", { localService: false }),
];

const CHROME_MAC: VoiceLike[] = [
  v("Albert", "en-US"),
  v("Bad News", "en-US"),
  v("Eddy (English (United States))", "en-US"),
  v("Fred", "en-US"),
  v("Karen", "en-AU"),
  v("Milena", "ru-RU", { default: true }),
  v("Samantha", "en-US"),
  v("Daniel", "en-GB"),
  v("Zarvox", "en-US"),
  v("Google US English", "en-US", { localService: false }),
  v("Google UK English Female", "en-GB", { localService: false }),
  v("Google русский", "ru-RU", { localService: false }),
];

const ANDROID_CHROME: VoiceLike[] = [
  v("Русский Россия", "ru-RU", { default: true }),
  v("English India", "en-IN"),
  v("English Australia", "en-AU"),
  v("English United States", "en-US"),
  v("English United Kingdom", "en_GB"),
  v("Español Estados Unidos", "es-US"),
  v("English Nigeria", "en-NG"),
];

const EDGE_WINDOWS: VoiceLike[] = [
  v("Microsoft David - English (United States)", "en-US", { default: true }),
  v("Microsoft Mark - English (United States)", "en-US"),
  v("Microsoft Zira - English (United States)", "en-US"),
  v("Microsoft AndrewMultilingual Online (Natural) - English (United States)", "en-US", { localService: false }),
  v("Microsoft Aria Online (Natural) - English (United States)", "en-US", { localService: false }),
  v("Microsoft Natasha Online (Natural) - English (Australia)", "en-AU", { localService: false }),
  v("Microsoft Neerja Online (Natural) - English (India)", "en-IN", { localService: false }),
  v("Microsoft Libby Online (Natural) - English (United Kingdom)", "en-GB", { localService: false }),
  v("Microsoft Sonia Online (Natural) - English (United Kingdom)", "en-GB", { localService: false }),
  v("Microsoft Svetlana Online (Natural) - Russian (Russia)", "ru-RU", { localService: false }),
  v("Microsoft Dmitry Online (Natural) - Russian (Russia)", "ru-RU", { localService: false }),
];

const IOS_SAFARI: VoiceLike[] = [
  apple("Milena", "ru-RU", "com.apple.voice.compact.ru-RU.Milena", { default: true }),
  apple("Fred", "en-US", "com.apple.speech.synthesis.voice.Fred"),
  apple("Shelley (English (US))", "en-US", "com.apple.eloquence.en-US.Shelley"),
  apple("Rishi", "en-IN", "com.apple.voice.compact.en-IN.Rishi"),
  apple("Samantha", "en-US", "com.apple.voice.compact.en-US.Samantha"),
  apple("Aaron", "en-US", "com.apple.ttsbundle.siri_Aaron_en-US_compact"),
  apple("Martha", "en-GB", "com.apple.ttsbundle.siri_Martha_en-GB_compact"),
  apple("Daniel", "en-GB", "com.apple.voice.compact.en-GB.Daniel"),
];

const names = (voices: VoiceLike[]): string[] => voices.map((x) => x.name);

describe("rankVoices", () => {
  it("drops non-English voices on every platform", () => {
    for (const list of [MACOS_SAFARI, CHROME_WINDOWS, CHROME_MAC, ANDROID_CHROME, EDGE_WINDOWS, IOS_SAFARI]) {
      for (const voice of rankVoices(list)) expect(voice.lang.replace("_", "-").toLowerCase()).toMatch(/^en-/);
    }
    expect(names(rankVoices(ANDROID_CHROME))).not.toContain("Español Estados Unidos");
  });

  it("macOS Safari: premium, then enhanced, then quality Apple voices; novelty and Eloquence last", () => {
    const ranked = rankVoices(MACOS_SAFARI);
    expect(names(ranked).slice(0, 4)).toEqual(["Zoe (Premium)", "Samantha (Enhanced)", "Daniel", "Samantha"]);
    expect(names(ranked).slice(4, 8)).toEqual(["Karen", "Moira", "Rishi", "Tessa"]);
    const firstNovelty = ranked.findIndex(isNoveltyOrEloquence);
    expect(firstNovelty).toBe(8);
    expect(ranked.slice(firstNovelty).every(isNoveltyOrEloquence)).toBe(true);
    expect(ranked).toHaveLength(MACOS_SAFARI.filter((x) => x.lang.startsWith("en")).length);
  });

  it("Chrome on Windows: Google voices before the old SAPI voices, en-GB/en-US only", () => {
    const ranked = names(rankVoices(CHROME_WINDOWS));
    expect(ranked).toEqual([
      "Google UK English Female",
      "Google UK English Male",
      "Google US English",
      "Microsoft David - English (United States)",
      "Microsoft Mark - English (United States)",
      "Microsoft Zira - English (United States)",
    ]);
  });

  it("Chrome on macOS: Google, then Apple quality voices, novelty at the end", () => {
    const ranked = names(rankVoices(CHROME_MAC));
    expect(ranked.slice(0, 5)).toEqual(["Google UK English Female", "Google US English", "Daniel", "Samantha", "Karen"]);
    expect(ranked.slice(5).sort()).toEqual(["Albert", "Bad News", "Eddy (English (United States))", "Fred", "Zarvox"]);
  });

  it("Android Chrome: handles en_GB, prefers UK/US over other English regions", () => {
    expect(names(rankVoices(ANDROID_CHROME))).toEqual([
      "English United Kingdom",
      "English United States",
      "English India",
      "English Australia",
      "English Nigeria",
    ]);
  });

  it("Edge: natural voices first (UK, US, then other regions), local voices after", () => {
    expect(names(rankVoices(EDGE_WINDOWS))).toEqual([
      "Microsoft Libby Online (Natural) - English (United Kingdom)",
      "Microsoft Sonia Online (Natural) - English (United Kingdom)",
      "Microsoft AndrewMultilingual Online (Natural) - English (United States)",
      "Microsoft Aria Online (Natural) - English (United States)",
      "Microsoft Natasha Online (Natural) - English (Australia)",
      "Microsoft Neerja Online (Natural) - English (India)",
      "Microsoft David - English (United States)",
      "Microsoft Mark - English (United States)",
      "Microsoft Zira - English (United States)",
    ]);
  });

  it("iOS Safari: Siri and quality voices before Eloquence and Fred", () => {
    const ranked = names(rankVoices(IOS_SAFARI));
    expect(ranked.slice(0, 4)).toEqual(["Martha", "Daniel", "Samantha", "Aaron"]);
    expect(ranked[4]).toBe("Rishi");
    expect(ranked.slice(5).sort()).toEqual(["Fred", "Shelley (English (US))"]);
  });

  it("Firefox moz-tts URIs: compact penalty and novelty still detected", () => {
    const ranked = names(
      rankVoices([
        apple("Albert", "en-US", "urn:moz-tts:osx:com.apple.speech.synthesis.voice.Albert"),
        apple("Samantha", "en-US", "urn:moz-tts:osx:com.apple.voice.compact.en-US.Samantha"),
        apple("Ava (Premium)", "en-US", "urn:moz-tts:osx:com.apple.voice.premium.en-US.Ava"),
      ]),
    );
    expect(ranked).toEqual(["Ava (Premium)", "Samantha", "Albert"]);
  });

  it("is pure and stable", () => {
    const input = [...CHROME_WINDOWS];
    const a = rankVoices(input);
    const b = rankVoices(input);
    expect(names(a)).toEqual(names(b));
    expect(input).toEqual(CHROME_WINDOWS);
    expect(rankVoices([])).toEqual([]);
  });
});

describe("pickVoice", () => {
  it("returns the requested voice by URI, else by name, else the best one", () => {
    expect(pickVoice(EDGE_WINDOWS, "Microsoft Aria Online (Natural) - English (United States)")?.name).toBe(
      "Microsoft Aria Online (Natural) - English (United States)",
    );
    expect(pickVoice(MACOS_SAFARI, "Daniel")?.voiceURI).toBe("com.apple.voice.compact.en-GB.Daniel");
    expect(pickVoice(MACOS_SAFARI, "gone-voice")?.name).toBe("Zoe (Premium)");
    expect(pickVoice(MACOS_SAFARI, null)?.name).toBe("Zoe (Premium)");
  });

  it("returns null when there is no English voice", () => {
    expect(pickVoice([], null)).toBeNull();
    expect(pickVoice([v("Milena", "ru-RU")], null)).toBeNull();
  });
});

describe("plainText", () => {
  it("unwraps bold markup", () => {
    expect(plainText("I **have been** waiting for **ages**.")).toBe("I have been waiting for ages.");
  });

  it("reads gaps as 'blank'", () => {
    expect(plainText("She ___ (start) the job yesterday.")).toBe("She blank (start) the job yesterday.");
    expect(plainText("If I ___ known, I ___ have come.")).toBe("If I blank known, I blank have come.");
    expect(plainText("**___**")).toBe("blank");
  });

  it("drops stray markers and squashes whitespace", () => {
    expect(plainText("  a **  b\n\n c  ")).toBe("a b c");
    expect(plainText("")).toBe("");
  });
});

describe("helpers", () => {
  it("clampRate keeps 0.6–1.2", () => {
    expect(clampRate(0.2)).toBe(0.6);
    expect(clampRate(2)).toBe(1.2);
    expect(clampRate(0.9)).toBe(0.9);
    expect(clampRate(Number.NaN)).toBe(1);
    expect(clampRate(undefined)).toBe(1);
  });

  it("maps recognition error codes", () => {
    const cases: [string, RecognitionError][] = [
      ["not-allowed", "not-allowed"],
      ["service-not-allowed", "not-allowed"],
      ["no-speech", "no-speech"],
      ["network", "network"],
      ["aborted", "aborted"],
      ["audio-capture", "other"],
      ["language-not-supported", "other"],
    ];
    for (const [code, expected] of cases) expect(mapRecognitionError(code)).toBe(expected);
  });

  it("collects interim and final transcripts with alternatives", () => {
    const result = (isFinal: boolean, ...alts: string[]) =>
      Object.assign(alts.map((transcript) => ({ transcript })), { isFinal });
    const list = (...results: ReturnType<typeof result>[]): RecognitionResultListLike => results;

    expect(collectTranscripts(list())).toEqual({ transcript: "", alternatives: [], isFinal: false });
    expect(collectTranscripts(list(result(false, "it has")))).toEqual({
      transcript: "it has",
      alternatives: ["it has"],
      isFinal: false,
    });
    expect(
      collectTranscripts(list(result(true, "it has started", "it is started", "it has started"))),
    ).toEqual({ transcript: "it has started", alternatives: ["it has started", "it is started"], isFinal: true });
    expect(collectTranscripts(list(result(true, "I have"), result(true, " known her", " know her")))).toEqual({
      transcript: "I have known her",
      alternatives: ["I have known her", "I have know her"],
      isFinal: true,
    });
  });
});

describe("SSR / unsupported environment (node)", () => {
  it("reports no support and never throws", async () => {
    expect(getSupport()).toEqual({ tts: false, recognition: false });
    await expect(loadVoices()).resolves.toEqual([]);
    expect(() => stopSpeaking()).not.toThrow();
    expect(() => playCue("correct")).not.toThrow();
    expect(() => buzz("close")).not.toThrow();
  });

  it("speak fires onError then onEnd exactly once", async () => {
    const events: string[] = [];
    const cancel = speak("Hello", {
      onStart: () => events.push("start"),
      onError: () => events.push("error"),
      onEnd: () => events.push("end"),
    });
    await new Promise((r) => setTimeout(r, 10));
    cancel();
    expect(events).toEqual(["error", "end"]);
  });

  it("cancelling before the deferred callback fires onEnd only", async () => {
    const events: string[] = [];
    const cancel = speak("Hello", { onError: () => events.push("error"), onEnd: () => events.push("end") });
    cancel();
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toEqual(["end"]);
  });

  it("listen reports unsupported, then ends once", async () => {
    const events: string[] = [];
    listen({
      onResult: () => events.push("result"),
      onError: (e) => events.push(`error:${e}`),
      onEnd: () => events.push("end"),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toEqual(["error:unsupported", "end"]);
  });
});

/* ------------------------------------------------- browser behaviour (mocked) */

class FakeUtterance {
  text: string;
  voice: VoiceLike | null = null;
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

class FakeSynth {
  speaking = false;
  pending = false;
  paused = false;
  /** Simulates iOS refusing to speak outside a user gesture: no events at all. */
  blocked = false;
  current: FakeUtterance | null = null;
  spoken: FakeUtterance[] = [];
  cancels = 0;
  voices: VoiceLike[] = [
    apple("Samantha", "en-US", "com.apple.voice.compact.en-US.Samantha"),
    apple("Daniel", "en-GB", "com.apple.voice.compact.en-GB.Daniel"),
    apple("Milena", "ru-RU", "com.apple.voice.compact.ru-RU.Milena", { default: true }),
  ];
  getVoices(): VoiceLike[] {
    return this.voices;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  speak(u: FakeUtterance): void {
    this.spoken.push(u);
    if (this.blocked) return;
    this.current = u;
    this.speaking = true;
    u.onstart?.();
  }
  cancel(): void {
    this.cancels += 1;
    const u = this.current;
    this.current = null;
    this.speaking = false;
    u?.onerror?.({ error: "interrupted" });
  }
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  end(): void {
    const u = this.current;
    this.current = null;
    this.speaking = false;
    u?.onend?.();
  }
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = false;
  maxAlternatives = 1;
  continuous = true;
  onresult: ((e: { results: RecognitionResultListLike }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  calls: string[] = [];
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start(): void {
    this.calls.push("start");
  }
  stop(): void {
    this.calls.push("stop");
  }
  abort(): void {
    this.calls.push("abort");
  }
  emit(...results: { isFinal: boolean; alts: string[] }[]): void {
    this.onresult?.({
      results: results.map((r) => Object.assign(r.alts.map((transcript) => ({ transcript })), { isFinal: r.isFinal })),
    });
  }
}

describe("with mocked Web Speech", () => {
  let synth: FakeSynth;

  beforeEach(() => {
    vi.useFakeTimers();
    synth = new FakeSynth();
    FakeRecognition.instances = [];
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: FakeUtterance,
      webkitSpeechRecognition: FakeRecognition,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("speaks plain text with the best voice and clamped rate; onEnd once", () => {
    expect(getSupport()).toEqual({ tts: true, recognition: true });
    const events: string[] = [];
    speak("I **have** ___ here", {
      rate: 3,
      onStart: () => events.push("start"),
      onEnd: () => events.push("end"),
      onError: () => events.push("error"),
    });
    const u = synth.spoken[0];
    expect(u?.text).toBe("I have blank here");
    expect(u?.voice?.name).toBe("Daniel");
    expect(u?.lang).toBe("en-GB");
    expect(u?.rate).toBe(1.2);
    synth.end();
    synth.end();
    vi.advanceTimersByTime(5000);
    expect(events).toEqual(["start", "end"]);
  });

  it("a new utterance ends the previous one (no error) and starts after a short gap", () => {
    const events: string[] = [];
    speak("one", { onEnd: () => events.push("end:1"), onError: () => events.push("error:1") });
    speak("two", { voiceURI: "com.apple.voice.compact.en-US.Samantha", onEnd: () => events.push("end:2") });
    expect(events).toEqual(["end:1"]);
    expect(synth.spoken).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1]?.voice?.name).toBe("Samantha");
    expect(synth.spoken[1]?.lang).toBe("en-US");
    synth.end();
    expect(events).toEqual(["end:1", "end:2"]);
  });

  it("cancel and stopSpeaking fire onEnd exactly once", () => {
    const events: string[] = [];
    const cancel = speak("hello", { onEnd: () => events.push("end"), onError: () => events.push("error") });
    cancel();
    cancel();
    stopSpeaking();
    expect(events).toEqual(["end"]);
    expect(synth.speaking).toBe(false);
  });

  it("ends by itself when the browser never starts speaking (blocked)", () => {
    synth.blocked = true;
    const events: string[] = [];
    speak("hello", { onEnd: () => events.push("end") });
    vi.advanceTimersByTime(2000);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(2000);
    expect(events).toEqual(["end"]);
  });

  it("listen: interim, then final alternatives, then end once; stops speech first", () => {
    speak("talking");
    const events: string[] = [];
    listen({
      onInterim: (t) => events.push(`interim:${t}`),
      onResult: (alts) => events.push(`result:${alts.join("|")}`),
      onError: (e) => events.push(`error:${e}`),
      onEnd: () => events.push("end"),
    });
    expect(synth.speaking).toBe(false);
    vi.advanceTimersByTime(200);
    const rec = FakeRecognition.instances[0];
    expect(rec?.lang).toBe("en-US");
    expect(rec?.interimResults).toBe(true);
    expect(rec?.maxAlternatives).toBe(3);
    expect(rec?.continuous).toBe(false);
    expect(rec?.calls).toEqual(["start"]);
    rec?.emit({ isFinal: false, alts: ["it has"] });
    rec?.emit({ isFinal: true, alts: ["it has started", "it is started"] });
    expect(rec?.calls).toContain("stop");
    rec?.onend?.();
    vi.advanceTimersByTime(5000);
    expect(events).toEqual([
      "interim:it has",
      "interim:it has started",
      "result:it has started|it is started",
      "end",
    ]);
  });

  it("listen: hearing nothing is no-speech; errors are mapped", () => {
    const a: string[] = [];
    listen({ onResult: () => a.push("result"), onError: (e) => a.push(e), onEnd: () => a.push("end") });
    FakeRecognition.instances[0]?.onend?.();
    expect(a).toEqual(["no-speech", "end"]);

    vi.advanceTimersByTime(300);
    const b: string[] = [];
    listen({ onResult: () => b.push("result"), onError: (e) => b.push(e), onEnd: () => b.push("end") });
    const rec = FakeRecognition.instances[1];
    rec?.onerror?.({ error: "service-not-allowed" });
    rec?.onend?.();
    expect(b).toEqual(["not-allowed", "end"]);
  });

  it("listen: graceful stop delivers the interim text when no final result comes", () => {
    const events: string[] = [];
    const stop = listen({ onResult: (alts) => events.push(alts[0] ?? ""), onEnd: () => events.push("end") });
    const rec = FakeRecognition.instances[0];
    rec?.emit({ isFinal: false, alts: ["I have known her"] });
    stop();
    expect(rec?.calls).toEqual(["start", "stop"]);
    vi.advanceTimersByTime(2000);
    expect(events).toEqual(["I have known her", "end"]);
    expect(rec?.calls).toContain("abort");
  });

  it("listen: abort drops everything; a new listen aborts the old one", () => {
    const first: string[] = [];
    listen({ onResult: () => first.push("result"), onError: (e) => first.push(e), onEnd: () => first.push("end") });
    const second: string[] = [];
    const stop = listen({ onResult: () => second.push("result"), onEnd: () => second.push("end") });
    expect(first).toEqual(["end"]);
    expect(FakeRecognition.instances[0]?.calls).toEqual(["start", "abort"]);
    vi.advanceTimersByTime(200);
    expect(FakeRecognition.instances[1]?.calls).toEqual(["start"]);
    stop("abort");
    stop("abort");
    expect(second).toEqual(["end"]);
  });

  it("listen: timeout stops recognition gracefully", () => {
    const events: string[] = [];
    listen({ timeoutMs: 3000, onResult: () => events.push("result"), onError: (e) => events.push(e), onEnd: () => events.push("end") });
    const rec = FakeRecognition.instances[0];
    vi.advanceTimersByTime(2900);
    expect(rec?.calls).toEqual(["start"]);
    vi.advanceTimersByTime(200);
    expect(rec?.calls).toEqual(["start", "stop"]);
    rec?.onend?.();
    expect(events).toEqual(["no-speech", "end"]);
  });
});
