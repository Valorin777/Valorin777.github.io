import { describe, expect, it } from "vitest";
import { AURA_1, AURA_2, DEFAULT_VOICE, OPENAI_TTS_MODEL, VOICE_IDS, VOICES, voiceSpec } from "./voices";

// Speaker enums from `npx wrangler ai models schema @cf/deepgram/aura-1` and `aura-2-en`.
const AURA_1_SPEAKERS = ["angus", "asteria", "arcas", "orion", "orpheus", "athena", "luna", "zeus", "perseus", "helios", "hera", "stella"];
const AURA_2_SPEAKERS = [
  "amalthea", "andromeda", "apollo", "arcas", "aries", "asteria", "athena", "atlas", "aurora", "callista",
  "cora", "cordelia", "delia", "draco", "electra", "harmonia", "helena", "hera", "hermes", "hyperion",
  "iris", "janus", "juno", "jupiter", "luna", "mars", "minerva", "neptune", "odysseus", "ophelia",
  "orion", "orpheus", "pandora", "phoebe", "pluto", "saturn", "thalia", "theia", "vesta", "zeus",
];

describe("voices", () => {
  it("maps ids to the model and a speaker the model accepts", () => {
    expect(voiceSpec("a1-asteria")).toEqual({ model: AURA_1, speaker: "asteria" });
    expect(voiceSpec("a2-draco")).toEqual({ model: AURA_2, speaker: "draco" });
    expect(voiceSpec("oa-marin")).toEqual({ model: OPENAI_TTS_MODEL, speaker: "marin" });
    for (const id of VOICE_IDS.filter((x) => !x.startsWith("oa-"))) {
      const { model, speaker } = voiceSpec(id);
      expect(model === AURA_1 ? AURA_1_SPEAKERS : AURA_2_SPEAKERS).toContain(speaker);
    }
  });

  it("offers 6–11 voices, both genders, US and UK, with readable labels", () => {
    expect(VOICES.length).toBeGreaterThanOrEqual(6);
    expect(VOICES.length).toBeLessThanOrEqual(11);
    expect(new Set(VOICES.map((v) => v.gender))).toEqual(new Set(["female", "male"]));
    const accents = new Set(VOICES.map((v) => v.accent));
    expect(accents.has("US") && accents.has("UK")).toBe(true);
    expect(VOICES.find((v) => v.id === "a2-pandora")).toEqual({
      id: "a2-pandora",
      label: "Pandora · UK",
      accent: "UK",
      gender: "female",
      model: AURA_2,
    });
    expect(VOICE_IDS).toContain(DEFAULT_VOICE);
  });
});
