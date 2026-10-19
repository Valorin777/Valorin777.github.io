"use client";

/** A real switch: role="switch", whole row is the tap target. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="press flex min-h-14 w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-2"
    >
      <span className="flex-1">
        <span className="block text-base text-text">{label}</span>
        {hint && <span className="block text-sm text-text-3">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-accent" : "bg-line-strong"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-surface shadow-1 transition-transform duration-200 ease-[var(--ease-out)] ${checked ? "translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}
