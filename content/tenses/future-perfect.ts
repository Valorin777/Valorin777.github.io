import type { TenseRefInput } from "@/lib/content/schema";

export const entry = {
  id: "future-perfect",
  group: "future",
  name: "Future Perfect",
  ruName: "Будущее совершённое",
  short: "Done before a point in the future",
  idea: "Представь, что ты переносишься в будущее, скажем в пятницу вечером, и оглядываешься назад: отчёт к этому моменту уже готов. Это и есть future perfect: will have + V3, «к такому-то моменту уже будет сделано». Ему почти всегда нужна точка в будущем: by Friday, by then, by the time you come.",
  category: "perfect",
  forms: [
    {
      label: "+",
      parts: ["I / you / he / she / it / we / they", "will have", "V3"],
      example: "She'**ll have left** by then.",
    },
    {
      label: "−",
      parts: ["subject", "won't have", "V3"],
      example: "I **won't have finished** by six.",
    },
    {
      label: "?",
      parts: ["Will", "subject", "have", "V3?"],
      example: "**Will** you **have finished** by Friday?",
    },
    {
      label: "Short answer",
      parts: ["Yes, I will.", "No, I won't."],
      example: "**Will** they **have landed** by ten? Yes, they **will**.",
    },
  ],
  timeline: {
    marks: [
      { kind: "result", at: 0.2, to: 0.65, label: "I'll have finished" },
      { kind: "point", at: 0.65, label: "Friday" },
    ],
    caption: "On Friday, the report is already done.",
  },
  uses: [
    {
      en: "Done before a future point",
      ru: "Действие закончится до определённого момента в будущем, и в этот момент уже будет результат. Рядом почти всегда by + время: by Monday, by 2030, by then. Простое will с by тоже не ошибка (I'll send it by Monday), а will have подчёркивает «к тому моменту уже будет готово».",
      example: {
        en: "I'**ll have sent** you the contract by Monday.",
        ru: "К понедельнику я уже пришлю тебе договор.",
      },
    },
    {
      en: "By the time + present",
      ru: "Точкой в будущем может быть другое событие: by the time + present simple, а в главной части will have + V3. Картинка «ты придёшь, а уже всё».",
      example: {
        en: "By the time you wake up, we'**ll have landed** in Dubai.",
        ru: "Когда ты проснёшься, мы уже приземлимся в Дубае.",
      },
    },
    {
      en: "Totals by a future point",
      ru: "Подводим итог к моменту в будущем: сколько всего будет сделано или сколько продлится состояние. Глаголы состояния (know, be, have) не ставим в -ing, поэтому срок с ними считаем через will have + V3: In June I'll have known him for ten years.",
      example: {
        en: "By the end of this trip, we'**ll have visited** six countries.",
        ru: "К концу этой поездки мы побываем в шести странах.",
      },
    },
    {
      en: "Confident guess about now",
      ru: "Иногда will have + V3 — не будущее, а уверенная догадка о том, что уже случилось: «наверняка уже». Обычно с by now.",
      example: {
        en: "It's nine already, so they'**ll have landed** by now.",
        ru: "Уже девять, так что они наверняка уже приземлились.",
      },
    },
  ],
  signals: [
    { word: "by + time", note: "by Friday, by 6 pm — «к», а не «до» (until). Просто will тоже возможно: I'll finish it by Friday" },
    { word: "by then", note: "«к тому времени»" },
    { word: "by the time + present simple", note: "by the time you come — без will после by the time" },
    { word: "by the end of…", note: "by the end of the week / month / year" },
    { word: "before + present simple", note: "I'll have left before you get here" },
    { word: "already", note: "I'll already have left / I'll have already left — оба порядка верны" },
    { word: "for + period", note: "срок до точки в будущем: for ten years" },
    { word: "by now", note: "уверенная догадка: they'll have arrived by now" },
  ],
  versus: [
    {
      tense: "future-simple",
      ru: "Will + V1: ты проснёшься, и тогда я займусь завтраком. Will have + V3: к твоему пробуждению я уже уйду, действие закончится раньше.",
      a: { en: "When you wake up, I'**ll have left** for work.", ru: "Когда ты проснёшься, я уже уйду на работу." },
      b: { en: "When you wake up, I'**ll make** breakfast.", ru: "Когда ты проснёшься, я приготовлю завтрак." },
    },
    {
      tense: "future-perfect-continuous",
      ru: "Future perfect — результат и количество: сколько будет сделано. Future perfect continuous — сколько времени будет длиться процесс (for + срок).",
      a: { en: "By June I'**ll have written** five chapters.", ru: "К июню я напишу пять глав." },
      b: {
        en: "By June I'**ll have been writing** this book for a year.",
        ru: "В июне будет год, как я пишу эту книгу.",
      },
    },
    {
      tense: "past-perfect",
      ru: "Логика одна и та же: «к моменту X уже случилось». Точка в прошлом — had + V3, точка в будущем — will have + V3.",
      a: {
        en: "By the time Mum gets home, we'**ll have cleaned** the flat.",
        ru: "К приходу мамы мы уже уберём квартиру.",
      },
      b: {
        en: "By the time Mum got home, we **had cleaned** the flat.",
        ru: "К приходу мамы мы уже убрали квартиру.",
      },
    },
  ],
  mistakes: [
    {
      wrong: "By the time you will arrive, we will have eaten.",
      right: "By the time you arrive, we will have eaten.",
      why: "После by the time будущее передаём present simple, а will оставляем только в главной части.",
    },
    {
      wrong: "The plumber will fixed the leak by tonight.",
      right: "The plumber will have fixed the leak by tonight.",
      why: "V3 без have не работает: между will и V3 обязательно стоит have.",
    },
    {
      wrong: "She will has left by then.",
      right: "She will have left by then.",
      why: "После will всегда have, никогда has, даже с he, she, it.",
    },
    {
      wrong: "I will have finish the slides by noon.",
      right: "I will have finished the slides by noon.",
      why: "После have нужна V3: finished, written, done, а не V1.",
    },
    {
      wrong: "They will have repaired the road until May.",
      right: "They will have repaired the road by May.",
      why: "«К маю» (срок) — это by; until значит «до… (всё это время)» и нужен для длительности.",
    },
    {
      wrong: "In June I will know him for ten years.",
      right: "In June I will have known him for ten years.",
      why: "«Будет десять лет, как я его знаю» — это срок до точки в будущем: will have + V3.",
    },
  ],
  trick: "Перенесись в ту точку будущего и оглянись назад: если дело там уже сделано, это will have + V3. Русские подсказки: «к пятнице уже…», «успею к…», а «не успею к шести» = I won't have finished by six.",
  examples: [
    { en: "Don't worry, I'**ll have packed** everything by the time the taxi comes.", ru: "Не переживай, к приезду такси я уже всё соберу." },
    {
      en: "By the time you get here, we'**ll have eaten** all the pizza.",
      ru: "Пока ты доберёшься, мы уже съедим всю пиццу.",
    },
    {
      en: "The team **will have fixed** the bug by tomorrow morning.",
      ru: "К завтрашнему утру команда уже исправит баг.",
    },
    {
      en: "She **won't have finished** her shift by eight, so let's meet at nine.",
      ru: "К восьми она ещё не закончит смену, так что давай встретимся в девять.",
    },
    { en: "**Will** you **have finished** the slides by the meeting?", ru: "Ты успеешь доделать слайды к встрече?" },
    {
      en: "By the end of the year, we'**ll have hired** ten new developers.",
      ru: "К концу года мы наймём десять новых разработчиков.",
    },
    {
      en: "Next month my parents **will have been** married for forty years.",
      ru: "В следующем месяце будет сорок лет, как мои родители женаты.",
    },
    {
      en: "Max left an hour ago, so he'**ll have got** home by now.",
      ru: "Макс ушёл час назад, так что он наверняка уже дома.",
    },
    {
      en: "I'm afraid we **won't have saved** enough for a car by summer.",
      ru: "Боюсь, к лету мы ещё не накопим на машину.",
    },
    {
      en: "Call after nine: the kids **will have gone** to bed by then.",
      ru: "Звони после девяти: дети к тому времени уже лягут спать.",
    },
  ],
  exercises: [
    {
      id: "fp-anna-design",
      type: "choice",
      prompt: "By Friday, Anna ___ the design for the new app.",
      options: ["will has finished", "will have finished", "will finished", "has finished"],
      answer: 1,
      rule: "Future perfect: will have + V3 (never will has)",
      explain: "After will, always use have, even with she: will have finished. 'Has finished' is present perfect and doesn't go with a future point like 'by Friday'.",
      ruHint: "will + have + V3 для всех лиц: Anna will have finished.",
    },
    {
      id: "fp-gone-to-bed",
      type: "fill",
      before: "Don't call me at eleven: I ",
      after: " to bed by then.",
      answers: ["will have gone", "will have already gone", "will already have gone"],
      base: "go",
      rule: "Done before a future point → will have + V3",
      explain: "By eleven I'll already be in bed: the action is finished before that point, so use will have + V3. The V3 of go is gone.",
      ruHint: "К одиннадцати я уже лягу спать — will have gone.",
    },
    {
      id: "fp-dinner-ready",
      type: "choice",
      prompt: "When the guests arrive at seven, we ___ the table already, so they can sit down straight away.",
      options: ["will lay", "laid", "will have laid", "lay"],
      answer: 2,
      rule: "Ready before that moment → will have + V3",
      explain: "Already and 'sit down straight away' show the table is ready before the guests arrive: will have laid. 'Will lay' would mean we start when they arrive.",
      ruHint: "К приходу гостей стол уже накрыт — will have laid.",
    },
    {
      id: "fp-by-march",
      type: "errorTap",
      sentence: "We will have moved to the new office until March.",
      wrong: 8,
      correct: "We will have moved to the new office by March.",
      rule: "Deadline → by March, not until March",
      explain: "A deadline takes by: by March means 'not later than March'. Until is for something that continues up to that time.",
      ruHint: "«К марту» — by March; until = «до… (всё время)».",
    },
    {
      id: "fp-concert-not-started",
      type: "fill",
      before: "Relax, we can leave at eight: the concert ",
      after: " by the time we get there.",
      answers: ["won't have started", "won't even have started", "won't have even started"],
      base: "not / start",
      rule: "Negative: won't have + V3",
      explain: "When we get there, the start is still in the future, so use the negative future perfect: won't have started.",
      ruHint: "К нашему приходу концерт ещё не начнётся — won't have started.",
    },
    {
      id: "fp-checked-in",
      type: "errorTap",
      sentence: "By the time you will get to the airport, I'll have checked in.",
      wrong: 4,
      correct: "By the time you get to the airport, I'll have checked in.",
      rule: "by the time + present simple, not will",
      explain: "After by the time, use present simple for the future: by the time you get. Will goes only in the main part: I'll have checked in.",
      ruHint: "После by the time — без will: by the time you get.",
    },
    {
      id: "fp-known-ten-years",
      type: "choice",
      prompt: "By next June, I ___ Max for ten years: we met at university.",
      options: ["will have been knowing", "will know", "know", "will have known"],
      answer: 3,
      rule: "State verb + for + future point → will have + V3",
      explain: "We count ten years up to next June, so use future perfect. Know is a state verb, so no -ing: will have known.",
      ruHint: "«Будет десять лет, как я знаю Макса» — will have known, без -ing.",
    },
    {
      id: "fp-finished-by-friday",
      type: "reorder",
      words: ["will", "you", "have", "finished", "the", "report", "by", "Friday"],
      end: "?",
      alt: [["by", "Friday", "will", "you", "have", "finished", "the", "report"]],
      rule: "Question: Will + subject + have + V3?",
      explain: "In the question, only will goes before the subject; have and V3 stay after it: Will you have finished…?",
      ruHint: "«Ты успеешь закончить отчёт к пятнице?» — Will you have finished…?",
    },
  ],
} satisfies TenseRefInput;
