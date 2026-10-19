/** Coach conversation starters. The openers are recorded ahead of time (scripts/build-audio.ts). */

export interface Scenario {
  id: string;
  label: string;
  opener: string;
  focus: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: "tenses",
    label: "Tense trainer",
    opener: "Hi! Let's train your tenses through a real chat. I'll explain every tense as we go. To start: what did you do yesterday evening?",
    focus: ["was/were only with -ing or V3", "past simple vs present perfect", "past continuous and past perfect", "conditionals"],
  },
  {
    id: "week",
    label: "Your week",
    opener: "Hi! Let's talk about your week. What have you done so far this week?",
    focus: ["present perfect vs past simple", "be only with -ing or V3"],
  },
  {
    id: "work",
    label: "Work and study",
    opener: "Tell me about your work or studies. What are you working on these days?",
    focus: ["present simple vs continuous", "collocations"],
  },
  {
    id: "trip",
    label: "A trip",
    opener: "Think of a trip you remember well. Where did you go, and what had you expected before you got there?",
    focus: ["past simple", "past perfect"],
  },
  {
    id: "opinions",
    label: "Opinions",
    opener: "Here's a question: is it better to work from home or from an office? What do you think, and why?",
    focus: ["I agree / it depends (no be)", "linking words"],
  },
  {
    id: "free",
    label: "Free talk",
    opener: "Hi! What would you like to talk about today?",
    focus: ["be only with -ing or V3", "verb patterns", "collocations"],
  },
];

