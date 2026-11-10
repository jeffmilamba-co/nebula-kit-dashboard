/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets VITE_BASE. Local dev uses /.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Run tests in a non-UTC zone so any accidental local-time parsing shows up.
    env: { TZ: 'America/Los_Angeles' },
  },
})
