import { defineConfig } from '@playwright/test'

// End-to-end tests run in the locally installed Chrome (GitHub's Ubuntu runners ship Chrome too),
// so no browser download is needed. By default they build and serve the app locally; set
// E2E_BASE_URL to run the same suite against a deployed copy, e.g.
//   E2E_BASE_URL=https://jeffmilamba-co.github.io/nebula-kit-dashboard/ npx playwright test
const PORT = 4175
const external = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: external ?? `http://127.0.0.1:${PORT}/`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, grep: /@mobile|@a11y/ },
  ],
  webServer: external
    ? undefined
    : {
        command: `npx vite build --logLevel error && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
