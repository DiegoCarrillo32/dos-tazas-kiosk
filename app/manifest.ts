import type { MetadataRoute } from "next";

// Matches the light-mode viewport.themeColor in app/layout.tsx — a
// manifest only carries one theme_color, so dark mode stays covered by
// that existing <meta> pair rather than this file.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dos Tazas POS",
    short_name: "Dos Tazas",
    description: "Point of Sale system for Dos Tazas",
    start_url: "/pos/floor",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
