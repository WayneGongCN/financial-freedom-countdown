import { expect, test } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

test('触屏轻触滑块轨道不跳值，之后仍可精确输入和键盘调整', async ({ page }) => {
  await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划' });
  const input = dialog.getByLabel('当前可投资资产', { exact: true });
  const slider = dialog.getByRole('slider', { name: '当前可投资资产滑块' });
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.8, box.y + box.height / 2);
  await expect(input).toHaveValue('');
  await input.fill('600000');
  await slider.focus(); await page.keyboard.press('ArrowRight');
  await expect(input).toHaveValue('610000');
});

test('触屏在滑块上轻触或纵向滑动不改值，横向拖动才调整草稿', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', '原生连续触摸通过 Chromium CDP 注入；WebKit 的鼠标与键盘由既有用例覆盖');
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000,
    activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }],
    currentExpenses: [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }] };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
  await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划' });
  const slider = dialog.getByRole('slider', { name: '税后年主动收入滑块' });
  const income = dialog.getByLabel('税后年主动收入', { exact: true });
  const content = dialog.locator('div').filter({ has: page.getByRole('slider', { name: '税后年主动收入滑块' }) }).first();
  const session = await page.context().newCDPSession(page);
  const changes: string[] = [];
  await page.exposeFunction('recordSliderChange', (value: string) => changes.push(value));
  await income.evaluate(element => {
    const observer = new MutationObserver(() => { void (window as unknown as { recordSliderChange: (value: string) => Promise<void> }).recordSliderChange((element as HTMLInputElement).value); });
    observer.observe(element, { attributes: true, attributeFilter: ['value'] });
  });
  /** 注入实际触摸序列，让浏览器自行判断滚动及触发 pointercancel，喵~ */
  async function swipe(x: number, y: number, dx: number, dy: number) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8, id: 1 }] });
      await page.waitForTimeout(25);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await slider.scrollIntoViewIfNeeded();
  let box = (await slider.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.8, box.y + box.height / 2);
  await expect(income).toHaveValue('240000');
  const beforeScroll = await content.evaluate(element => element.scrollTop);
  await swipe(box.x + box.width * 0.8, box.y + box.height / 2, 6, -110);
  await expect(income).toHaveValue('240000');
  expect(changes).toEqual([]);
  await expect.poll(() => content.evaluate(element => element.scrollTop)).toBeGreaterThan(beforeScroll);
  await slider.scrollIntoViewIfNeeded();
  box = (await slider.boundingBox())!;
  await swipe(box.x + box.width * 0.24, box.y + box.height / 2, 8, -100);
  await expect(income).toHaveValue('240000');
  expect(changes).toEqual([]);
  await slider.scrollIntoViewIfNeeded();
  box = (await slider.boundingBox())!;
  await swipe(box.x + box.width * 0.3, box.y + box.height / 2, 90, 2);
  expect(Number(await income.inputValue())).toBeGreaterThan(240000);
  expect(changes.length).toBeGreaterThan(0);
  const value = Number(await income.inputValue());
  await slider.focus(); await page.keyboard.press('ArrowRight');
  await expect(income).toHaveValue(String(value + 1000));
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).plan.activeIncome[0].amount, DEFAULT_STORAGE_KEY)).toBe(240000);
});
