import type { Day, Exercise } from "@/lib/content/schema";

export type Section = "learn" | "speak" | "review";

export const SECTION_LABELS: Record<Section, string> = {
  learn: "Learn",
  speak: "Listen & speak",
  review: "Review",
};

export const SECTIONS: readonly Section[] = ["learn", "speak", "review"];

export type Step = { id: string; section: Section; seconds: number } & (
  | { kind: "rule"; topicId: string; cardIndex: number }
  | { kind: "mistakes"; topicId: string }
  | { kind: "ruNote"; topicId: string }
  | { kind: "exercise"; topicId: string; exerciseIndex: number }
  | { kind: "listen"; topicId: string }
  | { kind: "speak"; itemIndex: number }
  | { kind: "review" }
  | { kind: "done" }
);

/**
 * Time estimates per step, calibrated so a day with Day 1's amount of material comes to about
 * 20 min Learn + 15 min Listen & speak + 10 min Review = 45 min.
 */
export const STEP_SECONDS = {
  rulePerPoint: 8,
  ruleBase: 6,
  mistake: 12,
  ruNote: 20,
  tapExercise: 15,
  builtExercise: 24,
  listenPerExample: 15,
  speak: 30,
  review: 600,
} as const;

function exerciseSeconds(ex: Exercise): number {
  return ex.type === "fill" || ex.type === "reorder" ? STEP_SECONDS.builtExercise : STEP_SECONDS.tapExercise;
}

/** The lesson as a flat list: Learn (per topic) → Listen & speak → Review → Done. */
export function buildSteps(day: Day): Step[] {
  const steps: Step[] = [];
  for (const topic of day.topics) {
    topic.rules.forEach((card, cardIndex) => {
      steps.push({
        id: `${topic.id}:rule:${cardIndex}`,
        section: "learn",
        seconds: STEP_SECONDS.rulePerPoint * card.steps.length + STEP_SECONDS.ruleBase,
        kind: "rule",
        topicId: topic.id,
        cardIndex,
      });
    });
    steps.push({
      id: `${topic.id}:mistakes`,
      section: "learn",
      seconds: STEP_SECONDS.mistake * topic.mistakes.length,
      kind: "mistakes",
      topicId: topic.id,
    });
    steps.push({ id: `${topic.id}:ru`, section: "learn", seconds: STEP_SECONDS.ruNote, kind: "ruNote", topicId: topic.id });
    topic.exercises.forEach((ex, exerciseIndex) => {
      steps.push({
        id: `ex:${ex.id}`,
        section: "learn",
        seconds: exerciseSeconds(ex),
        kind: "exercise",
        topicId: topic.id,
        exerciseIndex,
      });
    });
  }
  for (const topic of day.topics) {
    steps.push({
      id: `listen:${topic.id}`,
      section: "speak",
      seconds: STEP_SECONDS.listenPerExample * topic.examples.length,
      kind: "listen",
      topicId: topic.id,
    });
  }
  day.speak.forEach((item, itemIndex) => {
    steps.push({ id: `speak:${item.id}`, section: "speak", seconds: STEP_SECONDS.speak, kind: "speak", itemIndex });
  });
  steps.push({ id: "review", section: "review", seconds: STEP_SECONDS.review, kind: "review" });
  steps.push({ id: "done", section: "review", seconds: 0, kind: "done" });
  return steps;
}

export function stepIndexById(steps: readonly Step[], id: string): number {
  return steps.findIndex((s) => s.id === id);
}

export function totalSeconds(steps: readonly Step[]): number {
  return steps.reduce((sum, s) => sum + s.seconds, 0);
}

export function remainingSeconds(steps: readonly Step[], doneSteps: readonly string[]): number {
  const done = new Set(doneSteps);
  return steps.reduce((sum, s) => (done.has(s.id) ? sum : sum + s.seconds), 0);
}

/** Steps with no time estimate ("done") still weigh one second so finishing them reaches 1. */
const weight = (s: Step): number => (s.seconds > 0 ? s.seconds : 1);

export function progressRatio(steps: readonly Step[], doneSteps: readonly string[]): number {
  const total = steps.reduce((sum, s) => sum + weight(s), 0);
  if (total === 0) return 0;
  const done = new Set(doneSteps);
  const finished = steps.reduce((sum, s) => (done.has(s.id) ? sum + weight(s) : sum), 0);
  return Math.min(1, finished / total);
}

/** First step not done yet; the last step ("done") when everything is finished. */
export function firstUndoneIndex(steps: readonly Step[], doneSteps: readonly string[]): number {
  const done = new Set(doneSteps);
  const index = steps.findIndex((s) => !done.has(s.id));
  return index === -1 ? steps.length - 1 : index;
}

export function formatMinutes(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  const shown = minutes > 10 ? Math.round(minutes / 5) * 5 : minutes;
  return `about ${shown} min`;
}

/**
 * Index range of every section: `start` inclusive, `end` exclusive (as in slice). A section
 * without steps gets an empty range (start === end) where it would have been.
 */
export function sectionBounds(steps: readonly Step[]): Record<Section, { start: number; end: number; seconds: number }> {
  const result = {} as Record<Section, { start: number; end: number; seconds: number }>;
  let cursor = 0;
  for (const section of SECTIONS) {
    let start = -1;
    let end = -1;
    let seconds = 0;
    steps.forEach((s, i) => {
      if (s.section !== section) return;
      if (start === -1) start = i;
      end = i + 1;
      seconds += s.seconds;
    });
    if (start === -1) {
      start = cursor;
      end = cursor;
    }
    result[section] = { start, end, seconds };
    cursor = end;
  }
  return result;
}
