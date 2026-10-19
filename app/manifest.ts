import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "B2 Sprint",
    short_name: "B2 Sprint",
    description: "Seven calm days from B1 to B2.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#faf8f3",
    theme_color: "#faf8f3",
    icons: [
      { src: `${base}/icon.svg`, sizes: "any", type: "image/svg+xml" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
  };
}
