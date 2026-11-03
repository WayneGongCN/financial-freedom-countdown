import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { seoPlugin } from './seo-build';

/** 仅在配置了发布凭据时生成并上传隐藏的 Source Map，喵~ */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const uploadSourceMaps = command === 'build' && !!(
    env.VITE_SENTRY_DSN && env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT
  );
  return {
    plugins: [
      react(),
      seoPlugin(),
      uploadSourceMaps && sentryVitePlugin({
        authToken: env.SENTRY_AUTH_TOKEN,
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        telemetry: false,
        sourcemaps: { filesToDeleteAfterUpload: 'web-dist/**/*.map' },
      }),
    ],
    build: { outDir: 'web-dist', sourcemap: uploadSourceMaps ? 'hidden' : false },
    server: { host: '127.0.0.1' },
  };
});
