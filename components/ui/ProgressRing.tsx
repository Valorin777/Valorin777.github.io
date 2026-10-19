"use client";

import { motion } from "motion/react";

/** Calm progress ring. Draws once on mount, then follows the value. */
export function ProgressRing({
  value,
  size = 64,
  stroke = 5,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: v === 0 ? 0.0001 : v }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        style={{ opacity: v === 0 ? 0 : 1 }}
      />
    </svg>
  );
}
