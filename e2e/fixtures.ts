import { test as base } from '@playwright/test';
export { expect, type Page, type Locator } from '@playwright/test';

/** 生产回归也拦截 GA，避免合成测试污染真实统计。 */
export const test = base.extend<{ analyticsIsolation: void }>({
  analyticsIsolation: [async ({ context }, use) => {
    await context.route(/https:\/\/(www\.googletagmanager\.com|[^/]*google-analytics\.com)\//, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await use();
  }, { auto: true }],
});
