export type ExerciseStatus = "answering" | "correct" | "wrong";

export interface AnswerEvent {
  /** What the learner gave, as readable text (for the error log and AI). */
  given: string;
  correct: boolean;
  /** Accepted with a small typo. */
  close?: boolean;
}

export interface ExerciseViewProps<E> {
  ex: E;
  status: ExerciseStatus;
  onAnswer: (a: AnswerEvent) => void;
  /** Views that need a "Check" press register their submit function here (null = not ready). */
  registerSubmit: (submit: (() => void) | null) => void;
}
