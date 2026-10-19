/** Thin progress bar animated with transform only. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className="h-1 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-300 ease-[var(--ease-out)]"
        style={{ transform: `scaleX(${v})` }}
      />
    </div>
  );
}
