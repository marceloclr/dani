import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// BASE permite publicar num subcaminho, ex.: BASE=/dani/ npm run build (GitHub Pages)
export default defineConfig({
  base: process.env.BASE ?? "./",
  plugins: [react()],
  worker: { format: "es" },
  test: { include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 60_000 },
});
