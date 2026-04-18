import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "node tests/e2e-server.js",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
