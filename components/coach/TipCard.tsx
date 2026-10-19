"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { RichText } from "@/components/ui/RichText";
import type { CoachTip } from "@/lib/ai";

/** The coach's tense trick for this turn: rule on the learner's own words, contrast examples, Russian on tap. */
export function TipCard({ tip }: { tip: CoachTip }) {
  const [ru, setRu] = useState(false);
  return (
    <motion.aside
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
      aria-label="Tense tip"
      className="mt-2 rounded-md border border-accent/20 bg-accent-soft px-4 py-3"
    >
      <p className="text-xs font-medium tracking-[0.08em] text-accent-text uppercase">Фишка · {tip.title}</p>
      <p className="mt-1.5 text-base text-text">
        <RichText text={tip.text} />
      </p>
      {tip.examples && tip.examples.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {tip.examples.map((e) => {
            const bad = e.trim().startsWith("✗");
            const other = e.trim().startsWith("≠");
            return (
              <li key={e} className={`text-sm ${bad ? "text-text-3" : "text-text"}`}>
                <span
                  className={`mr-1.5 font-medium ${bad ? "text-warm" : other ? "text-text-2" : "text-good"}`}
                  aria-label={bad ? "wrong" : other ? "correct, but means something else" : "right"}
                >
                  {bad ? "✗" : other ? "≠" : "✓"}
                </span>
                <span className={bad ? "line-through decoration-warm/60" : ""}>
                  <RichText text={e.replace(/^[✓✗≠]\s*/, "")} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {tip.ru &&
        (ru ? (
          <p lang="ru" className="mt-2 border-t border-accent/15 pt-2 text-sm text-text-2">
            <RichText text={tip.ru} />
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setRu(true)}
            className="press -ml-1 mt-1 min-h-9 rounded-sm px-1 text-sm text-text-2 underline decoration-line-strong underline-offset-4 hover:text-text"
          >
            По-русски
          </button>
        ))}
    </motion.aside>
  );
}
