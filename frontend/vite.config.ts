import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@wails': fileURLToPath(new URL('./src/bridge/wailsjs', import.meta.url)),
      vue: 'vue/dist/vue.esm-bundler.js',
    },
  },
  build: {
    // Target Safari 14 (macOS 11 Big Sur) for maximum compatibility
    // Safari 14 doesn't support many ES2022+ features like Array.at(), Object.hasOwn()
    target: ['es2020', 'safari14', 'chrome87', 'firefox78'],
    assetsInlineLimit: 100 * 1024, // 100KB
    chunkSizeWarningLimit: 4096, // 4MB
    cssCodeSplit: false,
  },
  esbuild: {
    // Production optimizations: remove console.log and debugger in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})

