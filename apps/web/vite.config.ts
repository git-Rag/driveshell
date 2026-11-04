import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    strictPort: false, // auto-increment if 5173 is busy
    host: '127.0.0.1',
    proxy: {
      // Forward API calls and OAuth redirect to the Fastify server
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
      '/auth': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
      '/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
