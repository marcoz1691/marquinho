import { defineConfig, devices } from "@playwright/test";

const PUERTO = 4173;

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.e2e\.js$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/reporte" }]],
  outputDir: "e2e/resultados",
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: "es-EC",
    timezoneId: "America/Guayaquil",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] }, grepInvert: /@movil/ },
    { name: "movil", use: { ...devices["Pixel 7"] }, grep: /@movil/ }
  ],
  webServer: {
    command: `python3 -m http.server ${PUERTO}`,
    url: `http://localhost:${PUERTO}/index.html`,
    reuseExistingServer: !process.env.CI
  }
});
