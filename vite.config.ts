/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { LIVE_DATABASE, testHeaders } from './csp-config.ts'
import { pickPublicValues } from './env-config.ts'
import { DEMO_URL } from './src/demo/constants.ts'

export default defineConfig(({ mode }) => {
  // The demo build (D95): made-up data only. It reads no environment at all, so none of the
  // project's keys or addresses can reach it, and it swaps the app's empty demo hook for the
  // demo's setup (src/demo/install.ts). The live build never contains that file.
  if (mode === 'demo') {
    return {
      plugins: [react()],
      envPrefix: '__CLARIVI_NONE__',
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(DEMO_URL),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('demo-publishable-key'),
        'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(''),
      },
      resolve: { alias: [{ find: /^\.\/demo\/boot$/, replacement: fileURLToPath(new URL('./src/demo/install.ts', import.meta.url)) }] },
      build: { outDir: 'dist-demo', emptyOutDir: true },
      preview: { headers: testHeaders(DEMO_URL) },
    }
  }
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const values = pickPublicValues(env)
  return {
    plugins: [react()],
    // Expose nothing from the environment automatically; only the values
    // picked above are written into the app.
    envPrefix: '__CLARIVI_NONE__',
    define: Object.fromEntries(
      Object.entries(values).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
    ),
    // `vite preview` serves a build with the live site's security headers
    // (vercel.json), pointed at this build's database; the screen tests use it.
    preview: { headers: testHeaders(values.VITE_SUPABASE_URL || LIVE_DATABASE) },
    test: { include: ['src/**/*.test.ts', '*.test.ts'] },
  }
})
