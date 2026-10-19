"use client";

import type { ReactNode } from "react";

/**
 * Layout of every lesson step: a reading column (~65 characters) and a bottom action bar
 * in the thumb zone. The bar fades the content under it instead of drawing a hard edge.
 */
export function StepFrame({
  eyebrow,
  title,
  titleLang,
  children,
  action,
  hints,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleLang?: string;
  children: ReactNode;
  action: ReactNode;
  hints?: ReactNode;
}) {
  return (
    <>
      <div className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-6 pb-48 sm:pt-10">
        {eyebrow && (
          <p className="text-xs font-medium tracking-[0.08em] text-text-3 uppercase">{eyebrow}</p>
        )}
        {title && (
          <h1 lang={titleLang} className="mt-2 text-xl text-text sm:text-2xl">
            {title}
          </h1>
        )}
        <div className={title || eyebrow ? "mt-6" : ""}>{children}</div>
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg from-55% to-transparent pt-10">
        <div className="pointer-events-auto mx-auto grid w-full max-w-[var(--container-reading)] gap-3 px-5 pb-safe">
          {action}
          {hints}
        </div>
      </div>
    </>
  );
}
