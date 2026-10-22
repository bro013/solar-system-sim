import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The lazily loaded 3D view chunk is mostly three.js (~570 kB minified, ~140 kB gzipped).
    chunkSizeWarningLimit: 700,
  },
})
