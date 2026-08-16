import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // The suite never reaches Supabase; every call is intercepted in the browser.
    env: {
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'stub-publishable-key',
    },
  },
})
