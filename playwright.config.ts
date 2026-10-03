import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run in WebKit (Safari's engine) at iPhone size, against
// the app's own dev server. The Supabase address and key below are the local
// copy's placeholders: these tests don't need a running database yet.
const PORT = 5174

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'iPhone (WebKit)', use: { ...devices['iPhone 14'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_placeholder',
    },
  },
})
