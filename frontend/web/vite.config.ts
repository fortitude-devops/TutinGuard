import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built into ../app (served by FastAPI at /app/). Dev server proxies the API and WebSocket to the backend.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: { outDir: '../app', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: {
      '/api': (process.env.BACKEND || 'http://127.0.0.1:8000'),
      '/ws': { target: (process.env.BACKEND || 'http://127.0.0.1:8000').replace('http', 'ws'), ws: true },
      '/sim': (process.env.BACKEND || 'http://127.0.0.1:8000'),
      '/app/sim': { target: process.env.BACKEND || 'http://127.0.0.1:8000', rewrite: (p: string) => p.replace(/^\/app/, '') },
    },
  },
});
