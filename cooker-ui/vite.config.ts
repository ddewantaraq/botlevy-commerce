import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  envDir: monorepoRoot,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Avoid workbox terser worker-pool hang when os.cpus() is empty (CI/sandbox).
      minify: false,
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Botlevy Cooker",
        short_name: "Cooker",
        description: "Botlevy cooker — pantry chat, quote, and pay on BSC Testnet",
        theme_color: "#c45c26",
        background_color: "#1a1512",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
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
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      // Installability only — no offline asset/API caching.
      workbox: {
        globPatterns: [],
        navigateFallback: null,
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5174 },
  define: { global: "globalThis" },
  resolve: {
    alias: {
      buffer: "buffer/",
      "@botlevy-commerce/shared": path.resolve(monorepoRoot, "packages/commerce-shared/src/index.ts"),
    },
  },
  optimizeDeps: { include: ["buffer", "siwe"] },
});
