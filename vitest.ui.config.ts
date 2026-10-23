import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', include: ['test-ui/**/*.test.{ts,tsx}'], setupFiles: ['test-ui/setup.ts'] } });
