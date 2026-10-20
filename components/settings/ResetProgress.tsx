"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { listDays } from "@/content";
import { flushCloud, useCloud } from "@/lib/cloud";
import { dayHasProgress } from "@/lib/progress";
import { actions, useAppState } from "@/lib/store";

/** Start one day over: pick the day, confirm, then open it from its first step. */
export function ResetDay() {
  const state = useAppState();
  const signedIn = Boolean(useCloud().user);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const chips = useRef(new Map<number, HTMLButtonElement>());
  const cancel = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  /** Where focus goes back to when the confirmation closes without a reset. */
  const returnTo = useRef<number | null>(null);
  const days = listDays();
  const meta = days.find((d) => d.number === picked);

  // Keyboard and screen-reader users land on the safe choice, and come back to where they were.
  useEffect(() => {
    if (picked !== null) cancel.current?.focus();
    else if (returnTo.current !== null) {
      chips.current.get(returnTo.current)?.focus();
      returnTo.current = null;
    }
  }, [picked]);
  useEffect(() => {
    if (done !== null) status.current?.focus();
  }, [done]);

  return (
    <div className="border-t border-line p-4 first:border-t-0">
      <p className="text-base text-text">Start a day over</p>
      <p className="mt-1 text-sm text-text-3">
        The day opens at its first step again. Its answers, mistakes and cards are cleared; other days stay.
      </p>
      <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label="Day to start over">
        {days.map((d) => {
          const has = dayHasProgress(state, d.number);
          const on = picked === d.number;
          return (
            <button
              key={d.number}
              ref={(el) => {
                if (el) chips.current.set(d.number, el);
                else chips.current.delete(d.number);
              }}
              type="button"
              disabled={!has}
              aria-pressed={on}
              aria-label={`Day ${d.number}: ${d.title}${has ? "" : " (nothing to clear)"}`}
              onClick={() => {
                setPicked(on ? null : d.number);
                setDone(null);
              }}
              className={`press h-11 rounded-md border text-base tabular disabled:border-dashed disabled:text-text-3 ${
                on
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line bg-surface text-text hover:border-line-strong disabled:hover:border-line"
              }`}
            >
              {d.number}
            </button>
          );
        })}
      </div>

      {meta && (
        <div className="mt-4 rounded-md bg-surface-2 p-4" role="group" aria-labelledby="reset-day-question">
          <p id="reset-day-question" className="text-base text-text">
            Start Day {meta.number} · {meta.title} over?
          </p>
          <p className="mt-1 text-sm text-text-2">
            {meta.number === 7 ? "The Day 7 test result is cleared too. " : ""}
            {signedIn
              ? "This also applies to your account and your other devices."
              : "On this device now, and in your account too if you sign in later."}
          </p>
          <div className="mt-4 grid gap-3 min-[420px]:grid-cols-2">
            <Button
              ref={cancel}
              variant="secondary"
              size="md"
              onClick={() => {
                returnTo.current = meta.number;
                setPicked(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="md"
              onClick={() => {
                actions.resetDay(meta.number);
                void flushCloud();
                setDone(meta.number);
                setPicked(null);
              }}
            >
              Start Day {meta.number} over
            </Button>
          </div>
        </div>
      )}

      {/* Always mounted, so the result is announced when its text appears. */}
      <p ref={status} tabIndex={-1} role="status" aria-live="polite" className="mt-3 text-sm text-text-2 outline-none empty:mt-0">
        {done !== null ? `Day ${done} is fresh. It opens at the first step.` : ""}
      </p>
      {done !== null && (
        <div className="mt-3">
          <LinkButton href={`/day/${done}/`} size="md" variant="secondary">
            Open Day {done}
          </LinkButton>
        </div>
      )}
    </div>
  );
}

/** Start the whole course over: everything but settings, here and in the account. */
export function ResetAll() {
  const router = useRouter();
  const signedIn = Boolean(useCloud().user);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (confirm) {
      opened.current = true;
      keep.current?.focus();
    } else if (opened.current) {
      opener.current?.focus();
    }
  }, [confirm]);

  return (
    <div className="border-t border-line p-4 first:border-t-0">
      {!confirm ? (
        <>
          <p className="text-base text-text">Start the whole course over</p>
          <p className="mt-1 text-sm text-text-3">Back to the level check and Day 1, as on the first visit.</p>
          <Button ref={opener} variant="secondary" size="md" onClick={() => setConfirm(true)} className="mt-3">
            Start over…
          </Button>
        </>
      ) : (
        <div role="group" aria-labelledby="reset-all-question">
          <p id="reset-all-question" className="text-base text-text">
            Clear all progress?
          </p>
          <p className="mt-1 text-sm text-text-2">
            All seven days, cards, mistakes, the level check, tense practice and coach corrections are cleared
            {signedIn
              ? " on this device, in your account and on your other devices."
              : " on this device now, and in your account too if you sign in later."}{" "}
            Settings stay.
          </p>
          <div className="mt-4 grid gap-3 min-[420px]:grid-cols-2">
            <Button ref={keep} variant="secondary" size="md" disabled={pending} onClick={() => setConfirm(false)}>
              Keep progress
            </Button>
            <Button
              size="md"
              disabled={pending}
              onClick={() => {
                setPending(true);
                actions.reset();
                // Not awaited: the reset is saved locally at once, and its time keeps any older
                // cloud copy from bringing progress back even if this write is late.
                void flushCloud();
                router.push("/");
              }}
            >
              Clear everything
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
