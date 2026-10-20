import type { TenseRefInput } from "@/lib/content/schema";

export const entry = {
  id: "future-perfect-continuous",
  group: "future",
  name: "Future Perfect Continuous",
  ruName: "Будущее совершённое длительное",
  short: "How long an action will have been going on by a future point",
  idea: "Это время-счётчик: ты встаёшь в точку будущего и считаешь, сколько к ней уже длится процесс. «В июне будет два года, как я здесь работаю» = By June I'll have been working here for two years. Встречается редко и почти всегда с for + срок; с work, live, study часто говорят проще: I'll have worked here for two years.",
  category: "perfect",
  forms: [
    {
      label: "+",
      parts: ["I / you / he / she / it / we / they", "will have been", "V-ing"],
      example: "By May, they'**ll have been building** the bridge for three years.",
    },
    {
      label: "−",
      parts: ["subject", "won't have been", "V-ing"],
      example: "She **won't have been working** here long by then.",
    },
    {
      label: "?",
      parts: ["How long", "will", "subject", "have been", "V-ing?"],
      example: "How long **will** you **have been living** here by June?",
    },
  ],
  timeline: {
    marks: [
      { kind: "span", at: -0.5, to: 0.6, label: "working here" },
      { kind: "point", at: 0.6, label: "June: two years" },
    ],
    caption: "Stand at June and count back how long the work has lasted.",
  },
  uses: [
    {
      en: "Duration up to a future point",
      ru: "Считаем, сколько времени процесс будет длиться к моменту в будущем. Нужны и точка (by June, next month, when you arrive), и срок (for two years, all day).",
      example: {
        en: "By June, I'**ll have been working** here for two years.",
        ru: "В июне будет два года, как я здесь работаю.",
      },
    },
    {
      en: "Reason for a future state",
      ru: "Объясняем, почему человек в тот момент будет уставшим, голодным, мокрым: процесс шёл долго. Срок здесь часто без for: all day, all night.",
      example: {
        en: "She'll be exhausted when she lands: she'**ll have been travelling** all day.",
        ru: "Она будет без сил, когда приземлится: она же весь день будет в дороге.",
      },
    },
    {
      en: "A simpler option often works",
      ru: "В живой речи это время нередко заменяют. С work, live, study, teach подходит и will have + V3, а ещё проще сказать It'll be two years in June since I started.",
      example: {
        en: "In June it'**ll be** two years since I **joined** the company.",
        ru: "В июне будет два года, как я в компании.",
      },
    },
  ],
  signals: [
    { word: "for + period", note: "for two years, for six hours: без срока это время почти не нужно" },
    { word: "by + time", note: "by June, by the end of the year: точка в будущем" },
    { word: "by the time + present simple", note: "by the time you arrive — без will после by the time" },
    { word: "when + present simple", note: "when she lands, she'll have been flying for 12 hours" },
    { word: "next month / in June", note: "точка без by: Next month I'll have been working here for a year" },
    { word: "all day / all night", note: "срок без for: she'll have been driving all day" },
    { word: "How long … by …?", note: "How long will you have been living here by June?" },
  ],
  versus: [
    {
      tense: "future-perfect",
      ru: "Continuous считает время процесса (for six hours), работа ещё идёт. Простой future perfect считает результат: сколько будет сделано (fifty emails).",
      a: {
        en: "By the end of the day I'**ll have been answering** emails for six hours.",
        ru: "К концу дня будет шесть часов, как я отвечаю на письма.",
      },
      b: { en: "By the end of the day I'**ll have answered** fifty emails.", ru: "К концу дня я отвечу на пятьдесят писем." },
    },
    {
      tense: "future-continuous",
      ru: "Future continuous — просто «в шесть я буду за рулём». Future perfect continuous — «в шесть будет уже пять часов, как я за рулём»: есть отрезок до точки.",
      a: {
        en: "At six I'**ll have been driving** for five hours.",
        ru: "В шесть будет уже пять часов, как я за рулём.",
      },
      b: { en: "At six I'**ll be driving**.", ru: "В шесть я буду за рулём." },
    },
    {
      tense: "present-perfect-continuous",
      ru: "Логика одна: «сколько уже длится». Считаем до сейчас — have been + -ing, до точки в будущем — will have been + -ing.",
      a: {
        en: "In May I'**ll have been learning** English for three years.",
        ru: "В мае будет три года, как я учу английский.",
      },
      b: { en: "I'**ve been learning** English for three years.", ru: "Я учу английский уже три года." },
    },
  ],
  mistakes: [
    {
      wrong: "In May she will work here for ten years.",
      right: "In May she will have been working here for ten years.",
      why: "«Будет десять лет, как она работает» — это счёт до точки в будущем, will + V1 его не передаёт: нужно will have been + -ing.",
    },
    {
      wrong: "Next month I will be working here for a year.",
      right: "Next month I will have been working here for a year.",
      why: "Will be + -ing — просто процесс в момент будущего, срок до точки он не считает: «будет год, как я здесь» = will have been working.",
    },
    {
      wrong: "By 2027 I will have been knowing her for ten years.",
      right: "By 2027 I will have known her for ten years.",
      why: "Know, be, have (иметь), own — глаголы состояния, они не ставятся в -ing: только will have + V3.",
    },
    {
      wrong: "Next week I will have been living here since three months.",
      right: "Next week I will have been living here for three months.",
      why: "Срок — это for (for three months), а since ставим только перед точкой начала (since March).",
    },
    {
      wrong: "By the time we will land, we will have been flying for 12 hours.",
      right: "By the time we land, we will have been flying for 12 hours.",
      why: "После by the time будущее передаём present simple, will остаётся только в главной части.",
    },
  ],
  trick: "Формула-счётчик: точка в будущем + for + срок. Если по-русски получается «к июню будет уже два года, как…» и важна длительность процесса до этой точки, это will have been + -ing; нет срока — это время почти никогда не нужно. В разговоре то же часто говорят проще: It'll be two years in June since I started.",
  examples: [
    {
      en: "By March, Olga **will have been running** her own café for five years.",
      ru: "В марте будет пять лет, как Ольга держит своё кафе.",
    },
    {
      en: "When she lands in Sydney, she'**ll have been travelling** for almost a day.",
      ru: "Когда она приземлится в Сиднее, она будет в дороге уже почти сутки.",
    },
    {
      en: "Next month we'**ll have been living** in Berlin for five years.",
      ru: "В следующем месяце будет пять лет, как мы живём в Берлине.",
    },
    {
      en: "By the time the meeting ends, we'**ll have been talking** for three hours.",
      ru: "К концу встречи мы проговорим уже три часа.",
    },
    {
      en: "How long **will** you **have been studying** English by the end of the year?",
      ru: "Сколько к концу года будет, как ты учишь английский?",
    },
    {
      en: "The kids will be starving: they'**ll have been playing** football all afternoon.",
      ru: "Дети придут голодными: они же полдня будут гонять мяч.",
    },
    {
      en: "Take your time: when you get here, we **won't have been waiting** long.",
      ru: "Не торопись: к твоему приезду мы прождём совсем недолго.",
    },
    {
      en: "In 2027 Dad **will have been teaching** at the same school for thirty years.",
      ru: "В 2027 году будет тридцать лет, как папа преподаёт в одной и той же школе.",
    },
    {
      en: "By the time you read this, I'**ll have been hiking** for a week.",
      ru: "Когда ты это прочитаешь, я уже неделю буду в походе.",
    },
    {
      en: "At midnight the servers **will have been running** without a break for 100 days.",
      ru: "В полночь будет 100 дней, как серверы работают без перерыва.",
    },
  ],
  exercises: [
    {
      id: "fpc-tom-bank",
      type: "choice",
      prompt: "By June, Tom ___ at the bank for ten years.",
      options: ["will have been working", "will has been working", "will been working", "has been working"],
      answer: 0,
      rule: "Future perfect continuous: will have been + -ing",
      explain: "We count ten years up to a future point (June): will have been working. After will, always have, never has; 'has been working' counts only up to now.",
      ruHint: "В июне будет десять лет, как Том работает в банке — will have been working.",
    },
    {
      id: "fpc-been-working",
      type: "fill",
      before: "By the end of this month, I'll have been ",
      after: " on this project for a year.",
      answers: ["working"],
      base: "work",
      rule: "After will have been → -ing",
      explain: "The continuous part needs the -ing form after been: will have been working.",
      ruHint: "После been — форма на -ing: working.",
    },
    {
      id: "fpc-anna-tokyo",
      type: "choice",
      prompt: "When Anna lands in Tokyo, she ___ for almost a whole day, so don't plan anything for that evening.",
      options: ["will travel", "will be travelling", "will have been travelling", "travels"],
      answer: 2,
      rule: "Duration up to a future point → will have been + -ing",
      explain: "When she lands, the journey has already lasted almost a day, and that explains why she'll be tired: will have been travelling.",
      ruHint: "К моменту посадки она уже почти сутки будет в дороге — will have been travelling.",
    },
    {
      id: "fpc-by-the-time-get",
      type: "fill",
      before: "By the time you ",
      after: " home, I'll have been cooking for three hours!",
      answers: ["get"],
      base: "get",
      rule: "by the time + present simple, not will",
      explain: "After by the time, use present simple for the future: by the time you get home. Will goes only in the main part.",
      ruHint: "После by the time — без will: by the time you get.",
    },
    {
      id: "fpc-driving-by-noon",
      type: "reorder",
      words: ["by", "noon", "we'll", "have", "been", "driving", "for", "six", "hours"],
      alt: [["we'll", "have", "been", "driving", "for", "six", "hours", "by", "noon"]],
      rule: "will have been + -ing + for + period",
      explain: "The form goes will + have + been + -ing, and the period follows with for: we'll have been driving for six hours.",
      ruHint: "«К полудню мы будем в пути уже шесть часов» — we'll have been driving for six hours.",
    },
    {
      id: "fpc-since-for",
      type: "errorTap",
      sentence: "When you arrive, I'll have been waiting since two hours.",
      wrong: 7,
      correct: "When you arrive, I'll have been waiting for two hours.",
      rule: "Length of time → for; starting point → since",
      explain: "Two hours is a length of time, so use for. Since goes with a starting point, like since two o'clock.",
      ruHint: "«Два часа» — for two hours; since — только «с какого момента».",
    },
    {
      id: "fpc-had-this-flat",
      type: "choice",
      prompt: "By 2030, we ___ this flat for twenty years.",
      options: ["will have been having", "will have had", "will have", "have had"],
      answer: 1,
      rule: "State verbs (know, have, own) → will have + V3",
      explain: "Have meaning 'own' is a state verb, so it doesn't take -ing. Use future perfect: will have had.",
      ruHint: "have = «иметь» — глагол состояния, без -ing: will have had.",
    },
    {
      id: "fpc-at-six-driving",
      type: "choice",
      prompt: "At 6 pm tomorrow I ___ to Kazan, so text me instead of calling.",
      options: ["will be driving", "will have been driving", "will have driven", "drive"],
      answer: 0,
      rule: "In progress at a future moment, no period → will be + -ing",
      explain: "There is no 'for + period' to count, only a moment when I'm in the middle of driving: will be driving.",
      ruHint: "Нет срока, просто «буду за рулём в шесть» — future continuous: will be driving.",
    },
  ],
} satisfies TenseRefInput;
