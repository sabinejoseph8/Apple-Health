/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { pickPublicValues } from './env-config.ts'

export default defineConfig(({ mode }) => {
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
    test: { include: ['src/**/*.test.ts', '*.test.ts'] },
  }
})
