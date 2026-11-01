import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

/** 为赞赏交互回归准备已完整配置的合成计划，喵~ */
async function seedCompletePlan(page: Page) {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000,
    activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }],
    currentExpenses: [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }] };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
}

test('新用户及未保存草稿不显示赞赏，完整保存后显示，缺少配置时重新隐藏', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '赞赏', exact: true, includeHidden: true });
  await expect(trigger).toHaveCount(0);
  await page.getByLabel('当前年支出', { exact: true }).fill('120000');
  await expect(trigger).toHaveCount(0);
  await page.getByRole('button', { name: '填写我的计划' }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('0');
  await page.getByLabel('税后年主动收入', { exact: true }).fill('240000');
  await expect(trigger).toHaveCount(0);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(trigger).toHaveCount(0);
  await page.getByRole('button', { name: '填写我的计划' }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('0');
  await page.getByLabel('税后年主动收入', { exact: true }).fill('240000');
  await page.getByRole('button', { name: '完成并保存' }).click();
  await expect(trigger).toBeVisible();
  await page.reload();
  await expect(trigger).toBeVisible();
  await page.getByRole('link', { name: '评估', exact: true }).click();
  await expect(trigger).toBeVisible();
  await page.getByRole('button', { name: '调整当前计划' }).click();
  await page.getByLabel('年化总收益率', { exact: true }).fill('');
  await page.getByRole('button', { name: '完成并保存' }).click();
  await expect(trigger).toHaveCount(0);
  await page.reload();
  await expect(trigger).toHaveCount(0);
});

test('赞赏选择、原图下载、遮罩与键盘关闭，保持原页面状态', async ({ page }) => {
  await seedCompletePlan(page);
  await page.goto('/');
  const header = page.locator('header').first();
  const trigger = header.getByRole('button', { name: '赞赏', exact: true });
  await expect(header.getByRole('link', { name: '口径说明 ↗' })).toHaveCount(0);
  await expect(trigger).toHaveCSS('color', 'rgb(253, 76, 192)');
  const scroll = page.locator('#main-content');
  await scroll.evaluate(element => { element.scrollTop = 100; });
  const position = await scroll.evaluate(element => element.scrollTop);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '感谢支持' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  for (const [label, file] of [['微信', 'wechat-reward-code.jpg'], ['支付宝', 'alipay-reward-code.jpg'], ['Buy Me a Coffee', 'buy-me-a-coffee-reward-code.png']]) {
    await dialog.getByRole('radio', { name: label, exact: true }).click();
    await expect(dialog.getByRole('img')).toHaveJSProperty('complete', true);
    expect(await dialog.getByRole('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('link', { name: '保存图片' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(file);
    expect(await download.failure()).toBeNull();
    expect(await readFile((await download.path())!)).toEqual(await readFile(new URL(`../app/assets/${file}`, import.meta.url)));
  }
  await dialog.getByRole('button', { name: '关闭' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await scroll.evaluate(element => element.scrollTop)).toBe(position);
  await trigger.click();
  await expect(dialog.getByRole('radio', { name: '微信' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(10, 10);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('窄屏和低屏幕高度下保存按钮可见，键盘焦点留在弹层内', async ({ page }) => {
  await seedCompletePlan(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/evaluate');
  await page.getByRole('button', { name: '赞赏', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '感谢支持' });
  const save = dialog.getByRole('link', { name: '保存图片' });
  await expect(save).toBeInViewport({ ratio: 1 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await save.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/evaluate$/);
});
