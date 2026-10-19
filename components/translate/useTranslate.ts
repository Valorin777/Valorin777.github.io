"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiError, translate, type TranslateResult } from "@/lib/ai";

export type TranslateState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: TranslateResult; source: string }
  | { status: "error"; message: string };

export function translateErrorMessage(e: unknown): string {
  const kind = e instanceof AiError ? e.kind : "unavailable";
  if (kind === "offline") return "Нет интернета. Перевод заработает, когда связь вернётся.";
  if (kind === "rate-limit") return "Слишком много переводов подряд. Попробуй через минуту.";
  if (kind === "disabled") return "Переводчик ещё не подключён.";
  return "Перевод сейчас недоступен. Попробуй ещё раз.";
}

/** One translation request at a time; a new request cancels the previous one. */
export function useTranslate() {
  const [state, setState] = useState<TranslateState>({ status: "idle" });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = useCallback(async (text: string, to: "ru" | "en" | "auto" = "auto") => {
    const source = text.trim();
    if (!source) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ status: "loading" });
    try {
      const result = await translate({ text: source.slice(0, 600), to }, c.signal);
      if (!c.signal.aborted) setState({ status: "done", result, source });
    } catch (e) {
      if (!c.signal.aborted) setState({ status: "error", message: translateErrorMessage(e) });
    }
  }, []);

  const reset = useCallback(() => {
    ctrl.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, run, reset };
}
