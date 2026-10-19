"use client";

import { useState } from "react";
import { TranslateResultView } from "./TranslateResult";
import { useTranslate } from "./useTranslate";

/** A quiet "Перевод" link under a line of English that opens its translation in place. */
export function InlineTranslate({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const { state, run } = useTranslate();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void run(text, "ru");
        }}
        className="press -ml-1 mt-1 min-h-9 rounded-sm px-1 text-sm text-text-3 underline decoration-line-strong underline-offset-4 hover:text-text-2"
      >
        Перевод
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-md bg-surface-2 px-3 py-2">
      <TranslateResultView state={state} compact />
    </div>
  );
}
