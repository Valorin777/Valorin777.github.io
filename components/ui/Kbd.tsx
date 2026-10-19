import type { ReactNode } from "react";

/** Keyboard hints are desktop-only and quiet. */
export function KeyHints({ children }: { children: ReactNode }) {
  return (
    <p className="hidden select-none text-center text-xs text-text-3 [@media(hover:hover)_and_(pointer:fine)]:block">
      {children}
    </p>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex min-w-5 items-center justify-center rounded-[5px] border border-line bg-surface px-1 font-sans text-[0.6875rem] leading-4 text-text-2">
      {children}
    </kbd>
  );
}
