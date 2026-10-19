"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MicButton, recognitionMessage } from "@/components/speech/SpokenFeedback";
import { useSpeech } from "@/components/speech/SpeechProvider";
import { Button } from "@/components/ui/Button";
import { ArrowLeftIcon } from "@/components/ui/Icons";
import { KeyHints, Kbd } from "@/components/ui/Kbd";
import { useRecognizer } from "@/hooks/useSpeech";
import { aiEnabled } from "@/lib/ai";
import { TranslateResultView } from "./TranslateResult";
import { useTranslate } from "./useTranslate";

type Direction = "auto" | "ru" | "en";

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "ru", label: "EN → RU" },
  { value: "en", label: "RU → EN" },
];

const RECENT_KEY = "b2sprint:translations";

function readRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function remember(text: string) {
  try {
    const next = [text, ...readRecent().filter((t) => t !== text)].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // private mode
  }
}

export function TranslateScreen() {
  const [text, setText] = useState("");
  const [dir, setDir] = useState<Direction>("auto");
  const [recent, setRecent] = useState<string[]>([]);
  const { state, run } = useTranslate();
  const { support } = useSpeech();
  const rec = useRecognizer();
  const area = useRef<HTMLTextAreaElement>(null);
  const enabled = aiEnabled();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser storage after mount
    setRecent(readRecent());
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) area.current?.focus();
  }, []);

  // Dictation: put what was heard into the box and translate it.
  useEffect(() => {
    if (rec.state === "done" && rec.alternatives?.[0]) {
      const heard = rec.alternatives[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- result of an external recogniser
      setText(heard);
      void run(heard, dir);
      remember(heard);
      rec.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a finished recognition only
  }, [rec.state, rec.alternatives]);

  const go = (t = text) => {
    const clean = t.trim();
    if (!clean) return;
    void run(clean, dir);
    remember(clean);
    setRecent(readRecent());
  };

  // Dictation language: Russian when translating into English.
  const dictateLang = dir === "en" ? "ru-RU" : "en-US";

  return (
    <main className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-safe pb-16">
      <header className="flex h-16 items-center gap-2">
        <Link
          href="/"
          aria-label="Back home"
          className="press -ml-3 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-lg text-text">Переводчик</h1>
      </header>

      {!enabled ? (
        <p className="mt-6 text-base text-text-2">Переводчик подключится вместе с ИИ-сервером.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Направление" className="mt-2 flex gap-2">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={dir === d.value}
                onClick={() => setDir(d.value)}
                className={`press h-10 rounded-full px-4 text-sm ${
                  dir === d.value ? "bg-accent text-accent-ink" : "border border-line bg-surface text-text-2 hover:text-text"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            <label htmlFor="tr-text" className="sr-only">
              Текст для перевода
            </label>
            <div className="rounded-lg border border-line bg-surface shadow-1 focus-within:border-accent">
              <textarea
                id="tr-text"
                ref={area}
                value={text}
                maxLength={600}
                rows={3}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    go();
                  }
                }}
                placeholder="Вставь или надиктуй фразу на английском или русском"
                className="block w-full resize-none rounded-lg bg-transparent px-4 pt-3 pb-1 text-lesson text-text outline-none placeholder:text-text-3"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                {support?.recognition ? (
                  <MicButton
                    size="md"
                    state={rec.state}
                    onStart={() => rec.start({ lang: dictateLang, timeoutMs: 12000 })}
                    onStop={rec.stop}
                    label={dir === "en" ? "Надиктовать по-русски" : "Надиктовать по-английски"}
                  />
                ) : (
                  <span />
                )}
                <span className="text-xs text-text-3 tabular">{text.length}/600</span>
              </div>
            </div>
            {rec.state === "listening" && (
              <p className="mt-2 text-sm text-text-3 italic" aria-live="polite">
                {rec.interim || "Слушаю…"}
              </p>
            )}
            {rec.error && <p className="mt-2 text-sm text-text-2">{recognitionMessage(rec.error)}</p>}
            <div className="mt-4">
              <Button type="submit" full disabled={!text.trim() || state.status === "loading"}>
                Перевести
              </Button>
            </div>
            <div className="mt-2">
              <KeyHints>
                <Kbd>Enter</Kbd> перевести · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> новая строка
              </KeyHints>
            </div>
          </form>

          {state.status !== "idle" && (
            <section aria-label="Перевод" className="mt-6 rounded-lg border border-line bg-surface p-5 shadow-2">
              <TranslateResultView state={state} />
            </section>
          )}

          {state.status === "idle" && recent.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">Недавние</h2>
              <ul className="grid gap-1">
                {recent.map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => {
                        setText(r);
                        go(r);
                      }}
                      className="press -mx-2 w-full truncate rounded-md px-2 py-3 text-left text-base text-text-2 hover:bg-surface-2 hover:text-text"
                    >
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state.status === "idle" && recent.length === 0 && (
            <p className="mt-8 text-sm text-text-3">
              Подсказка: выдели любой английский текст в уроке или у коуча — появится кнопка «Перевести».
            </p>
          )}
        </>
      )}
    </main>
  );
}
