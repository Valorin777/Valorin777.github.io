"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { ArrowLeftIcon, CheckIcon, SpeakerIcon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toggle } from "@/components/ui/Toggle";
import { useSpeechSupport, useVoices } from "@/hooks/useSpeech";
import { speak } from "@/lib/speech";
import { actions, useAppState, useHydrated } from "@/lib/store";
import type { ThemePref } from "@/types/state";

const THEMES = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: ThemePref; label: string }[];

const RATES = [
  { value: "0.8", label: "Slow" },
  { value: "0.95", label: "Natural" },
  { value: "1.1", label: "Brisk" },
] as const;

const SAMPLE = "By the time I got there, the meeting had already started.";

export function SettingsScreen() {
  const hydrated = useHydrated();
  return (
    <main className="mx-auto w-full max-w-[var(--container-reading)] px-5 pt-safe pb-16">
      <header className="flex h-16 items-center gap-2">
        <Link
          href="/"
          aria-label="Back home"
          className="press -ml-3 inline-flex size-12 items-center justify-center rounded-full text-text-2 hover:bg-surface-2 hover:text-text"
        >
          <ArrowLeftIcon />
        </Link>
        <h1 className="text-lg text-text">Settings</h1>
        <span className="ml-auto text-xs text-text-3">Saved automatically</span>
      </header>
      {hydrated ? <SettingsBody /> : <Skeleton className="mt-6 h-96 rounded-lg" />}
    </main>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-sans text-xs font-medium tracking-[0.08em] text-text-3 uppercase">{title}</h2>
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-1">{children}</div>
    </section>
  );
}

function SettingsBody() {
  const { settings } = useAppState();
  const support = useSpeechSupport();
  const { voices, ready } = useVoices();
  const [confirmReset, setConfirmReset] = useState(false);
  const rateValue = RATES.reduce((best, r) =>
    Math.abs(Number(r.value) - settings.rate) < Math.abs(Number(best.value) - settings.rate) ? r : best,
  ).value;
  const currentVoice = settings.voiceURI ?? voices[0]?.voiceURI ?? null;

  const preview = (voiceURI: string | null, rate = settings.rate) => speak(SAMPLE, { voiceURI, rate });

  return (
    <>
      <Group title="Appearance">
        <div className="p-4">
          <Segmented<ThemePref>
            label="Theme"
            value={settings.theme}
            options={THEMES}
            onChange={(theme) => actions.updateSettings({ theme })}
          />
        </div>
        <div className="border-t border-line">
          <Toggle
            checked={settings.showRu}
            onChange={(showRu) => actions.updateSettings({ showRu })}
            label="Always show Russian translations"
            hint="Otherwise they appear on tap"
          />
        </div>
      </Group>

      <Group title="Voice">
        {support && !support.tts ? (
          <p className="p-4 text-base text-text-2">
            This browser has no voice for reading aloud. Try Chrome, Edge or Safari.
          </p>
        ) : (
          <>
            <div className="p-4">
              <p className="mb-3 text-base text-text">Speed</p>
              <Segmented
                label="Speech speed"
                value={rateValue}
                options={RATES}
                onChange={(v) => {
                  actions.updateSettings({ rate: Number(v) });
                  preview(settings.voiceURI, Number(v));
                }}
              />
            </div>
            <div className="border-t border-line">
              {!ready ? (
                <div className="grid gap-2 p-4">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : voices.length === 0 ? (
                <p className="p-4 text-base text-text-2">No English voice found. Reading aloud is off.</p>
              ) : (
                <ul role="radiogroup" aria-label="Voice" className="max-h-[22rem] overflow-y-auto">
                  {voices.slice(0, 12).map((v) => {
                    const selected = v.voiceURI === currentVoice;
                    return (
                      <li key={v.voiceURI} className="border-b border-line last:border-b-0">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            actions.updateSettings({ voiceURI: v.voiceURI });
                            preview(v.voiceURI);
                          }}
                          className="press flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base text-text">{v.name.replace(/\s*\(.*\)$/, "")}</span>
                            <span className="block text-xs text-text-3">{v.lang}</span>
                          </span>
                          {selected ? (
                            <CheckIcon size={20} className="text-accent-text" />
                          ) : (
                            <SpeakerIcon size={18} className="text-text-3" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </Group>

      <Group title="Feedback">
        <Toggle
          checked={settings.sound}
          onChange={(sound) => actions.updateSettings({ sound })}
          label="Soft sounds"
          hint="A quiet tone on answers"
        />
        <div className="border-t border-line">
          <Toggle
            checked={settings.haptics}
            onChange={(haptics) => actions.updateSettings({ haptics })}
            label="Vibration"
            hint="On phones that support it"
          />
        </div>
      </Group>

      <Group title="Progress">
        <div className="p-4">
          {!confirmReset ? (
            <Button variant="quiet" size="md" onClick={() => setConfirmReset(true)} className="-ml-3">
              Start the course over
            </Button>
          ) : (
            <div>
              <p className="text-base text-text">This clears days, cards and mistakes on this device. Settings stay.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button variant="secondary" size="md" onClick={() => setConfirmReset(false)}>
                  Keep progress
                </Button>
                <Button
                  size="md"
                  onClick={() => {
                    actions.reset();
                    setConfirmReset(false);
                  }}
                >
                  Clear it
                </Button>
              </div>
            </div>
          )}
        </div>
      </Group>

      <div className="mt-10">
        <LinkButton href="/" full variant="secondary">
          Done
        </LinkButton>
      </div>
    </>
  );
}
