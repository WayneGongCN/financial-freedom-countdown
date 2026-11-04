import { expect, test } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

test('缺少 hasOwn、at 和 randomUUID 时仍可加载、保存、创建目标与评估', async ({ page }) => {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000,
    activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }],
    currentExpenses: [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }] };
  await page.addInitScript(({ key, value }) => {
    Object.defineProperty(Object, 'hasOwn', { value: undefined, configurable: true });
    Object.defineProperty(Array.prototype, 'at', { value: undefined, configurable: true });
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '财富自由倒计时', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /当前可投资资产/ }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('700000');
  await page.getByRole('button', { name: '完成并保存', exact: true }).click();
  await page.getByRole('button', { name: '＋ 添加', exact: true }).click();
  await page.getByLabel('目标模板').selectOption('amount');
  await page.getByLabel('目标名称').fill('兼容性合成目标');
  await page.getByLabel('目标金额', { exact: true }).fill('1000000');
  await page.getByRole('button', { name: '保存目标', exact: true }).click();
  await expect(page.getByRole('button', { name: /兼容性合成目标/ })).toBeVisible();
  await page.getByRole('button', { name: '赞赏', exact: true }).click();
  const reward = page.getByRole('dialog', { name: '感谢支持' });
  await reward.getByRole('radio', { name: '支付宝', exact: true }).click();
  await expect(reward.getByRole('radio', { name: '支付宝', exact: true })).toHaveAttribute('aria-checked', 'true');
  await reward.getByRole('link', { name: '保存图片' }).focus();
  await page.keyboard.press('Tab');
  await expect(reward.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: '评估', exact: true }).click();
  await page.getByLabel('消费金额', { exact: true }).fill('12345');
  await expect.poll(() => page.evaluate(key => {
    const document = JSON.parse(localStorage.getItem(key)!);
    return document.project?.cashFlows[0]?.amount;
  }, DEFAULT_STORAGE_KEY)).toBe(12345);
  await page.reload();
  await expect(page.getByLabel('消费金额', { exact: true })).toHaveValue('12345');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.plan.initialAssets).toBe(700000);
  const goalId = saved.goals.find((goal: { name: string }) => goal.name === '兼容性合成目标').id;
  for (const id of [goalId, saved.project.id, saved.project.cashFlows[0].id]) {
    expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  }
  expect(new Set([goalId, saved.project.id, saved.project.cashFlows[0].id]).size).toBe(3);
  expect(errors).toEqual([]);
});
