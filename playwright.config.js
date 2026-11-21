import { defineConfig, devices } from "@playwright/test";

const PUERTO = 4173;
const PUERTO_N42 = 4174;

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
  webServer: [
    {
      command: `python3 e2e/servidor.py ${PUERTO}`,
      url: `http://localhost:${PUERTO}/index.html`,
      reuseExistingServer: !process.env.CI
    },
    // Web de la Notaría 42 (notaria42/), con su propio vercel.json. La usa e2e/notaria42.e2e.js.
    {
      command: `python3 e2e/servidor.py ${PUERTO_N42} notaria42`,
      url: `http://localhost:${PUERTO_N42}/index.html`,
      reuseExistingServer: !process.env.CI
    }
  ]
});
