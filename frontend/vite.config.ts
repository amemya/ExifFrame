/// <reference types="vitest" />
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// NOTE: No server.proxy needed. In dev mode, the Wails AssetServer Middleware
// intercepts /api/* requests BEFORE the Vite dev server receives them.
// Non-API requests fall through to Vite via next.ServeHTTP.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
  },
  test: {
    environment: 'jsdom',
    globals: true,
  }
})
