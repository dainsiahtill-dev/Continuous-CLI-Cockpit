import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import { resolve } from 'node:path'

const rendererOnly = process.env.CONTINUOUS_RENDERER_ONLY === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    !rendererOnly &&
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: ['node-pty'],
              },
            },
          },
        },
        {
          entry: 'electron/preload.ts',
          vite: {
            build: {
              lib: {
                entry: 'electron/preload.ts',
                fileName: () => 'preload.cjs',
                formats: ['cjs'],
              },
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: ['electron'],
              },
            },
          },
        },
      ]),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 8438,
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: true,
  },
})
