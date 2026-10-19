import type { FinalDayInput } from "@/lib/content/schema";

export const day7 = {
  number: 7,
  title: "Review and test",
  subtitle: "Your error log, a full review and a B2-style test",
  goal: "See how far you have come this week in a B2-style Use of English test, with your results by topic.",
  intro:
    "This is a short test in the style of Cambridge B2 First: in two texts you choose the right word, and in two more you write one word in each gap. It takes about 25 minutes, and at the end you see your results by topic. There is no pass or fail, so take your time and trust your first idea when you are not sure.",

  /* ------------------------------------------- Part 1: multiple-choice cloze */
  part1: [
    {
      id: "working-from-home",
      title: "Working from home: what I've learnt",
      text: [
        "I have worked from home {{1}} almost two years now. At first I thought it would be easy, but in reality it took me months to find a routine that worked. In the beginning I sat at my desk in my pyjamas and {{2}} off difficult tasks until the afternoon. Then a colleague {{3}} getting dressed every morning as if I were going to the office, and it helped more than I expected.",
        "{{4}} the obvious benefits, working from home has its problems. It is easy to feel lonely, and on some days I hardly speak to anyone. I also used to {{5}} a lot of money on takeaway meals that I did not even enjoy, because cooking seemed like too much trouble.",
        "The biggest change, {{6}}, was learning to switch off. My manager {{7}} us that nobody wanted replies to emails late at night, and that proper breaks were part of the job. These days I go for a walk at lunchtime, whatever the weather, and I {{8}} a real effort to stop working at six.",
      ].join("\n\n"),
      gaps: [
        {
          options: ["since", "for", "during", "ago"],
          answer: 1,
          category: "perfect",
          explain:
            "With the present perfect, for goes with a length of time (almost two years); since needs a starting point, and during and ago do not work with have worked.",
        },
        {
          options: ["set", "took", "put", "turned"],
          answer: 2,
          category: "collocations",
          explain:
            "Put off means delay something you should do; set off means start a journey, and took off and turned off do not go with tasks.",
        },
        {
          options: ["told", "suggested", "persuaded", "insisted"],
          answer: 1,
          category: "verb-patterns",
          explain:
            "Suggest is followed directly by -ing (suggested getting dressed); told and persuaded need a person + to, and insist needs on.",
        },
        {
          options: ["Although", "However", "Whereas", "Despite"],
          answer: 3,
          category: "linking",
          explain:
            "Despite is followed by a noun phrase (the obvious benefits); although and whereas need a full clause, and however cannot join two parts of a sentence.",
        },
        {
          options: ["waste", "spoil", "throw", "pay"],
          answer: 0,
          category: "collocations",
          explain:
            "We waste money on things that are not worth it; we spoil food or plans, throw money away and pay for something, so none of these fit money on.",
        },
        {
          options: ["although", "unless", "however", "whereas"],
          answer: 2,
          category: "linking",
          explain:
            "However between commas adds a contrast to the whole sentence; although, unless and whereas must start a new clause.",
        },
        {
          options: ["said", "explained", "suggested", "told"],
          answer: 3,
          category: "passive-reported",
          explain:
            "Tell is followed directly by a person (told us that…); say, explain and suggest need to before the person (explained to us).",
        },
        {
          options: ["do", "have", "make", "take"],
          answer: 2,
          category: "collocations",
          explain: "We make an effort to do something; do, have and take do not go with effort.",
        },
      ],
    },
    {
      id: "never-too-late",
      title: "Never too late",
      text: [
        "Many people believe that it is too late to learn a language after the age of thirty. However, researchers who {{1}} out a large study in several countries found that this is simply not true. Children usually copy new sounds more easily, {{2}} adults are better at understanding grammar rules and organising what they learn.",
        "When I turned forty, I {{3}} to learn Spanish. My teacher gave me a useful {{4}} of advice on the first day: do not be afraid of making mistakes. She also told me to keep a dictionary app on my phone {{5}} I needed a word in a hurry.",
        "Of course, there were weeks when I wanted to stop. Work was busy, I had very {{6}} free time, and I kept forgetting new words. But I soon {{7}} up with a simple system: ten new words on my phone every morning and one short conversation every week. A year later I met some people from Madrid, and they refused to believe that I had learnt Spanish at home. They said I {{8}} have lived in Spain for years.",
      ].join("\n\n"),
      gaps: [
        {
          options: ["carried", "made", "did", "took"],
          answer: 0,
          category: "collocations",
          explain:
            "We carry out a study, a survey or research; made out, did out and took out do not mean do a piece of work.",
        },
        {
          options: ["despite", "however", "unless", "whereas"],
          answer: 3,
          category: "linking",
          explain:
            "Whereas compares two different facts in one sentence; despite needs a noun, unless means if not, and however cannot join two clauses after a comma.",
        },
        {
          options: ["enjoyed", "kept", "decided", "considered"],
          answer: 2,
          category: "verb-patterns",
          explain: "Decide is followed by to + verb; enjoy, keep and consider are followed by -ing.",
        },
        {
          options: ["number", "piece", "deal", "couple"],
          answer: 1,
          category: "countable",
          explain:
            "Advice is uncountable, so we say a piece of advice; a number of and a couple of need plural nouns, and deal only works as a great deal of.",
        },
        {
          options: ["in case", "unless", "so that", "otherwise"],
          answer: 0,
          category: "conditionals",
          explain:
            "In case means to be ready if something happens; unless means if not, so that needs a purpose, and otherwise cannot start this clause.",
        },
        {
          options: ["few", "less", "small", "little"],
          answer: 3,
          category: "countable",
          explain:
            "Time is uncountable, so very little time; few goes with plural nouns, less is a comparative, and small free time would need an article.",
        },
        {
          options: ["thought", "came", "made", "found"],
          answer: 1,
          category: "collocations",
          explain:
            "Come up with means think of an idea or a plan; thought, made and found do not form a phrase with up with in this meaning.",
        },
        {
          options: ["must", "can't", "should", "would"],
          answer: 0,
          category: "modals",
          explain:
            "They were sure it was true, so must have + V3 (a confident guess about the past); can't have says the opposite, and should have and would have do not make a guess here.",
        },
      ],
    },
  ],

  /* ------------------------------------------------- Part 2: open cloze */
  part2: [
    {
      id: "food-festival",
      title: "A festival that started with five tables",
      text: [
        "Every September, the old port in our city {{1}} turned into a huge open-air kitchen. The food festival {{2}} first held in 1998, when five local cafés put tables outside for one weekend. Nobody expected it to last, but today it attracts more than 200,000 visitors and is {{3}} largest event of its kind in the country. More and more of them {{4}} now coming from abroad.",
        "What makes the festival special is that the food is cooked by ordinary people, not by famous chefs. My neighbour Maria, who has never worked in a restaurant, {{5}} sold her grandmother's fish soup there every year since 2010. {{6}} she made twice as much as usual last year, she still ran out by midday. The festival also goes on late: last year it {{7}} not finish until two in the morning.",
        "If you are planning to go, come by bus or on foot. Unfortunately, there is very {{8}} information about parking on the official website, and the streets near the port are always full.",
      ].join("\n\n"),
      gaps: [
        {
          answers: ["is", "gets"],
          category: "passive-reported",
          explain:
            "People turn the port into a kitchen every year, so we need the present simple passive: is turned (or gets turned).",
        },
        {
          answers: ["was"],
          category: "passive-reported",
          explain: "Past passive: was + V3 (held), because people held the festival for the first time in 1998.",
        },
        {
          answers: ["the"],
          category: "articles",
          explain: "Superlatives take the: the largest event of its kind.",
        },
        {
          answers: ["are"],
          category: "tense-choice",
          explain: "Now and a change that is still going on take the present continuous: are coming.",
        },
        {
          answers: ["has"],
          category: "perfect",
          explain: "Since 2010 joins the past to now, so we need the present perfect: has sold.",
        },
        {
          answers: ["although", "though", "while", "whilst"],
          category: "linking",
          explain:
            "Although (or though) starts a clause that contrasts with the main one: she made more soup, but she still ran out.",
        },
        {
          answers: ["did"],
          category: "be-verb",
          explain: "Finish is a normal verb, so the past negative is did not finish; was not finish is the classic be mistake.",
        },
        {
          answers: ["little"],
          category: "countable",
          explain: "Information is uncountable, so very little; few is only for plural countable nouns.",
        },
      ],
    },
    {
      id: "first-half-marathon",
      title: "From the sofa to the finish line",
      text: [
        "I {{1}} been running for almost two years now, and I still remember how it started. A friend persuaded me to sign up for a half marathon, and I agreed before I had really thought about it. At that point I could not run for more than five minutes.",
        "The first weeks were hard. One evening a trainer at my gym saw me stop after ten minutes, completely out of breath. “You {{2}} have done much running before,” she said, “or you would not be so tired already.” She also suggested joining a running club, which turned out to be {{3}} excellent idea. I {{4}} not know anyone there at first, but people were friendly and nobody cared about speed. I am not a morning person, but I soon got used {{5}} getting up early on Sundays.",
        "On the day of the race I finished in two hours and ten minutes. If I {{6}} known how much I would enjoy it, I would have started years ago. My advice is simple: beginners often get injured {{7}} they build up their distance slowly, so be patient. As for me, I {{8}} training for my first full marathon at the moment.",
      ].join("\n\n"),
      gaps: [
        {
          answers: ["have"],
          category: "perfect",
          explain: "For almost two years now: an action that started in the past and is still going on, so have been running.",
        },
        {
          answers: ["can't", "cannot", "couldn't"],
          category: "modals",
          explain:
            "She is sure it is not true (you are this tired already), so can't have + V3; must have would mean she is sure it is true.",
        },
        {
          answers: ["an"],
          category: "articles",
          explain: "Idea is a singular countable noun and excellent starts with a vowel sound, so an.",
        },
        {
          answers: ["did"],
          category: "be-verb",
          explain: "Know is a normal verb, so the past negative is did not know; was not know is wrong.",
        },
        {
          answers: ["to"],
          category: "verb-patterns",
          explain: "Get used to + -ing: to is a preposition here, so it is followed by getting.",
        },
        {
          answers: ["had"],
          category: "conditionals",
          explain: "Third conditional for an imagined past: if + had + V3, would have + V3.",
        },
        {
          answers: ["unless"],
          category: "conditionals",
          explain: "Unless means if not: beginners get injured if they do not build up their distance slowly.",
        },
        {
          answers: ["am"],
          category: "tense-choice",
          explain: "At the moment shows a temporary action in progress, so am + -ing.",
        },
      ],
    },
  ],

  /* -------------------------------------------------- final speaking review */
  speak: [
    {
      id: "final-film-had-started",
      ru: "Я не знал, что фильм уже начался.",
      en: [
        "I didn't know the film had already started.",
        "I didn't know that the film had already started.",
        "I didn't know the movie had already started.",
        "I didn't know that the movie had already started.",
        "I didn't know the film had started already.",
      ],
      category: "be-verb",
      focus: "didn't know, had started: no be",
    },
    {
      id: "final-looking-for-job",
      ru: "Сейчас я ищу новую работу.",
      en: [
        "I'm looking for a new job at the moment.",
        "I'm looking for a new job now.",
        "At the moment I'm looking for a new job.",
        "I'm looking for a new job right now.",
        "I'm currently looking for a new job.",
      ],
      category: "tense-choice",
      focus: "temporary → continuous",
    },
    {
      id: "final-lived-since",
      ru: "Я живу здесь с 2019 года.",
      en: [
        "I've lived here since 2019.",
        "I've been living here since 2019.",
        "I've lived here since twenty nineteen.",
        "I've been living here since twenty nineteen.",
      ],
      category: "perfect",
      focus: "have lived + since",
    },
    {
      id: "final-if-i-had-known",
      ru: "Если бы я тогда знал, я бы тебе сказал.",
      en: [
        "If I had known, I would have told you.",
        "If I'd known, I'd have told you.",
        "I would have told you if I had known.",
        "If I had known, I'd have told you.",
      ],
      category: "conditionals",
      focus: "third conditional",
    },
    {
      id: "final-looking-forward",
      ru: "С нетерпением жду встречи с тобой.",
      en: [
        "I'm looking forward to seeing you.",
        "I look forward to seeing you.",
        "I'm looking forward to meeting you.",
        "I'm really looking forward to seeing you.",
      ],
      category: "verb-patterns",
      focus: "look forward to + -ing",
    },
    {
      id: "final-told-to-wait",
      ru: "Нам сказали подождать.",
      en: ["We were told to wait.", "We were asked to wait.", "They told us to wait.", "We've been told to wait."],
      category: "passive-reported",
      focus: "were told + to",
    },
    {
      id: "final-must-have-forgotten",
      ru: "Он, должно быть, забыл.",
      en: ["He must have forgotten.", "He must have forgotten about it.", "He must have forgotten it."],
      category: "modals",
      focus: "must have + V3",
    },
    {
      id: "final-waste-money",
      ru: "Не трать деньги впустую.",
      en: ["Don't waste your money.", "Don't waste money.", "Don't waste your money on it."],
      category: "collocations",
      focus: "waste money",
    },
    {
      id: "final-carry-out-survey",
      ru: "Мы провели опрос клиентов.",
      en: [
        "We carried out a customer survey.",
        "We carried out a survey of our customers.",
        "We carried out a survey of our clients.",
        "We carried out a survey among our customers.",
        "We conducted a customer survey.",
        "We did a customer survey.",
      ],
      category: "collocations",
      focus: "carry out a survey",
    },
    {
      id: "final-despite-rain",
      ru: "Несмотря на дождь, мы пошли гулять.",
      en: [
        "Despite the rain, we went for a walk.",
        "In spite of the rain, we went for a walk.",
        "Although it was raining, we went for a walk.",
        "Even though it was raining, we went for a walk.",
        "We went for a walk despite the rain.",
        "Despite the rain, we went out for a walk.",
      ],
      category: "linking",
      focus: "despite + noun",
    },
    {
      id: "final-some-advice",
      ru: "Можно дать тебе совет?",
      en: [
        "Can I give you some advice?",
        "Can I give you a piece of advice?",
        "Can I give you a bit of advice?",
        "Could I give you some advice?",
        "May I give you some advice?",
      ],
      category: "countable",
      focus: "advice: no a, no -s",
    },
    {
      id: "final-works-as-engineer",
      ru: "Она работает инженером.",
      en: ["She works as an engineer.", "She's an engineer.", "She is an engineer."],
      category: "articles",
      focus: "a/an with jobs",
    },
  ],
} satisfies FinalDayInput;
