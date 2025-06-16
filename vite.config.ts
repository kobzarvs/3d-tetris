import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1024, // 1 мегабайт в килобайтах
  },
});