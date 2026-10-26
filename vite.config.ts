import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { seoPlugin } from './seo-build';

export default defineConfig({ plugins: [react(), seoPlugin()], build: { outDir: 'web-dist' }, server: { host: '127.0.0.1' } });
