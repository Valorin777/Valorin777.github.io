import type { TimelineMark } from "@/lib/content/schema";

const W = 320;
const AXIS_Y = 66;
const NOW_X = W / 2;
const HALF = 136;
const x = (t: number): number => NOW_X + t * HALF;

/** Labels sit on two rows above the axis so neighbouring marks do not collide. */
function labelY(i: number): number {
  return i % 2 === 0 ? 24 : 40;
}

function Mark({ mark, i }: { mark: TimelineMark; i: number }) {
  const from = x(mark.at);
  const to = x(mark.to ?? mark.at);
  const mid = (from + to) / 2;
  const ly = labelY(i);
  const label = (
    <text x={mark.kind === "point" ? from : mid} y={ly} textAnchor="middle" className="fill-[var(--text-2)]" fontSize="11">
      {mark.label}
    </text>
  );
  switch (mark.kind) {
    case "point":
      return (
        <g>
          {label}
          <line x1={from} x2={from} y1={ly + 5} y2={AXIS_Y - 8} stroke="var(--line-strong)" strokeDasharray="2 3" />
          <circle cx={from} cy={AXIS_Y} r="6" fill="var(--accent)" />
        </g>
      );
    case "span":
      return (
        <g>
          {label}
          <rect
            x={from}
            y={AXIS_Y - 7}
            width={Math.max(6, to - from)}
            height="14"
            rx="7"
            fill="color-mix(in oklch, var(--accent) 28%, transparent)"
            stroke="var(--accent)"
            strokeWidth="1.5"
          />
        </g>
      );
    case "repeat": {
      const n = Math.max(3, Math.min(7, Math.round((to - from) / 22)));
      return (
        <g>
          {label}
          {Array.from({ length: n }, (_, k) => {
            const cx = from + ((to - from) * k) / (n - 1);
            return (
              <path
                key={k}
                d={`M${cx - 4} ${AXIS_Y - 4}l8 8M${cx + 4} ${AXIS_Y - 4}l-8 8`}
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}
        </g>
      );
    }
    case "result": {
      const lift = Math.min(26, Math.max(14, (to - from) / 4));
      return (
        <g>
          {label}
          <circle cx={from} cy={AXIS_Y} r="5" fill="var(--accent)" />
          <path
            d={`M${from} ${AXIS_Y - 6} Q ${mid} ${AXIS_Y - 6 - lift * 2} ${to - 2} ${AXIS_Y - 8}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.75"
            strokeDasharray="4 3"
          />
          <path d={`M${to - 9} ${AXIS_Y - 13} L${to - 1} ${AXIS_Y - 8} L${to - 10} ${AXIS_Y - 4}`} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }
  }
}

/** Where the tense sits in time: past on the left, now in the middle, future on the right. */
export function Timeline({ marks, caption }: { marks: TimelineMark[]; caption: string }) {
  return (
    <figure className="rounded-lg border border-line bg-surface px-3 pt-3 pb-3 shadow-1">
      <svg viewBox={`0 0 ${W} 96`} className="h-auto w-full" role="img" aria-label={caption}>
        <line x1="12" x2={W - 14} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--line-strong)" strokeWidth="1.5" />
        <path d={`M${W - 20} ${AXIS_Y - 5} L${W - 12} ${AXIS_Y} L${W - 20} ${AXIS_Y + 5}`} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
        <line x1={NOW_X} x2={NOW_X} y1={AXIS_Y - 12} y2={AXIS_Y + 12} stroke="var(--text-3)" strokeWidth="1.5" />
        <text x={NOW_X} y={AXIS_Y + 26} textAnchor="middle" fontSize="11" fontWeight="600" className="fill-[var(--text-2)]">
          now
        </text>
        <text x="14" y={AXIS_Y + 26} fontSize="11" className="fill-[var(--text-3)]">
          past
        </text>
        <text x={W - 14} y={AXIS_Y + 26} textAnchor="end" fontSize="11" className="fill-[var(--text-3)]">
          future
        </text>
        {marks.map((m, i) => (
          <Mark key={i} mark={m} i={i} />
        ))}
      </svg>
      <figcaption className="mt-1 px-1 text-sm text-text-2">{caption}</figcaption>
    </figure>
  );
}
