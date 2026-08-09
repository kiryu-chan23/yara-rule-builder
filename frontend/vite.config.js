import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tailwind v4 is a Vite plugin — there is no tailwind.config.js and no
// PostCSS config. Guides telling you to run `npx tailwindcss init` are v3.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev proxy: the browser calls /api/... on :5173 and Vite forwards to
    // Flask on :5000. This is why api/client.js uses relative URLs — in
    // production Flask serves the built frontend from its own origin, so
    // the same relative path works with no code change.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // backend/config.py expects the build here.
    outDir: 'dist',
  },
})
