import { expect, test } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

test('历史方案只读升级后可预测总被动收入，确认保存写入新结构', async ({ page }) => {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000,
    investmentReturn: { annualRate: 0.08 },
    activeIncome: { amount: 240000, growth: { kind: 'fixed' } },
    currentExpenses: { amount: 120000, growth: { kind: 'inflation' } } };
  const original = JSON.stringify({ ...document, schemaVersion: 1, modelVersion: '1.0.0',
    plan: { ...document.plan, cashYield: 0.02, investmentReturn: { kind: 'nominal', annualRate: 0.08 } },
    goals: document.goals.map((goal, index) => index < 2 ? { ...goal,
      left: { kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['investment-cash', 'external-income'] } } : goal) });
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: DEFAULT_STORAGE_KEY, value: original });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('被动收入统一按投资总收益与其他被动收入合计测算');
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
  const milestone = page.getByRole('button', { name: /^被动收入覆盖主动收入/ });
  await expect(milestone).not.toContainText('待补充');
  await milestone.click();
  await expect(page.getByLabel('要达成的指标', { exact: true })).toHaveValue('passive-total');
  await expect(page.getByRole('region', { name: '草稿预测' }).locator('strong')).not.toHaveText('—');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: /年收入/ }).click();
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await expect(dialog.getByLabel('收入增长方式', { exact: true })).toHaveValue('fixed');
  await expect(dialog.getByLabel('其他年被动收入（税费后）', { exact: true })).toHaveValue('0');
  await expect(dialog.getByLabel('最多向后预测', { exact: true })).toHaveValue('1200');
  await expect(dialog.getByRole('button', { name: '确认并返回', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '完成并保存', exact: true }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.schemaVersion).toBe(3);
  expect(saved.modelVersion).toBe('3.0.0');
  expect(saved.plan).toEqual(document.plan);
  expect(saved.goals[0].left.components).toEqual(['investment-total', 'external-income']);
  await page.reload();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(milestone).not.toContainText('待补充');
});

test('旧实际收益输入换算一次后展示等价总收益，修改通胀不再联动收益率', async ({ page }) => {
  const document = createDocument('2026-10');
  const original = JSON.stringify({ ...document, schemaVersion: 2, modelVersion: '2.0.0',
    plan: { ...document.plan, initialAssets: 600000, inflationRate: 0.03,
      investmentReturn: { kind: 'real', annualRate: 1.08 / 1.03 - 1 },
      activeIncome: { amount: 240000, growth: { kind: 'fixed' } },
      currentExpenses: { amount: 120000, growth: { kind: 'inflation' } } } });
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: DEFAULT_STORAGE_KEY, value: original });
  await page.goto('/');
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
  await page.getByRole('button', { name: /年化总收益率/ }).click();
  await expect(page.getByLabel('年化总收益率', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('年通胀率', { exact: true })).toHaveValue('3');
  await page.getByLabel('年通胀率', { exact: true }).fill('4');
  await expect(page.getByLabel('年化总收益率', { exact: true })).toHaveValue('8');
  await page.getByRole('button', { name: '完成并保存', exact: true }).click();
  await page.reload();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.plan.investmentReturn.annualRate).toBeCloseTo(0.08, 12);
  expect(Object.keys(saved.plan.investmentReturn)).toEqual(['annualRate']);
  expect(saved.plan.inflationRate).toBe(0.04);
});
