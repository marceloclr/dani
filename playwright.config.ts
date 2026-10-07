import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: { baseURL: "http://localhost:4173", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  webServer: { command: "npm run preview -- --port 4173 --strictPort", port: 4173, reuseExistingServer: true },
  outputDir: "e2e/resultados",
});
