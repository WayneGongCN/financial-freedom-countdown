import { expandSchedule, expect, test, type Page } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY, type FinanceDocument } from '../src/index';

/** 使用固定月份和零收益方案验证阶段切换，刷新时保留明确保存的配置，喵~ */
async function seed(page: Page) {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 3000000, inflationRate: 0, investmentReturn: { annualRate: 0 },
    activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }],
    currentExpenses: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }] };
  await page.addInitScript(({ key, json }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, json);
  }, { key: DEFAULT_STORAGE_KEY, json: JSON.stringify(document) });
}

test('房贷结束后支出和目标降低，末段校验、保存刷新及取消均正确', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  const expenses = dialog.getByRole('region', { name: '支出阶段', exact: true });
  const income = dialog.getByRole('region', { name: '收入阶段', exact: true });
  await expect(expenses.locator('details')).not.toHaveAttribute('open');
  await expect(income.locator('details')).not.toHaveAttribute('open');
  await expandSchedule(page, '支出'); await expandSchedule(page, '收入');
  const current = expenses.getByRole('region', { name: '当前阶段', exact: true });
  const add = expenses.getByRole('button', { name: '＋ 添加下一阶段', exact: true });
  const save = dialog.getByRole('button', { name: '完成并保存', exact: true });
  const preview = dialog.getByRole('region', { name: '草稿预测' });
  await expect(add).toBeDisabled();
  await expect(income).toContainText('2026 年 11 月起');
  await current.getByLabel('支出持续期限').selectOption('finite');
  await current.getByLabel('时间单位').selectOption('months');
  await current.getByLabel('持续时长').fill('2');
  await expect(current).toContainText('第 1～2 月 · 2026 年 11 月～2026 年 12 月');
  await expect(save).toBeDisabled();
  await expect(preview).toContainText('请修正输入');
  await expect(add).toBeEnabled();
  await add.click();
  const second = expenses.getByRole('region', { name: '阶段 2', exact: true });
  await expect(second).toContainText('第 3 月起，不限期 · 2027 年 1 月起');
  await expandSchedule(page, '支出');
  await expect(second.getByLabel('支出增长方式')).toHaveValue('inflation');
  await expect(save).toBeDisabled();
  await second.getByLabel('阶段开始时的年支出').fill('120000');
  await expandSchedule(page, '支出');
  await second.getByLabel('支出增长方式').selectOption('fixed');
  await expect(preview).toContainText(/3\s*个月/);
  await save.click();
  await page.reload();
  const card = page.getByRole('button', { name: /年支出.*共 2 个阶段/ });
  await expect(card).toBeVisible();
  await expect(page.getByText('当前目标 600 万', { exact: true })).toBeVisible();
  const original = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  const saved = JSON.parse(original!) as FinanceDocument;
  expect(saved.schemaVersion).toBe(4);
  expect(saved.modelVersion).toBe('4.0.0');
  expect(saved.plan.currentExpenses).toEqual([
    { amount: 240000, growth: { kind: 'fixed' }, durationMonths: 2 },
    { amount: 120000, growth: { kind: 'fixed' }, durationMonths: null },
  ]);
  await card.click();
  await expandSchedule(page, '支出');
  await expect(dialog.locator('[data-plan-field="expenses"]')).toHaveAttribute('data-highlighted', 'true');
  await second.getByRole('button', { name: '删除阶段 2' }).click();
  await expect(save).toBeDisabled();
  await expect(add).toBeEnabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
  await card.click();
  await expandSchedule(page, '支出');
  await expect(second.getByLabel('阶段开始时的年支出')).toHaveValue('120000');
  await second.getByLabel('阶段开始时的年支出').fill('0');
  await expect(save).toBeEnabled();
  await save.click();
});

for (const width of [320, 390]) {
  test(`收支阶段在 ${width}px 可独立编辑，年月换算正确且无横向溢出`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page); await page.goto('/?panel=plan');
    const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
    await expandSchedule(page, '收入'); await expandSchedule(page, '支出');
    for (const name of ['收入', '支出']) {
      const schedule = dialog.getByRole('region', { name: `${name}阶段`, exact: true });
      const current = schedule.getByRole('region', { name: '当前阶段', exact: true });
      await current.getByLabel(`${name}持续期限`).selectOption('finite');
      await current.getByLabel('持续时长').fill('1.5');
      await current.getByLabel('时间单位').selectOption('months');
      await expect(current.getByLabel('持续时长')).toHaveValue('18');
      await schedule.getByRole('button', { name: '＋ 添加下一阶段' }).click();
      const second = schedule.getByRole('region', { name: '阶段 2', exact: true });
      await second.getByLabel(name === '收入' ? '阶段开始时的税后年收入' : '阶段开始时的年支出').fill('120000');
      await second.getByLabel(`${name}增长方式`).selectOption('custom');
      await second.getByLabel(`${name}年增长率`).fill('2.5');
      expect(await second.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await expect(dialog.getByRole('button', { name: '完成并保存', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('region', { name: '草稿预测' })).toBeInViewport({ ratio: 1 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`expenses-${width}.png`) });
  });
}
