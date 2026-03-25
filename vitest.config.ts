import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@app': resolve(__dirname, './src/app'),
      '@domains': resolve(__dirname, './src/domains'),
      '@shared': resolve(__dirname, './src/shared'),
      '@infra': resolve(__dirname, './src/infra'),
      '@test': resolve(__dirname, './src/test'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/{app,domains,shared,infra}/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    alias: {
      'virtual:pwa-register/react': resolve(__dirname, './src/test/mocks/pwaRegisterReact.ts'),
    },
  },
});
