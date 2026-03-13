import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        proxyTimeout: 200000,  // 200с — IAP может быть медленным
        timeout: 200000,
      }
    }
  }
})
