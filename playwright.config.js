import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "python3 -m http.server 4173",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium",
    },
  },
});
