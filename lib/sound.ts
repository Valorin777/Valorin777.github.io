/** Tiny, soft WebAudio cues. Lazy AudioContext; never throws; silent where unsupported. */

export type CueKind = "correct" | "close" | "tap" | "done";

interface Note {
  freq: number;
  /** Offset from the cue start, seconds. */
  at: number;
  /** Time until the note has faded out, seconds. */
  dur: number;
  type: OscillatorType;
  vol: number;
}

const CUES: Record<CueKind, readonly Note[]> = {
  // E5 → A5, a gentle rising fourth.
  correct: [
    { freq: 659.25, at: 0, dur: 0.16, type: "sine", vol: 0.08 },
    { freq: 880, at: 0.085, dur: 0.26, type: "sine", vol: 0.08 },
  ],
  // One soft low D4.
  close: [{ freq: 293.66, at: 0, dur: 0.22, type: "triangle", vol: 0.07 }],
  tap: [{ freq: 1318.51, at: 0, dur: 0.05, type: "sine", vol: 0.04 }],
  // C5 E5 G5 arpeggio.
  done: [
    { freq: 523.25, at: 0, dur: 0.28, type: "sine", vol: 0.07 },
    { freq: 659.25, at: 0.1, dur: 0.28, type: "sine", vol: 0.07 },
    { freq: 783.99, at: 0.2, dur: 0.32, type: "sine", vol: 0.07 },
  ],
};

const ATTACK = 0.012;
const SILENT = 0.0001;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context && context.state !== "closed") return context;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

function tone(ac: AudioContext, note: Note, t0: number): void {
  const start = t0 + note.at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = note.type;
  osc.frequency.setValueAtTime(note.freq, start);
  gain.gain.setValueAtTime(SILENT, start);
  gain.gain.exponentialRampToValueAtTime(note.vol, start + ATTACK);
  gain.gain.exponentialRampToValueAtTime(SILENT, start + note.dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // already disconnected
    }
  };
  osc.start(start);
  osc.stop(start + note.dur + 0.03);
}

export function playCue(kind: CueKind): void {
  try {
    const ac = getContext();
    if (!ac) return;
    // iOS starts contexts "suspended" (or "interrupted" after a call); notes queue until resumed.
    if (ac.state !== "running") Promise.resolve(ac.resume()).catch(() => undefined);
    const t0 = ac.currentTime + 0.01;
    for (const note of CUES[kind] ?? []) tone(ac, note, t0);
  } catch {
    // Sound is decoration: never let it break an answer.
  }
}
