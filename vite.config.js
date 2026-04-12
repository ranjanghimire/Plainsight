import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Expose .env / .env.test / .env.test.local (etc.) to process.env for Vitest (VITEST_* and overrides).
  const loaded = loadEnv(mode, process.cwd(), '')
  for (const key of Object.keys(loaded)) {
    if (process.env[key] === undefined) process.env[key] = loaded[key]
  }

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // public/ (manifest.json, sw.js, icons/) is copied to dist root automatically
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      // Paid + Supabase category tests need headroom (hydration, two pushes, remote polls).
      testTimeout: 120_000,
      hookTimeout: 120_000,
      maxConcurrency: 1,
      sequence: { concurrent: false },
      // Paid tests share one Supabase project; parallel files race on clearSupabaseTables / categories.
      fileParallelism: false,
    },
  }
})
