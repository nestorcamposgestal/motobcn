import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Listen on every interface: a Windows browser reaches WSL that way, and so does a phone on the same network.
  server: { host: true },
  preview: { host: true },
  // Two pages: the landing page at the root and the map app under app/.
  build: { rollupOptions: { input: { home: "index.html", app: "app/index.html" } } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "MotoBCN",
        short_name: "MotoBCN",
        description: "Dónde aparcar la moto en Barcelona, también en la acera.",
        lang: "es",
        start_url: "app/",
        display: "standalone",
        background_color: "#F7F4EE",
        theme_color: "#1F3C6E",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "marca.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // The tiles are large and read with range requests: they stay on the network, never in the precache.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,pbf}"],
        globIgnores: ["**/*.pmtiles", "preview.jpg", "landing/**", "data/**", "**/*-{cyrillic,cyrillic-ext,greek,vietnamese}-*"],
        // Offline, any app address opens the app; the landing page is precached as itself.
        navigateFallback: "app/index.html",
        navigateFallbackAllowlist: [/\/app\//],
      },
    }),
  ],
});
