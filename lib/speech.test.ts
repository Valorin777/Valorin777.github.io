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

/* ------------------------------------- natural voice and server recognition */

class FakeAudio {
  static instances: FakeAudio[] = [];
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
  emit(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  play(): Promise<void> {
    this.plays.push(this.source);
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

let micLevel = 0;

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  closed = false;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource(): { connect: () => void } {
    return { connect: () => undefined };
  }
  createAnalyser(): { fftSize: number; getByteTimeDomainData: (a: Uint8Array) => void } {
    return {
      fftSize: 2048,
      getByteTimeDomainData: (a: Uint8Array) => {
        const swing = Math.round(micLevel * 127);
        for (let i = 0; i < a.length; i++) a[i] = 128 + (i % 2 ? swing : -swing);
      },
    };
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported(type: string): boolean {
    return type === "audio/webm;codecs=opus";
  }
  mimeType: string;
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "";
    FakeRecorder.instances.push(this);
  }
  start(): void {
    this.state = "recording";
  }
  stop(): void {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(800)], { type: this.mimeType }) });
    this.onstop?.();
  }
}

describe("natural voice and server recognition (AI enabled)", () => {
  let synth: FakeSynth;
  let tracks: Array<{ stop: ReturnType<typeof vi.fn> }>;
  let getUserMedia: ReturnType<typeof vi.fn>;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const audioResponse = () => new Response(new Uint8Array(3).fill(7), { headers: { "Content-Type": "audio/mpeg" } });

  async function load(
    fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
    opts: { webSpeech?: boolean; recorder?: boolean; mic?: () => Promise<unknown> } = {},
  ) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_AI_URL", "https://ai.example.dev");
    synth = new FakeSynth();
    FakeRecognition.instances = [];
    FakeAudio.instances = [];
    FakeRecorder.instances = [];
    FakeAudioContext.instances = [];
    micLevel = 0;
    tracks = [{ stop: vi.fn() }];
    getUserMedia = vi.fn(opts.mic ?? (async () => ({ getTracks: () => tracks })));
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("window", {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: FakeUtterance,
      ...(opts.webSpeech === false ? {} : { webkitSpeechRecognition: FakeRecognition }),
      ...(opts.recorder === false ? {} : { MediaRecorder: FakeRecorder }),
      AudioContext: FakeAudioContext,
    });
    vi.stubGlobal("navigator", { userAgent: "test", mediaDevices: { getUserMedia } });
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal("fetch", fetchMock);
    const speech = await import("@/lib/speech");
    return { speech, fetchMock };
  }

  function track() {
    const events: string[] = [];
    return {
      events,
      speakOpts: {
        onStart: () => events.push("start"),
        onEnd: () => events.push("end"),
        onError: () => events.push("error"),
      },
      listenOpts: {
        onInterim: (t: string) => events.push(`interim:${t}`),
        onResult: (alts: string[]) => events.push(`result:${alts.join("|")}`),
        onError: (e: RecognitionError) => events.push(`error:${e}`),
        onEnd: () => events.push("end"),
      },
    };
  }

  const audio = (): FakeAudio => {
    const a = FakeAudio.instances[0];
    if (!a) throw new Error("no audio element");
    return a;
  };

  const bodyText = (init: RequestInit | undefined): string =>
    (JSON.parse(String(init?.body)) as { text: string }).text;

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("speaks with the natural voice when one is chosen; the device voice stays silent", async () => {
    const { speech, fetchMock } = await load(async () => audioResponse());
    const { events, speakOpts } = track();
    speech.speak("I **have** known her ___.", { neuralVoice: "a1-asteria", rate: 0.8, ...speakOpts });
    await vi.waitFor(() => expect(audio().clipPlays()).toHaveLength(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.example.dev/tts");
    expect(JSON.parse(String(init.body))).toEqual({ text: "I have known her blank.", voice: "a1-asteria" });
    expect(audio().playbackRate).toBe(0.8);
    audio().emit("playing");
    audio().playToEnd();
    expect(events).toEqual(["start", "end"]);
    expect(synth.spoken).toHaveLength(0);
  });

  it("without neuralVoice it uses the device voice as before", async () => {
    const { speech, fetchMock } = await load(async () => audioResponse());
    const { events, speakOpts } = track();
    speech.speak("Hello", speakOpts);
    expect(synth.spoken).toHaveLength(1);
    synth.end();
    expect(events).toEqual(["start", "end"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back silently to the device voice when the natural voice fails before starting", async () => {
    const { speech, fetchMock } = await load(async () => json({ error: "upstream" }, 502));
    const { events, speakOpts } = track();
    speech.speak("I have known her.", { neuralVoice: "a1-asteria", ...speakOpts });
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
    expect(synth.spoken[0]?.text).toBe("I have known her.");
    expect(events).toEqual(["start"]);
    synth.end();
    expect(events).toEqual(["start", "end"]);

    // The worker just failed: the next sentence goes straight to the device voice.
    const next = track();
    speech.speak("Next one.", { neuralVoice: "a1-asteria", ...next.speakOpts });
    expect(synth.spoken).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("plays long text as consecutive clips with one onStart and one onEnd", async () => {
    const { speech, fetchMock } = await load(async () => audioResponse());
    const first = `${"First part of a long example sentence ".repeat(5).trim()}.`;
    const second = `${"Second part of the same long example ".repeat(5).trim()}.`;
    const { events, speakOpts } = track();
    speech.speak(`${first} ${second}`, { neuralVoice: "a1-luna", ...speakOpts });
    await vi.waitFor(() => expect(audio().clipPlays()).toHaveLength(1));
    audio().emit("playing");
    audio().playToEnd();
    await vi.waitFor(() => expect(audio().clipPlays()).toHaveLength(2));
    audio().emit("playing");
    audio().playToEnd();
    expect(events).toEqual(["start", "end"]);
    expect(fetchMock.mock.calls.map(([, init]) => bodyText(init))).toEqual([first, second]);
  });

  it("stopSpeaking, cancel and a new utterance end the natural voice with one onEnd", async () => {
    const { speech } = await load(async () => audioResponse());
    const a = track();
    speech.speak("One.", { neuralVoice: "a1-luna", ...a.speakOpts });
    await vi.waitFor(() => expect(audio().clipPlays()).toHaveLength(1));
    audio().emit("playing");
    speech.stopSpeaking();
    speech.stopSpeaking();
    expect(a.events).toEqual(["start", "end"]);
    expect(audio().paused).toBe(true);

    const b = track();
    const cancel = speech.speak("Two.", { neuralVoice: "a1-luna", ...b.speakOpts });
    cancel();
    cancel();
    expect(b.events).toEqual(["end"]);

    const c = track();
    speech.speak("Three.", { neuralVoice: "a1-luna", ...c.speakOpts });
    await vi.waitFor(() => expect(audio().clipPlays()).toHaveLength(2));
    audio().emit("playing");
    const d = track();
    speech.speak("Device voice now.", d.speakOpts);
    expect(c.events).toEqual(["start", "end"]);
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
    synth.end();
    expect(d.events).toEqual(["start", "end"]);
  });

  it("reports recognition support with a recorder even without Web Speech", async () => {
    const withRecorder = await load(async () => json({}), { webSpeech: false });
    expect(withRecorder.speech.getSupport()).toEqual({ tts: true, recognition: true });
    const none = await load(async () => json({}), { webSpeech: false, recorder: false });
    expect(none.speech.getSupport().recognition).toBe(false);
  });

  it("records and transcribes on the worker when the browser cannot recognise speech", async () => {
    const { speech, fetchMock } = await load(async () => json({ text: " It has started. " }), { webSpeech: false });
    const { events, listenOpts } = track();
    const stop = speech.listen(listenOpts);
    await vi.waitFor(() => expect(FakeRecorder.instances[0]?.state).toBe("recording"));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeRecorder.instances[0]?.mimeType).toBe("audio/webm;codecs=opus");
    stop();
    await vi.waitFor(() => expect(events).toContain("end"));
    expect(events).toEqual(["interim:…", "result:It has started.", "end"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.example.dev/stt?lang=en");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("audio/webm");
    expect((init.body as Blob).size).toBe(800);
    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0]?.closed).toBe(true);
  });

  it("stops recording after ~1.2 s of silence following speech", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { speech, fetchMock } = await load(async () => json({ text: "I have known her" }), { webSpeech: false });
    const { events, listenOpts } = track();
    speech.listen({ ...listenOpts, timeoutMs: 9000 });
    await vi.advanceTimersByTimeAsync(0);
    const recorder = FakeRecorder.instances[0];
    expect(recorder?.state).toBe("recording");
    micLevel = 0.3;
    await vi.advanceTimersByTimeAsync(500);
    micLevel = 0.003;
    await vi.advanceTimersByTimeAsync(1000);
    expect(recorder?.state).toBe("recording");
    await vi.advanceTimersByTimeAsync(300);
    expect(recorder?.state).toBe("inactive");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(events).toContain("end"));
    expect(events).toEqual(["interim:…", "result:I have known her", "end"]);
  });

  it("only room noise until the timeout: no-speech without an upload", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { speech, fetchMock } = await load(async () => json({ text: "x" }), { webSpeech: false });
    const { events, listenOpts } = track();
    speech.listen({ ...listenOpts, timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(0);
    micLevel = 0.004;
    await vi.advanceTimersByTimeAsync(2100);
    expect(events).toEqual(["error:no-speech", "end"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("after a Web Speech network error the same call switches to the worker; later calls go straight there", async () => {
    const { speech } = await load(async () => json({ text: "I have been waiting" }));
    const { events, listenOpts } = track();
    const stop = speech.listen(listenOpts);
    const rec = FakeRecognition.instances[0];
    expect(rec?.calls).toEqual(["start"]);
    rec?.onerror?.({ error: "network" });
    rec?.onend?.();
    expect(rec?.calls).toContain("abort");
    await vi.waitFor(() => expect(FakeRecorder.instances[0]?.state).toBe("recording"));
    stop();
    await vi.waitFor(() => expect(events).toContain("end"));
    expect(events).toEqual(["interim:…", "result:I have been waiting", "end"]);

    const second = track();
    const stopSecond = speech.listen(second.listenOpts);
    expect(FakeRecognition.instances).toHaveLength(1);
    await vi.waitFor(() => expect(FakeRecorder.instances[1]?.state).toBe("recording"));
    stopSecond("abort");
    expect(second.events).toEqual(["end"]);
    expect(FakeRecorder.instances[1]?.state).toBe("inactive");
  });

  it("maps mic, empty-result and server failures; abort ends once without a result", async () => {
    const denied = await load(async () => json({ text: "x" }), {
      webSpeech: false,
      mic: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
    });
    const a = track();
    denied.speech.listen(a.listenOpts);
    await vi.waitFor(() => expect(a.events).toEqual(["error:not-allowed", "end"]));

    const empty = await load(async () => json({ text: "  " }), { webSpeech: false });
    const b = track();
    const stopB = empty.speech.listen(b.listenOpts);
    await vi.waitFor(() => expect(FakeRecorder.instances[0]?.state).toBe("recording"));
    stopB();
    await vi.waitFor(() => expect(b.events).toEqual(["interim:…", "error:no-speech", "end"]));

    const down = await load(async () => json({ error: "upstream" }, 502), { webSpeech: false });
    const c = track();
    const stopC = down.speech.listen(c.listenOpts);
    await vi.waitFor(() => expect(FakeRecorder.instances[0]?.state).toBe("recording"));
    stopC();
    await vi.waitFor(() => expect(c.events).toEqual(["interim:…", "error:network", "end"]));

    const aborted = await load(async () => json({ text: "x" }), { webSpeech: false });
    const d = track();
    const stopD = aborted.speech.listen(d.listenOpts);
    await vi.waitFor(() => expect(FakeRecorder.instances[0]?.state).toBe("recording"));
    stopD("abort");
    stopD();
    await new Promise((r) => setTimeout(r, 10));
    expect(d.events).toEqual(["end"]);
    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(aborted.fetchMock).not.toHaveBeenCalled();
  });

  it("without AI the old behaviour stays: a network error is reported, not handed off", async () => {
    vi.resetModules();
    synth = new FakeSynth();
    FakeRecognition.instances = [];
    vi.stubGlobal("window", { speechSynthesis: synth, SpeechSynthesisUtterance: FakeUtterance, webkitSpeechRecognition: FakeRecognition, MediaRecorder: FakeRecorder });
    vi.stubGlobal("navigator", { userAgent: "test", mediaDevices: { getUserMedia: vi.fn() } });
    const speech = await import("@/lib/speech");
    const { events, listenOpts } = track();
    speech.listen(listenOpts);
    FakeRecognition.instances[0]?.onerror?.({ error: "network" });
    FakeRecognition.instances[0]?.onend?.();
    expect(events).toEqual(["error:network", "end"]);
  });
});
