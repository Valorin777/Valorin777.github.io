import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages: https://valorin777.github.io/b2/
 * Set NEXT_PUBLIC_BASE_PATH="" to serve from the root (e.g. local preview of `out/`).
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/b2";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
