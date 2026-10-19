/**
 * "Download lessons for offline": stores every page and every recorded line in the
 * service worker's caches (see scripts/build-sw.mjs), so the whole course works on a plane.
 */
import { BASE_PATH } from "@/lib/constants";

export interface OfflineStatus {
  supported: boolean;
  state: "idle" | "working" | "done";
  done: number;
  total: number;
}

const AUDIO_CACHE = "b2-audio";
const PAGES_CACHE = "b2-pages";

interface OfflineList {
  version: string;
  pages: string[];
  audio: string[];
}

async function list(): Promise<OfflineList | null> {
  try {
    const res = await fetch(`${BASE_PATH}/offline.json`, { cache: "no-cache" });
    return res.ok ? ((await res.json()) as OfflineList) : null;
  } catch {
    return null;
  }
}

function supported(): boolean {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator;
}

export async function offlineStatus(): Promise<OfflineStatus> {
  if (!supported()) return { supported: false, state: "idle", done: 0, total: 0 };
  const l = await list();
  if (!l) return { supported: false, state: "idle", done: 0, total: 0 };
  const total = l.audio.length + l.pages.length;
  try {
    const [audio, pages] = await Promise.all([caches.open(AUDIO_CACHE), caches.open(PAGES_CACHE)]);
    const [a, p] = await Promise.all([audio.keys(), pages.keys()]);
    const have = new Set([...a, ...p].map((r) => new URL(r.url).pathname));
    const done = [...l.audio, ...l.pages].filter((u) => have.has(u)).length;
    return { supported: true, state: done >= total ? "done" : "idle", done, total };
  } catch {
    return { supported: true, state: "idle", done: 0, total };
  }
}

export async function downloadForOffline(onProgress: (s: OfflineStatus) => void): Promise<void> {
  const l = await list();
  if (!l) return;
  const total = l.audio.length + l.pages.length;
  let done = 0;
  onProgress({ supported: true, state: "working", done, total });
  const [audio, pages] = await Promise.all([caches.open(AUDIO_CACHE), caches.open(PAGES_CACHE)]);
  const jobs: [Cache, string][] = [...l.pages.map((u) => [pages, u] as [Cache, string]), ...l.audio.map((u) => [audio, u] as [Cache, string])];
  for (let i = 0; i < jobs.length; i += 6) {
    await Promise.all(
      jobs.slice(i, i + 6).map(async ([cache, u]) => {
        if (!(await cache.match(u))) await cache.add(u).catch(() => undefined);
        done++;
      }),
    );
    onProgress({ supported: true, state: "working", done, total });
  }
  onProgress({ supported: true, state: done >= total ? "done" : "idle", done, total });
}
