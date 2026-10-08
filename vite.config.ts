import { defineConfig } from 'vite'

// GitHub Pages serves this repo at /tiny-tower-defense/.
// Local dev and the headless playtest leave BASE_PATH unset and use /.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
})
