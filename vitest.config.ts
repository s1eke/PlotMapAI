import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      'virtual:pwa-register/react': resolve(__dirname, './src/test/mocks/pwaRegisterReact.ts'),
    },
  },
});
