"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/ui/Icons";
import { aiEnabled } from "@/lib/ai";
import { TranslateResultView } from "./TranslateResult";
import { useTranslate } from "./useTranslate";

interface Anchor {
  text: string;
  x: number;
  top: number;
  bottom: number;
}

const LATIN = /[a-z]/i;

function readSelection(): Anchor | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (text.length < 2 || text.length > 300 || !LATIN.test(text)) return null;
  const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
  if (!node || node.closest("input, textarea, [contenteditable], [data-no-translate]")) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { text, x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom };
}

/**
 * Select any English text anywhere in the app → a small "Перевести" button appears next to
 * it → tap for the translation and the phrases worth learning. Below the selection, so the
 * phone's own copy menu above it stays usable.
 */
export function SelectionTranslate() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [open, setOpen] = useState(false);
  const { state, run, reset } = useTranslate();
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setAnchor(null);
    reset();
  }, [reset]);

  useEffect(() => {
    if (!aiEnabled()) return;
    const update = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (panel.current?.contains(document.activeElement)) return;
        const a = readSelection();
        setAnchor((prev) => {
          if (!a) return open ? prev : null;
          return a;
        });
        if (a) setOpen(false);
      }, 250);
    };
    const hide = () => {
      if (!open) setAnchor(null);
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", hide);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  if (!anchor) return null;

  const width = Math.min(360, window.innerWidth - 32);
  const left = Math.max(16, Math.min(window.innerWidth - width - 16, anchor.x - width / 2));
  const below = anchor.bottom + 10;
  const fitsBelow = below + (open ? 220 : 56) < window.innerHeight;
  const top = fitsBelow ? below : Math.max(16, anchor.top - (open ? 230 : 56));

  return (
    <AnimatePresence>
      <motion.div
        ref={panel}
        data-no-translate
        key={open ? "panel" : "chip"}
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        style={open ? { position: "fixed", top, left, width } : { position: "fixed", top, left: Math.max(16, anchor.x - 60) }}
        className="z-50"
      >
        {!open ? (
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(true);
              void run(anchor.text, "auto");
            }}
            className="press h-11 rounded-full bg-text px-4 text-sm font-medium text-bg shadow-3"
          >
            Перевести
          </button>
        ) : (
          <div role="dialog" aria-label="Перевод" className="rounded-lg border border-line bg-surface p-4 shadow-3">
            <div className="mb-2 flex items-start gap-2">
              <p className="line-clamp-2 flex-1 text-sm text-text-3">{anchor.text}</p>
              <button
                type="button"
                onClick={close}
                aria-label="Закрыть"
                className="press -mt-2 -mr-2 inline-flex size-10 items-center justify-center rounded-full text-text-3 hover:bg-surface-2 hover:text-text"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <TranslateResultView state={state} compact />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
