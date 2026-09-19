import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    pool: 'threads',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `virtual:pwa-register` only exists at build time via vite-plugin-pwa.
      // Point it at a local stub so Vite can resolve the import under
      // Vitest; `src/test/setup.ts` then mocks its behavior.
      'virtual:pwa-register': path.resolve(
        __dirname,
        './src/test/virtualPwaRegisterStub.ts',
      ),
    },
  },
})
