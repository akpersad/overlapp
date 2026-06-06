import type { MetadataRoute } from "next";

// Web app manifest (Phase 4 — installable PWA). Next serves this at
// /manifest.webmanifest and links it from <head> automatically. The icons are
// the generated "overlap" mark (scripts/generate-icons.mjs). theme_color is the
// honey brand and background_color the cream base, so the OS chrome matches the
// Phase-7 "Bright & Friendly" theme.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Overlapp",
    short_name: "Overlapp",
    description:
      "A persistent shared group calendar — know when everyone's free before anyone asks.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f0",
    theme_color: "#efa94a",
    categories: ["productivity", "social", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
