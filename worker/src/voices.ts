export const AURA_1 = "@cf/deepgram/aura-1";
export const AURA_2 = "@cf/deepgram/aura-2-en";
/** Free, robotic-sounding last resort; never stored under a real voice's cache key. */
export const MELOTTS = "@cf/myshell-ai/melotts";

/** OpenAI voices through OpenRouter (paid per line, the most natural). */
export const OPENAI_TTS_MODEL = "openai/gpt-audio-mini";

export type TtsModel = typeof AURA_1 | typeof AURA_2 | typeof OPENAI_TTS_MODEL;
export type VoiceAccent = "US" | "UK" | "AU" | "IE";
export type VoiceGender = "female" | "male";

/** "a1-<speaker>" is Deepgram Aura-1, "a2-<speaker>" is Aura-2 (more natural, twice the price). */
export const VOICE_IDS = [
  "oa-marin",
  "oa-coral",
  "oa-sage",
  "a2-thalia",
  "a2-helena",
  "a2-aries",
  "a2-odysseus",
  "a2-pandora",
  "a2-draco",
  "a1-asteria",
  "a1-helios",
] as const;

export type VoiceId = (typeof VOICE_IDS)[number];

export interface Voice {
  id: VoiceId;
  label: string;
  accent: VoiceAccent;
  gender: VoiceGender;
  model: TtsModel;
}

type VoiceTraits = Pick<Voice, "accent" | "gender">;

// Accents from Deepgram's voice catalog; speaker names checked against the model schemas.
const TRAITS: Record<VoiceId, VoiceTraits> = {
  "oa-marin": { accent: "US", gender: "female" },
  "oa-coral": { accent: "US", gender: "female" },
  "oa-sage": { accent: "US", gender: "female" },
  "a2-thalia": { accent: "US", gender: "female" },
  "a2-helena": { accent: "US", gender: "female" },
  "a2-aries": { accent: "US", gender: "male" },
  "a2-odysseus": { accent: "US", gender: "male" },
  "a2-pandora": { accent: "UK", gender: "female" },
  "a2-draco": { accent: "UK", gender: "male" },
  "a1-asteria": { accent: "US", gender: "female" },
  "a1-helios": { accent: "UK", gender: "male" },
};

/**
 * The liveliest female voice when the same sentence was measured for pitch movement (a flat,
 * robotic voice barely moves): 3.9 semitones against 2.2–2.8 for the other female voices and
 * 2.4 for MeloTTS.
 */
export const DEFAULT_VOICE: VoiceId = "oa-marin";

/** Free voice used when the OpenAI voice cannot answer. */
export const FREE_FALLBACK_VOICE: VoiceId = "a2-thalia";

export interface VoiceSpec {
  model: TtsModel;
  speaker: string;
}

export function voiceSpec(id: VoiceId): VoiceSpec {
  const speaker = id.slice(3);
  if (id.startsWith("oa-")) return { model: OPENAI_TTS_MODEL, speaker };
  return { model: id.startsWith("a1-") ? AURA_1 : AURA_2, speaker };
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export const VOICES: readonly Voice[] = VOICE_IDS.map((id) => {
  const { model, speaker } = voiceSpec(id);
  const traits = TRAITS[id];
  return { id, label: `${capitalize(speaker)} · ${traits.accent}`, accent: traits.accent, gender: traits.gender, model };
});
