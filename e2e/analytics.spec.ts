import { expect, test, type Page } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

async function commands(page: Page) {
  return page.evaluate(() => (window.dataLayer ?? []).map((args) => Array.from(args as unknown[])));
}

test('生产 GA 页面去重、核心字段保存和评估埋点不包含财务数值', async ({ page, baseURL }) => {
  test.skip(new URL(baseURL!).hostname !== 'freedom-countdown.waynegong.com', 'GA 只在生产域名开启');
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000, inflationRate: 0.03, investmentReturn: { annualRate: 0.08 }, activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }], currentExpenses: [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }] };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
  await page.goto('/?private=never-send-this#private-anchor');
  await expect.poll(async () => (await commands(page)).filter(([, name]) => name === 'page_view').length).toBe(1);
  await page.getByRole('button', { name: /当前可投资资产/ }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('765432');
  await page.getByRole('button', { name: '完成并保存', exact: true }).click();
  await expect.poll(async () => (await commands(page)).filter(([, name]) => name === 'plan_save').length).toBe(1);
  expect((await commands(page)).filter(([, name]) => name === 'page_view')).toHaveLength(1);
  await page.getByRole('link', { name: '评估', exact: true }).click();
  await page.getByLabel('消费金额', { exact: true }).fill('12345');
  await expect.poll(async () => (await commands(page)).filter(([, name]) => name === 'evaluation_run').length).toBe(1);
  await page.getByRole('link', { name: '总览', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(async () => (await commands(page)).filter(([, name]) => name === 'page_view').length).toBe(3);
  await page.goBack();
  await expect.poll(async () => (await commands(page)).filter(([, name]) => name === 'evaluation_open').length).toBe(2);
  const events = await commands(page);
  expect(events.filter(([, name]) => name === 'page_view')).toHaveLength(4);
  expect(events.filter(([, name]) => name === 'evaluation_run')).toHaveLength(1);
  expect(events).toContainEqual(['event', 'plan_field_save', { field_name: 'assets' }]);
  expect(JSON.stringify(events)).not.toMatch(/765432|12345|never-send-this|private-anchor/);
});
