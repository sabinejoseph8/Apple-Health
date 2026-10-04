import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run in WebKit (Safari's engine) at iPhone size, against
// the app's own dev server; the security-header tests (csp.spec.ts) use a
// production build served with the live site's headers. The Supabase address
// and key below are the local copy's placeholders: these tests answer every
// database request with made-up data.
const PORT = 5174
const BUILT_PORT = 5175
const env = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_placeholder',
}

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
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      env,
    },
    {
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${BUILT_PORT} --strictPort`,
      url: `http://localhost:${BUILT_PORT}`,
      reuseExistingServer: !process.env.CI,
      env,
    },
  ],
})
