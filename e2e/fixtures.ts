import { test as base, type Page } from '@playwright/test';
export { expect, type Page, type Locator } from '@playwright/test';

/** 生产回归也拦截 GA，避免合成测试污染真实统计。 */
export const test = base.extend<{ analyticsIsolation: void }>({
  analyticsIsolation: [async ({ context }, use) => {
    await context.route(/https:\/\/(www\.googletagmanager\.com|[^/]*google-analytics\.com)\//, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await use();
  }, { auto: true }],
});

/** 显式展开需要编辑的收支阶段，已展开时保持原状态，喵~ */
export async function expandSchedule(page: Page, name: '收入' | '支出') {
  const section = page.getByRole('dialog', { name: '我的计划', exact: true }).getByRole('region', { name: `${name}阶段`, exact: true });
  const details = section.locator('details');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
}
