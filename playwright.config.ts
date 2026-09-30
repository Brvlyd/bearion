import { defineConfig, devices } from '@playwright/test'

// Two suites share one runner (Playwright compiles TypeScript and resolves the
// "@/..." path alias, so no extra test framework is needed):
//
//   npm test          -> tests/unit: pure logic and API route guards. No browser,
//                        no network, no database. Safe to run anywhere.
//   npm run test:e2e  -> tests/e2e: read-only smoke tests through a real browser.
//                        Starts `npm run dev` unless BASE_URL points at a running
//                        site. They only read public pages — nothing is written to
//                        the database, so they are safe against production data.

const baseURL = process.env.BASE_URL || 'http://localhost:3000'

export default defineConfig({
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [
    {
      name: 'unit',
      testDir: './tests/unit',
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      timeout: 60_000,
      retries: process.env.CI ? 1 : 0,
      use: {
        ...devices['Desktop Chrome'],
        baseURL,
        trace: 'retain-on-failure',
      },
    },
  ],
  webServer:
    process.env.BASE_URL || !process.argv.some((arg) => arg.includes('e2e'))
      ? undefined
      : {
          command: 'npm run dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 180_000,
        },
})
