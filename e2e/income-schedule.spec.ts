import { expandSchedule, expect, test, type Page } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY, type FinanceDocument } from '../src/index';

/** 为浏览器提供可重复的合成方案，刷新保留测试中的主动保存，喵~ */
async function seed(page: Page, document?: FinanceDocument) {
  const value = document ?? createDocument('2026-10');
  if (!document) value.plan = { ...value.plan, initialAssets: 600000, investmentReturn: { annualRate: 0.08 },
    activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }],
    currentExpenses: [{ amount: 120000, growth: { kind: 'fixed' }, durationMonths: null }] };
  await page.addInitScript(({ key, json }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, json);
  }, { key: DEFAULT_STORAGE_KEY, json: JSON.stringify(value) });
}

test('工作、空档和再就业连续配置，保存刷新及删除取消均正确', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  const income = dialog.getByRole('region', { name: '收入阶段', exact: true });
  await expandSchedule(page, '收入');
  const current = income.getByRole('region', { name: '当前阶段', exact: true });
  const add = income.getByRole('button', { name: '＋ 添加下一阶段', exact: true });
  const save = dialog.getByRole('button', { name: '完成并保存', exact: true });
  await expect(add).toBeDisabled();
  await current.getByLabel('收入持续期限').selectOption('finite');
  await current.getByLabel('持续时长').fill('5');
  await current.getByLabel('时间单位').selectOption('months');
  await expect(current.getByLabel('持续时长')).toHaveValue('60');
  await expect(current).toContainText('第 1～60 月');
  await add.click();
  const second = income.getByRole('region', { name: '阶段 2', exact: true });
  await expect(save).toBeDisabled();
  await second.getByLabel('阶段开始时的税后年收入').fill('0');
  await second.getByLabel('收入持续期限').selectOption('finite');
  await second.getByLabel('持续时长').fill('1');
  await expect(second).toContainText('第 61～72 月');
  await add.click();
  const third = income.getByRole('region', { name: '阶段 3', exact: true });
  await third.getByLabel('阶段开始时的税后年收入').fill('120000');
  await expandSchedule(page, '收入');
  await third.getByLabel('收入增长方式').selectOption('custom');
  await third.getByLabel('收入年增长率').fill('3');
  await expect(third).toContainText('第 73 月起，不限期');
  await save.click();
  await page.reload();
  const card = page.getByRole('button', { name: /年收入.*共 3 个阶段/ });
  await expect(card).toBeVisible();
  const original = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  expect(JSON.parse(original!).plan.activeIncome).toEqual([
    { amount: 240000, growth: { kind: 'fixed' }, durationMonths: 60 },
    { amount: 0, growth: { kind: 'fixed' }, durationMonths: 12 },
    { amount: 120000, growth: { kind: 'custom', annualRate: 0.03 }, durationMonths: null },
  ]);
  await card.click();
  await expandSchedule(page, '收入');
  await expect(dialog.locator('[data-plan-field="income"]')).toHaveAttribute('data-highlighted', 'true');
  await second.getByRole('button', { name: '删除阶段 2' }).click();
  await expect(second).toContainText('第 61 月起，不限期');
  await expect(second.getByLabel('阶段开始时的税后年收入')).toHaveValue('120000');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
  await card.click();
  await expandSchedule(page, '收入');
  await expect(third.getByLabel('收入年增长率')).toHaveValue('3');
  await second.getByRole('button', { name: '删除阶段 2' }).click();
  await save.click();
  await expect(page.getByRole('button', { name: /年收入.*共 2 个阶段/ })).toBeVisible();
});

test('有限期限与空金额校验，零收入可保存且回显停止时间', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  const income = dialog.getByRole('region', { name: '收入阶段', exact: true });
  await expandSchedule(page, '收入');
  const current = income.getByRole('region', { name: '当前阶段', exact: true });
  const save = dialog.getByRole('button', { name: '完成并保存', exact: true });
  await current.getByLabel('收入持续期限').selectOption('finite');
  await current.getByLabel('持续时长').fill('0.1');
  await expect(current).toContainText('持续时间须为 1～1200 个完整月');
  await expect(save).toBeDisabled();
  await current.getByLabel('持续时长').fill('1.5');
  await dialog.getByLabel('税后年主动收入', { exact: true }).fill('');
  await expect(save).toBeDisabled();
  await dialog.getByLabel('税后年主动收入', { exact: true }).fill('0');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('button', { name: /年收入.*持续 18 个月后停止/ })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`分段收入在 ${width}px 无横向溢出，底部保存和草稿预测持续可见`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page); await page.goto('/?panel=plan');
    const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
    const income = dialog.getByRole('region', { name: '收入阶段', exact: true });
    await expandSchedule(page, '收入');
    const current = income.getByRole('region', { name: '当前阶段', exact: true });
    await current.getByLabel('收入持续期限').selectOption('finite');
    await current.getByLabel('持续时长').fill('5');
    await income.getByRole('button', { name: '＋ 添加下一阶段', exact: true }).click();
    const second = income.getByRole('region', { name: '阶段 2', exact: true });
    await second.getByLabel('阶段开始时的税后年收入').fill('120000');
    await expandSchedule(page, '收入');
    await second.getByLabel('收入增长方式').selectOption('custom');
    await second.getByLabel('收入年增长率').fill('2.5');
    await expect(dialog.getByRole('button', { name: '完成并保存', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('region', { name: '草稿预测' })).toBeInViewport({ ratio: 1 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await second.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`income-${width}.png`) });
  });
}

test('当前达成后发生资金不足，总览与草稿仍展示不足月份', async ({ page }) => {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 1000, horizonMonths: 12, investmentReturn: { annualRate: 0 },
    activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: 1 }], currentExpenses: [{ amount: 12000, growth: { kind: 'fixed' }, durationMonths: null }] };
  document.goals = [{ id: 'target', name: '资产目标', left: { kind: 'assets', basis: 'nominal' }, right: { kind: 'amount', amount: 1000, unit: 'capital', basis: 'nominal' }, ratio: 1, comparison: 'scenario' }];
  document.preferences.primaryGoalId = 'target';
  await seed(page, document); await page.goto('/');
  await expect(page.getByText('预测期内第 2 月资金不足，不继续模拟借款。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /年收入/ }).click();
  await expect(page.getByRole('region', { name: '草稿预测' })).toContainText('预测期内第 2 月资金不足');
});
