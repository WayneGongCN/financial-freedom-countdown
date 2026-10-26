import { expect, test, type Page } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

/** 使用合成方案验证同一编辑会话中的全部配置，不读取用户数据，喵~ */
async function seed(page: Page) {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000, inflationRate: 0.03,
    investmentReturn: { annualRate: 0.08 }, activeIncome: { amount: 240000, growth: { kind: 'fixed' } },
    currentExpenses: { amount: 120000, growth: { kind: 'inflation' } } };
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
  const budgetSelect = dialog.getByRole('combobox', { name: '自由后预算来源', exact: true });
  await expect(budgetSelect).toHaveValue('current');
  const budgetSelectBox = (await budgetSelect.boundingBox())!;
  const budgetLabelBox = (await dialog.getByText('自由后预算来源', { exact: true }).boundingBox())!;
  expect(budgetLabelBox.x).toBeLessThan(budgetSelectBox.x);
  expect(Math.abs(budgetLabelBox.y + budgetLabelBox.height / 2 - budgetSelectBox.y - budgetSelectBox.height / 2)).toBeLessThan(2);
  await expect(dialog.getByRole('radiogroup', { name: '自由后预算来源', exact: true })).toHaveCount(0);
  await page.getByLabel('收入增长方式', { exact: true }).selectOption('custom');
  await page.getByLabel('收入年增长率', { exact: true }).fill('5');
  await page.getByLabel('支出增长方式', { exact: true }).selectOption('custom');
  await page.getByLabel('支出年增长率', { exact: true }).fill('2');
  await page.getByLabel('其他年被动收入（税费后）', { exact: true }).fill('12000');
  await page.getByLabel('其他被动收入增长方式', { exact: true }).selectOption('custom');
  await page.getByLabel('其他被动收入年增长率', { exact: true }).fill('1');
  await page.getByRole('combobox', { name: '自由后预算来源', exact: true }).selectOption('custom');
  await page.getByLabel('自由后年支出', { exact: true }).fill('180000');
  await page.getByLabel('自由后预算增长方式', { exact: true }).selectOption('inflation');
  await dialog.getByRole('region', { name: '自由后生活预算', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/plan-budget-${test.info().project.name}.png` });
  await page.getByLabel('最多向后预测', { exact: true }).fill('600');
  await expect(page).toHaveURL(/\?panel=plan$/);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(preview).toBeInViewport({ ratio: 1 });
  await expect.poll(() => preview.innerText()).not.toBe(originalForecast);
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
  await dialog.getByRole('button', { name: '完成并保存', exact: true }).click();
  await page.reload();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).plan, DEFAULT_STORAGE_KEY);
  expect(saved.activeIncome.growth).toEqual({ kind: 'custom', annualRate: 0.05 });
  expect(saved.currentExpenses.growth).toEqual({ kind: 'custom', annualRate: 0.02 });
  expect(saved.externalIncome).toEqual({ amount: 12000, growth: { kind: 'custom', annualRate: 0.01 } });
  expect(saved.retirementBudget).toEqual({ kind: 'custom', flow: { amount: 180000, growth: { kind: 'inflation' } } });
  expect(saved.horizonMonths).toBe(600);
  await page.getByRole('button', { name: /年收入/ }).click();
  await expect(page.getByLabel('收入增长方式', { exact: true })).toHaveValue('custom');
  await expect(page.getByLabel('收入年增长率', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('其他年被动收入（税费后）', { exact: true })).toHaveValue('12000');
  await expect(dialog.getByRole('combobox', { name: '自由后预算来源', exact: true })).toHaveValue('custom');
  await expect(page.getByLabel('自由后年支出', { exact: true })).toHaveValue('180000');
  await expect(page.getByLabel('最多向后预测', { exact: true })).toHaveValue('600');
});

test('其他被动收入增加积累速度，预算下拉切换保留草稿且取消不提交', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  const preview = dialog.getByRole('region', { name: '草稿预测' });
  const original = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  const before = await preview.innerText();
  const external = page.getByLabel('其他年被动收入（税费后）', { exact: true });
  await external.fill('12000');
  await expect.poll(() => preview.innerText()).not.toBe(before);
  await expect(preview).toContainText('3,000,000 元');
  await page.getByRole('combobox', { name: '自由后预算来源', exact: true }).selectOption('custom');
  await page.getByLabel('自由后年支出', { exact: true }).fill('180000');
  await page.getByRole('combobox', { name: '自由后预算来源', exact: true }).selectOption('current');
  await expect(page.getByLabel('自由后年支出', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: '自由后预算来源', exact: true }).selectOption('custom');
  await expect(page.getByLabel('自由后年支出', { exact: true })).toHaveValue('180000');
  await expect(dialog.getByRole('button', { name: /说明.*↗/ })).toHaveCount(0);
  await expect(dialog.getByRole('link')).toHaveCount(0);
  await expect(page).toHaveURL(/\?panel=plan$/);
  await expect(dialog).toBeVisible();
  await expect(external).toHaveValue('12000');
  await expect(page.getByLabel('自由后年支出', { exact: true })).toHaveValue('180000');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
});

test('旧计划子页深链接直接进入完整主面板，后退取消整个计划', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan&step=external');
  await expect(page).toHaveURL(/\?panel=plan$/);
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('年化总收益率', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('其他年被动收入（税费后）', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('最多向后预测', { exact: true })).toHaveValue('1200');
  await page.getByLabel('其他年被动收入（税费后）', { exact: true }).fill('12000');
  await page.getByLabel('收入增长方式', { exact: true }).selectOption('inflation');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: /年收入/ }).click();
  await expect(page.getByLabel('其他年被动收入（税费后）', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('收入增长方式', { exact: true })).toHaveValue('fixed');
  await page.goBack();
  await expect(dialog).not.toBeVisible();
});
