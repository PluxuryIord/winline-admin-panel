import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Second, independent build: the Telegram Mini App. Lives in miniapp/,
// compiles to dist-miniapp/ (served by nginx on app.winlinepartners.ru).
export default defineConfig({
  root: 'miniapp',
  plugins: [react()],
  build: {
    outDir: '../dist-miniapp',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
