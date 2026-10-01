import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // C4 sim service (docs/simulation-dto.md §3) is a separate Node process.
  // Same-origin /sim/* in dev so the SPA stays "fetches the service" without
  // CORS. The service default port is 4040 (service/ npm start).
  server: {
    proxy: {
      '/sim': {
        target: 'http://localhost:4040',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sim/, ''),
      },
    },
  },
})
