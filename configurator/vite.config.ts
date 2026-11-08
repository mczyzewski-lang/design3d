/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Aplikacja serwowana przez istniejący serwer Express pod /konfigurator/
export default defineConfig({
  base: '/konfigurator/',
  plugins: [react(), tailwindcss()],
  // tryb dev: API Stair Studio z serwera Express (npm start w katalogu głównym)
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // dwie strony: konfigurator (index.html) i landing strony głównej (landing.html, serwowany pod „/”)
      input: { main: 'index.html', landing: 'landing.html' },
      output: {
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler|zustand|use-sync-external-store)\//.test(id)) return 'react';
          if (id.includes('node_modules/three') || id.includes('@react-three') || id.includes('camera-controls') || id.includes('three-stdlib')) return 'three';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
