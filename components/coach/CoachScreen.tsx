"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { PlayButton, useSpeech } from "@/components/speech/SpeechProvider";
import { MicButton, recognitionMessage } from "@/components/speech/SpokenFeedback";
import { Button, LinkButton } from "@/components/ui/Button";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/Icons";
import { Kbd, KeyHints } from "@/components/ui/Kbd";
import { InlineTranslate } from "@/components/translate/InlineTranslate";
import { TipCard } from "./TipCard";
import { RichText } from "@/components/ui/RichText";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useRecognizer } from "@/hooks/useSpeech";
import { aiEnabled, AiError, coach, type CoachTip, type CoachTurn } from "@/lib/ai";
import { SCENARIOS, type Scenario } from "@/lib/coachScenarios";
import type { Category } from "@/lib/content/schema";
import { actions, useHydrated } from "@/lib/store";

interface Turn extends CoachTurn {
  id: string;
  correction?: { wrong: string; right: string; why: string } | null;
  tip?: CoachTip | null;
}

/** Rough category for the error log, from what the correction changed. */
function categorize(wrong: string, right: string): Category {
  const w = ` ${wrong.toLowerCase()} `;
  const r = ` ${right.toLowerCase()} `;
  const be = /\s(am|is|are|was|were|'m|'s|'re)\s/;
  if (be.test(w) && !be.test(r)) return "be-verb";
  if (/\s(had|have|has)\s/.test(w + r)) return "perfect";
  if (/\s(to\s\w+|\w+ing)\s/.test(r) && !/\s(to\s\w+|\w+ing)\s/.test(w)) return "verb-patterns";
  return "collocations";
}

export function CoachScreen() {
  const hydrated = useHydrated();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[var(--container-reading)] flex-col px-5 pt-safe">
        <header className="flex h-16 shrink-0 items-center gap-2">
          <Link
            href="/"
            aria-label="Back home"
            className="press -ml-3 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
          >
            <ArrowLeftIcon />
          </Link>
          <h1 className="text-lg text-text">Speak with the coach</h1>
        </header>
        {hydrated ? <CoachBody /> : <Skeleton className="mt-6 h-72 rounded-lg" />}
      </main>
  );
}

function CoachBody() {
  const { support, speak, stop, speakingId } = useSpeech();
  const rec = useRecognizer();
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [typed, setTyped] = useState("");
  const [handsFree, setHandsFree] = useState(true);
  const [online, setOnline] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const lastSpokenId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const canListen = Boolean(support?.recognition);
  const enabled = aiEnabled();

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, thinking]);

  const begin = (s: Scenario) => {
    abortRef.current?.abort();
    stop();
    rec.reset();
    setScenario(s);
    setEnded(false);
    setProblem(null);
    const opener: Turn = { id: `a0-${s.id}`, role: "assistant", text: s.opener };
    setTurns([opener]);
    speak(s.opener, opener.id);
  };

  const send = async (text: string, history: Turn[]) => {
    const clean = text.trim();
    if (!clean || thinking || ended) return;
    const userTurn: Turn = { id: `u${history.length}`, role: "user", text: clean };
    const nextTurns = [...history, userTurn];
    setTurns(nextTurns);
    setThinking(true);
    setProblem(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await coach(
        {
          history: nextTurns.map(({ role, text: t }) => ({ role, text: t })).slice(-30),
          scenario: scenario.label,
          focus: scenario.focus,
          level: "B1",
        },
        ctrl.signal,
      );
      if (res.correction) {
        const c = res.correction;
        actions.recordAnswer({
          day: 0,
          key: `coach:${c.wrong.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
          correct: false,
          category: categorize(c.wrong, c.right),
          prompt: c.wrong,
          given: c.wrong,
          right: c.right,
          rule: c.why,
        });
      }
      const reply: Turn = { id: `a${nextTurns.length}`, role: "assistant", text: res.reply, tip: res.tip };
      setTurns((t) => [...t.map((x) => (x.id === userTurn.id ? { ...x, correction: res.correction } : x)), reply]);
      setEnded(res.ended);
      speak(res.reply, reply.id);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const kind = e instanceof AiError ? e.kind : "unavailable";
      setProblem(
        kind === "offline"
          ? "You're offline. The coach needs a connection."
          : kind === "rate-limit"
            ? "Let's slow down for a moment — try again in a minute."
            : "I lost the line for a moment. Try again.",
      );
    } finally {
      setThinking(false);
    }
  };

  // Recognised speech → send it.
  useEffect(() => {
    if (rec.state === "done" && rec.alternatives?.[0]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- result of an external recogniser
      void send(rec.alternatives[0], turns);
      rec.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a finished recognition only
  }, [rec.state, rec.alternatives]);

  // Hands-free: when the coach finishes speaking, start listening.
  useEffect(() => {
    if (speakingId) {
      lastSpokenId.current = speakingId;
      return;
    }
    if (!lastSpokenId.current) return;
    const finished = lastSpokenId.current;
    lastSpokenId.current = null;
    const last = turns[turns.length - 1];
    if (handsFree && canListen && !ended && last?.role === "assistant" && last.id === finished) {
      rec.start({ timeoutMs: 12000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven by speech transitions
  }, [speakingId]);

  const toggleMic = () => {
    if (rec.state === "listening") rec.stop();
    else {
      stop();
      rec.start({ timeoutMs: 12000 });
    }
  };

  useHotkeys({ " ": () => canListen && turns.length > 0 && !thinking && toggleMic() }, turns.length > 0);

  if (!enabled || !online) {
    return (
      <div className="pt-8">
        <p className="font-serif text-2xl text-text">
          {!online ? "You're offline right now." : "The coach is almost ready."}
        </p>
        <p className="mt-3 text-base text-text-2">
          {!online
            ? "The coach needs a connection. Meanwhile, the speaking drill in today's lesson works offline."
            : "Its AI server is being connected. Meanwhile, the speaking drill in today's lesson works the same way: Russian on screen, you answer aloud."}
        </p>
        <div className="mt-10">
          <LinkButton href="/" full variant="secondary">
            Back home
          </LinkButton>
        </div>
      </div>
    );
  }

  if (turns.length === 0) {
    return (
      <div className="flex flex-1 flex-col pt-4 pb-safe">
        <p className="text-lesson text-text-2">
          A short conversation, by voice. The coach keeps it simple, asks one question at a time and points out one
          mistake when it matters. Every correction becomes a flashcard.
        </p>
        <h2 className="mt-8 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Choose a topic</h2>
        <ul className="mt-3 grid gap-2">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => begin(s)}
                className="press flex min-h-16 w-full items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-left shadow-1 hover:border-line-strong"
              >
                <span className="flex-1">
                  <span className="block text-base text-text">{s.label}</span>
                  <span className="block text-sm text-text-3">{s.focus.join(" · ")}</span>
                </span>
                <ArrowRightIcon size={18} className="text-text-3" />
              </button>
            </li>
          ))}
        </ul>
        {!canListen && (
          <p className="mt-6 text-sm text-text-3">
            This browser can&apos;t listen, so you&apos;ll type short answers instead. Chrome, Edge and Safari can listen.
          </p>
        )}
      </div>
    );
  }

  const last = turns[turns.length - 1];
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 pb-2">
        <p className="text-sm text-text-3">{scenario.label}</p>
        {canListen && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-text-2">
            <input
              type="checkbox"
              checked={handsFree}
              onChange={(e) => setHandsFree(e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Hands-free
          </label>
        )}
      </div>

      <ol className="grid flex-1 content-start gap-4 pb-64" aria-live="polite">
        <AnimatePresence initial={false}>
          {turns.map((t) => (
            <motion.li
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className={t.role === "user" ? "justify-self-end" : "justify-self-start"}
            >
              {t.role === "assistant" ? (
                <div className="max-w-[34rem]">
                  <div className="flex items-start gap-1">
                    <div className="rounded-lg rounded-tl-sm border border-line bg-surface px-4 py-3 shadow-1">
                      <p className="text-lesson text-text">
                        <RichText text={t.text} />
                      </p>
                      <InlineTranslate text={t.text} />
                    </div>
                    <PlayButton text={t.text} id={t.id} className="mt-1" />
                  </div>
                  {t.tip && (
                    <div className="mr-12">
                      <TipCard tip={t.tip} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid max-w-[30rem] justify-items-end gap-2">
                  <p className="rounded-lg rounded-tr-sm bg-accent-soft px-4 py-3 text-lesson text-text">{t.text}</p>
                  {t.correction && (
                    <div className="w-full rounded-md border border-warm/25 bg-warm-soft px-4 py-3 text-left">
                      <p className="text-sm text-text-3">
                        <span className="mr-1.5 text-xs font-medium tracking-[0.06em] text-warm uppercase">You said</span>
                        <span className="line-through decoration-warm/70">{t.correction.wrong}</span>
                      </p>
                      <p className="mt-1 text-base text-text">
                        <span className="mr-1.5 text-xs font-medium tracking-[0.06em] text-good uppercase">Better</span>
                        {t.correction.right}
                      </p>
                      <p className="mt-1 text-sm text-text-2">{t.correction.why}</p>
                    </div>
                  )}
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
        {thinking && (
          <li className="justify-self-start" aria-label="The coach is thinking">
            <div className="flex gap-1.5 rounded-lg rounded-tl-sm border border-line bg-surface px-4 py-4 shadow-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-2 rounded-full bg-text-3"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          </li>
        )}
        <div ref={endRef} />
      </ol>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg from-60% to-transparent pt-12">
        <div className="mx-auto grid w-full max-w-[var(--container-reading)] justify-items-center gap-3 px-5 pb-safe">
          {problem && (
            <div className="flex w-full items-center justify-between gap-3 rounded-md bg-warm-soft px-4 py-2" role="status">
              <p className="text-sm text-text">{problem}</p>
              {last?.role === "user" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const history = turns.slice(0, -1);
                    void send(last.text, history);
                  }}
                >
                  Try again
                </Button>
              )}
            </div>
          )}
          {ended ? (
            <div className="grid w-full gap-3">
              <p className="text-center text-base text-text-2">That was a good session. The corrections are in your cards.</p>
              <Button full onClick={() => setTurns([])}>
                Start another topic
              </Button>
            </div>
          ) : canListen ? (
            <>
              <MicButton state={rec.state} onStart={toggleMic} onStop={rec.stop} label="Answer the coach" />
              <p className="min-h-5 text-center text-sm text-text-3" aria-live="polite">
                {rec.state === "listening"
                  ? rec.interim || "Listening…"
                  : rec.error
                    ? recognitionMessage(rec.error)
                    : thinking
                      ? " "
                      : speakingId
                        ? "The coach is speaking"
                        : "Tap the mic and answer"}
              </p>
              <KeyHints>
                <Kbd>Space</Kbd> talk
              </KeyHints>
            </>
          ) : (
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(typed, turns);
                setTyped("");
              }}
            >
              <label htmlFor="coach-input" className="sr-only">
                Your answer
              </label>
              <input
                id="coach-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                maxLength={200}
                placeholder="One short sentence"
                autoComplete="off"
                className="h-14 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-4 text-base text-text outline-none focus:border-accent"
              />
              <Button type="submit" disabled={!typed.trim() || thinking}>
                Send
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
