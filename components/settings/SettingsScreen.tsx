"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSpeech } from "@/components/speech/SpeechProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { ArrowLeftIcon, CheckIcon, SpeakerIcon } from "@/components/ui/Icons";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toggle } from "@/components/ui/Toggle";
import { useSpeechSupport, useVoices } from "@/hooks/useSpeech";
import { aiEnabled } from "@/lib/ai";
import { signIn, signOut, useCloud } from "@/lib/cloud";
import { downloadForOffline, offlineStatus, type OfflineStatus } from "@/lib/offline";
import { actions, useAppState, useHydrated } from "@/lib/store";
import type { ThemePref } from "@/types/state";

/** The natural voice every lesson line is recorded with. */
export const NATURAL_VOICE = "oa-marin";

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

const SAMPLE = "By the time I got there, the meeting had already started. Never mind, I'll catch up with you later.";

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

function since(iso: string | null): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString();
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function AccountGroup() {
  const cloud = useCloud();
  const busy = cloud.status === "signing-in";
  return (
    <Group title="Account">
      <div className="p-4">
        {cloud.user ? (
          <div className="flex items-center gap-3">
            {cloud.user.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- small avatar from Google, no optimisation needed
              <img src={cloud.user.photo} alt="" className="size-10 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-text-2">
                {(cloud.user.name ?? "?").slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-base text-text">{cloud.user.name ?? cloud.user.email}</p>
              <p className="text-sm text-text-3">
                {cloud.status === "synced"
                  ? `Synced ${since(cloud.lastSyncAt)}`
                  : cloud.status === "syncing"
                    ? "Syncing…"
                    : cloud.status === "offline"
                      ? "Offline — will sync when back online"
                      : (cloud.problem ?? "Sync paused")}
              </p>
            </div>
            <Button variant="quiet" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        ) : (
          <>
            <p className="text-base text-text">Keep your progress on every device</p>
            <p className="mt-1 text-sm text-text-3">Days, cards and mistakes sync to your Google account. Optional.</p>
            <div className="mt-4">
              <Button variant="secondary" size="md" disabled={busy} onClick={() => void signIn()}>
                <GoogleMark />
                {busy ? "Signing in…" : "Sign in with Google"}
              </Button>
            </div>
            {cloud.problem && <p className="mt-3 text-sm text-warm">{cloud.problem}</p>}
          </>
        )}
      </div>
    </Group>
  );
}

function OfflineRow() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  useEffect(() => {
    void offlineStatus().then(setStatus);
  }, []);
  if (!status?.supported) return null;
  return (
    <div className="flex items-center gap-3 border-t border-line p-4">
      <div className="min-w-0 flex-1">
        <p className="text-base text-text">Lessons offline</p>
        <p className="text-sm text-text-3">
          {status.state === "done"
            ? "All lessons and their audio are on this device."
            : status.state === "working"
              ? `Downloading… ${status.done} of ${status.total}`
              : "Download all days and recordings for the plane or the metro."}
        </p>
      </div>
      {status.state === "done" ? (
        <CheckIcon size={20} className="text-good" />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={status.state === "working"}
          onClick={() => void downloadForOffline((s) => setStatus(s))}
        >
          Download
        </Button>
      )}
    </div>
  );
}

function SettingsBody() {
  const { settings } = useAppState();
  const support = useSpeechSupport();
  const { voices, ready } = useVoices();
  const { speak } = useSpeech();
  const [confirmReset, setConfirmReset] = useState(false);
  const natural = Boolean(settings.neuralVoice) && aiEnabled();
  const rateValue = RATES.reduce((best, r) =>
    Math.abs(Number(r.value) - settings.rate) < Math.abs(Number(best.value) - settings.rate) ? r : best,
  ).value;
  const currentDeviceVoice = settings.voiceURI ?? voices[0]?.voiceURI ?? null;
  const preview = () => window.setTimeout(() => speak(SAMPLE, "settings-preview"), 50);

  return (
    <>
      <AccountGroup />

      <Group title="Voice">
        {aiEnabled() && (
          <div className="p-4">
            <Segmented
              label="Voice"
              value={natural ? "natural" : "device"}
              options={[
                { value: "natural", label: "Natural · Marin" },
                { value: "device", label: "This device" },
              ]}
              onChange={(v) => {
                actions.updateSettings({ neuralVoice: v === "natural" ? NATURAL_VOICE : null });
                preview();
              }}
            />
            <p className="mt-2 text-sm text-text-3">
              {natural
                ? "A real-sounding voice for lessons, cards and the coach. Falls back to the device voice offline."
                : "Your browser's built-in voice. Works offline, sounds more robotic."}
            </p>
          </div>
        )}
        <div className={aiEnabled() ? "border-t border-line p-4" : "p-4"}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-base text-text">Speed</p>
            <Button variant="quiet" size="sm" onClick={preview}>
              <SpeakerIcon size={18} />
              Listen
            </Button>
          </div>
          <Segmented
            label="Speech speed"
            value={rateValue}
            options={RATES}
            onChange={(v) => {
              actions.updateSettings({ rate: Number(v) });
              preview();
            }}
          />
        </div>
        {!natural &&
          (support && !support.tts ? (
            <p className="border-t border-line p-4 text-base text-text-2">This browser has no voice for reading aloud.</p>
          ) : (
            <div className="border-t border-line">
              {!ready ? (
                <div className="grid gap-2 p-4">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : voices.length === 0 ? (
                <p className="p-4 text-base text-text-2">No English voice found on this device.</p>
              ) : (
                <ul role="radiogroup" aria-label="Device voice" className="max-h-[22rem] overflow-y-auto">
                  {voices.slice(0, 12).map((v) => {
                    const selected = v.voiceURI === currentDeviceVoice;
                    return (
                      <li key={v.voiceURI} className="border-b border-line last:border-b-0">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            actions.updateSettings({ voiceURI: v.voiceURI });
                            preview();
                          }}
                          className="press flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base text-text">{v.name.replace(/\s*\(.*\)$/, "")}</span>
                            <span className="block text-xs text-text-3">{v.lang}</span>
                          </span>
                          {selected ? <CheckIcon size={20} className="text-accent-text" /> : <SpeakerIcon size={18} className="text-text-3" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
      </Group>

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
        <OfflineRow />
        <div className="border-t border-line p-4 first:border-t-0">
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
