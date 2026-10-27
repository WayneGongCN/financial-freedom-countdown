import { expandSchedule, expect, test, type Page } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY, type Plan } from '../src/index';

/** 使用合成方案验证同一编辑会话中的全部配置，不读取用户数据，喵~ */
async function seed(page: Page, overrides: Partial<Plan> = {}) {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000, inflationRate: 0.03,
    investmentReturn: { annualRate: 0.08 }, activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }],
    currentExpenses: [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }], ...overrides };
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
}

test('其余计划配置同页修改，实时预测固定且只在最终保存时提交', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  const preview = dialog.getByRole('region', { name: '草稿预测', exact: true });
  const original = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  const originalForecast = await preview.innerText();
  await expect(dialog.getByRole('button', { name: '确认并返回', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '‹ 返回', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /说明.*↗/ })).toHaveCount(0);
  await expect(dialog.getByLabel('其他年被动收入（税费后）', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('自由后预算来源', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/金额基准/)).toHaveCount(0);
  await expandSchedule(page, '收入');
  await page.getByLabel('收入增长方式', { exact: true }).selectOption('custom');
  await page.getByLabel('收入年增长率', { exact: true }).fill('5');
  await expandSchedule(page, '支出');
  await page.getByLabel('支出增长方式', { exact: true }).selectOption('custom');
  await page.getByLabel('支出年增长率', { exact: true }).fill('2');
  await expect(page).toHaveURL(/\?panel=plan$/);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(preview).toBeInViewport({ ratio: 1 });
  await expect.poll(() => preview.innerText()).not.toBe(originalForecast);
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
  await dialog.getByRole('button', { name: '完成并保存', exact: true }).click();
  await page.reload();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).plan, DEFAULT_STORAGE_KEY);
  expect(saved.activeIncome[0].growth).toEqual({ kind: 'custom', annualRate: 0.05 });
  expect(saved.currentExpenses[0].growth).toEqual({ kind: 'custom', annualRate: 0.02 });
  expect(saved.externalIncome).toEqual({ amount: 0, growth: { kind: 'fixed' } });
  expect(saved.retirementBudget).toEqual({ kind: 'current' });
  expect(saved.horizonMonths).toBe(1200);
  await page.getByRole('button', { name: /年收入/ }).click();
  await expandSchedule(page, '收入');
  await expect(page.getByLabel('收入增长方式', { exact: true })).toHaveValue('custom');
  await expect(page.getByLabel('收入年增长率', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('最多向后预测', { exact: true })).toHaveCount(0);
});

test('隐藏项保留已有配置，两个阶段箭头在展开前后尺寸一致', async ({ page }) => {
  const externalIncome = { amount: 12000, growth: { kind: 'fixed' as const } };
  const retirementBudget = { kind: 'custom' as const, flow: { amount: 180000, growth: { kind: 'fixed' as const } } };
  await seed(page, { externalIncome, retirementBudget }); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  const income = dialog.getByRole('region', { name: '收入阶段', exact: true });
  const expenses = dialog.getByRole('region', { name: '支出阶段', exact: true });
  await expect(income.locator('details')).not.toHaveAttribute('open');
  await expect(expenses.locator('details')).not.toHaveAttribute('open');
  const incomeIcon = income.locator('summary svg');
  const expenseIcon = expenses.locator('summary svg');
  for (const icon of [incomeIcon, expenseIcon]) {
    expect(await icon.evaluate((element) => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height }))).toEqual({ width: '16px', height: '16px' });
  }
  await expandSchedule(page, '收入');
  expect(await incomeIcon.evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
  expect(await expenseIcon.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  for (const icon of [incomeIcon, expenseIcon]) {
    expect(await icon.evaluate((element) => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height }))).toEqual({ width: '16px', height: '16px' });
  }
  await page.getByLabel('当前可投资资产', { exact: true }).fill('700000');
  await dialog.getByRole('button', { name: '完成并保存', exact: true }).click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).plan, DEFAULT_STORAGE_KEY);
  expect(saved.externalIncome).toEqual(externalIncome);
  expect(saved.retirementBudget).toEqual(retirementBudget);
  await expect(page.getByText('按当前假设测算', { exact: true })).toHaveCount(0);
});

test('旧计划子页深链接直接进入完整主面板，后退取消整个计划', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan&step=external');
  await expect(page).toHaveURL(/\?panel=plan$/);
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('年化总收益率', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('最多向后预测', { exact: true })).toHaveCount(0);
  await expandSchedule(page, '收入');
  await page.getByLabel('收入增长方式', { exact: true }).selectOption('inflation');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: /年收入/ }).click();
  await expandSchedule(page, '收入');
  await expect(page.getByLabel('收入增长方式', { exact: true })).toHaveValue('fixed');
  await page.goBack();
  await expect(dialog).not.toBeVisible();
});
