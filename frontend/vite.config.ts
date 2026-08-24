import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Backend (Node/Express) listens on port 3000 in dev.
      // Prefixes match the backend routes 1:1, so no rewrite is needed.
      '/feed': 'http://localhost:3000',
      '/rss': 'http://localhost:3000',
      '/digest': 'http://localhost:3000',
      '/telegram': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
})
