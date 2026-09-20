import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  envDir: monorepoRoot,
  plugins: [react(), tailwindcss()],
  server: { port: 5175 },
  define: { global: "globalThis" },
  resolve: {
    alias: {
      buffer: "buffer/",
      "@botlevy-commerce/shared": path.resolve(monorepoRoot, "packages/commerce-shared/src/index.ts"),
    },
  },
  optimizeDeps: { include: ["buffer", "siwe"] },
});
