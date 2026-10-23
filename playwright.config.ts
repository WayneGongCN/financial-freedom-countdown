import { defineConfig, devices } from '@playwright/test';

const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e', fullyParallel: true, retries: 0,
  use: { baseURL: remoteBaseURL ?? 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }, { name: 'webkit', use: { ...devices['iPhone 13'] } }],
  ...(!remoteBaseURL ? { webServer: { command: 'pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI } } : {}),
});
