"use client";

import { motion } from "motion/react";
import { useId } from "react";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-surface-2 p-1">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`press relative h-10 flex-1 rounded-[0.75rem] px-3 text-sm font-medium ${selected ? "text-text" : "text-text-2 hover:text-text"}`}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[0.75rem] bg-surface shadow-1"
                transition={{ type: "spring", duration: 0.25, bounce: 0 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
