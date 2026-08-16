import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Playwright owns e2e/; vitest must not try to collect those specs.
    include: ['src/**/*.test.{ts,tsx}'],
    // Components reach the Supabase module through the album helpers, and it
    // refuses to load unconfigured. Tests mock every call; these only let the
    // client be constructed.
    env: {
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'stub-publishable-key',
    },
  },
})
