/** localStorage key of the whole app state (see lib/store.ts). */
export const STORAGE_KEY = "b2sprint:v1";

/** Base path of the static export ("/b2" on GitHub Pages, "" locally when overridden). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
