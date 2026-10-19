"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { PlayButton } from "@/components/speech/SpeechProvider";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/Icons";
import { Skeleton } from "@/components/ui/Skeleton";
import { actions } from "@/lib/store";
import type { TranslateState } from "./useTranslate";

/** Day number used for cards the learner saves from the translator or the coach. */
export const MY_CARDS_DAY = 0;

/** Translation, the phrases worth learning, and one-tap "save to cards". */
export function TranslateResultView({ state, compact = false }: { state: TranslateState; compact?: boolean }) {
  const [saved, setSaved] = useState<Set<string>>(new Set());

  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <div className="grid gap-2" aria-busy="true" aria-label="Перевожу">
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p className="text-sm text-text-2" role="status">
        {state.message}
      </p>
    );
  }

  const { result, source } = state;
  const english = result.from === "en" ? source : result.translation;
  const russian = result.from === "en" ? result.translation : source;
  const save = (en: string, ru: string) => {
    actions.addPhraseCards(MY_CARDS_DAY, [{ en, ru, category: "collocations" }]);
    setSaved((s) => new Set(s).add(en));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      role="status"
    >
      <div className="flex items-start gap-1">
        <p lang={result.from === "en" ? "ru" : "en"} className={`flex-1 text-text ${compact ? "text-base" : "text-lesson"}`}>
          {result.translation}
        </p>
        <PlayButton text={english} id={`tr:${english.slice(0, 40)}`} className="-mt-2 -mr-2" />
      </div>

      {result.notes.length > 0 && (
        <ul className="mt-4 grid gap-2 border-t border-line pt-3">
          {result.notes.map((n) => (
            <li key={n.phrase} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-accent-text">{n.phrase}</p>
                <p lang={result.from === "en" ? "ru" : "en"} className="text-sm text-text-2">
                  {n.meaning}
                </p>
              </div>
              {result.from === "en" && (
                <button
                  type="button"
                  onClick={() => save(n.phrase, n.meaning)}
                  disabled={saved.has(n.phrase)}
                  className="press inline-flex min-h-10 shrink-0 items-center gap-1 rounded-sm px-2 text-xs text-text-2 hover:bg-surface-2 hover:text-text disabled:text-good"
                >
                  {saved.has(n.phrase) ? (
                    <>
                      <CheckIcon size={14} /> В карточках
                    </>
                  ) : (
                    "В карточки"
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!compact && english.length <= 160 && (
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={saved.has(english)}
            onClick={() => save(english, russian)}
          >
            {saved.has(english) ? "Фраза в карточках" : "Сохранить фразу в карточки"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
