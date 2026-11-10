/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets VITE_BASE. Local dev uses /.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  // The dataset loader (src/app/loader.worker.ts) is an ES module worker.
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // React changes far less often than the app, so it gets its own long-cached chunk.
          // Everything else splits along the lazy-loaded pages (see src/app/pages.ts).
          groups: [{ name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Run tests in a non-UTC zone so any accidental local-time parsing shows up.
    env: { TZ: 'America/Los_Angeles' },
  },
})
