import { expect, test, type Page } from '@playwright/test';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

/** 为浏览器准备显式合成数据，不使用真实财务存档，喵~ */
function exampleDocument() {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000, inflationRate: 0.03, investmentReturn: { annualRate: 0.08 },
    activeIncome: { amount: 240000, growth: { kind: 'fixed' } }, currentExpenses: { amount: 120000, growth: { kind: 'inflation' } } };
  document.goals[2]!.name = '资产覆盖生活支出';
  return document;
}

/** 在页面运行前注入合成方案，喵~ */
async function seed(page: Page, inflationRate: number | null = 0.03) {
  const document = exampleDocument();
  document.plan.inflationRate = inflationRate;
  document.preferences.displayBasis = 'real';
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
}

test('首次填写计划，在同一面板设置预测期限并保存恢复', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '离自由，还有多远？' })).toBeVisible();
  await page.getByLabel('当前年支出', { exact: true }).fill('120000');
  await page.getByRole('button', { name: '填写我的计划' }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('600000');
  await page.getByLabel('税后年主动收入', { exact: true }).fill('240000');
  await page.getByLabel('年化总收益率', { exact: true }).fill('8');
  await page.getByLabel('年通胀率', { exact: true }).fill('3');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await expect(dialog.getByLabel('当前年支出', { exact: true })).toHaveValue('120000');
  await expect(dialog.getByLabel('收入增长方式', { exact: true })).toHaveValue('fixed');
  await expect(dialog.getByLabel('支出增长方式', { exact: true })).toHaveValue('inflation');
  await expect(dialog.getByLabel('最多向后预测', { exact: true })).toHaveValue('1200');
  await dialog.getByLabel('最多向后预测', { exact: true }).fill('600');
  await expect(page).toHaveURL(/\?panel=plan$/);
  await expect(dialog.getByRole('button', { name: '确认并返回', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '完成并保存', exact: true }).click();
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.plan.horizonMonths).toBe(600);
});

test('新方案默认不计通胀，填写三项核心参数和资产即可预测', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('当前年支出', { exact: true }).fill('120000');
  await page.getByRole('button', { name: '填写我的计划' }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('600000');
  await page.getByLabel('税后年主动收入', { exact: true }).fill('240000');
  await page.getByLabel('年化总收益率', { exact: true }).fill('8');
  await expect(page.getByRole('region', { name: '草稿预测' })).toContainText('年 9 个月');
  await page.getByRole('button', { name: '完成并保存' }).click();
  await expect(page.getByRole('radiogroup', { name: '金额显示口径', exact: true })).toHaveCount(0);
  await expect(page.getByText('名义金额 · 不计通胀（0%）', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('年 9 个月', { exact: true })).toBeVisible();
});

test('说明锚点往返保留编辑草稿，取消后正式计划不变', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: /工资.*调整假设/ }).click();
  await page.getByLabel('当前年支出', { exact: true }).fill('180000');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await dialog.getByRole('region', { name: '预测期限', exact: true }).getByRole('button', { name: '说明 ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/guide#return-assumptions/);
  await expect(page.getByRole('heading', { name: '收益、通胀与长期假设' })).toBeInViewport();
  await page.getByRole('link', { name: '目标定义与显示口径 ↗' }).click();
  await page.getByRole('button', { name: '‹ 返回', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\?panel=plan$/);
  await expect(dialog.getByLabel('当前年支出', { exact: true })).toHaveValue('180000');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText('当前目标 300 万', { exact: true })).toBeVisible();
});

test('添加购买力目标，评估消费及额外收益，显示口径不改倒计时', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: '＋ 添加', exact: true }).click();
  await page.getByLabel('目标模板').selectOption('amount');
  await page.getByLabel('目标名称').fill('攒够一百万购买力');
  await page.getByLabel('目标金额', { exact: true }).fill('1000000');
  await page.getByRole('radio', { name: '保持购买力', exact: true }).click();
  await page.getByRole('button', { name: '保存目标', exact: true }).click();
  await expect(page.getByRole('button', { name: /攒够一百万购买力/ })).toContainText('2 年 9 个月');
  await page.getByRole('radio', { name: '名义金额', exact: true }).click();
  await expect(page.getByRole('button', { name: /攒够一百万购买力/ })).toContainText('2 年 9 个月');
  await page.getByRole('button', { name: '评估', exact: true }).click();
  await page.getByLabel('消费金额', { exact: true }).fill('10000');
  await expect(page.getByText('预计延后', { exact: true })).toBeVisible();
  await expect(page.getByText('15 年 5 个月 → 15 年 6 个月')).toBeVisible();
  await page.getByText('金额影响', { exact: true }).click();
  await expect(page.getByText('本金投入减少', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: '基准月购买力', exact: true }).click();
  await expect(page.getByText('15 年 5 个月 → 15 年 6 个月')).toBeVisible();
  await page.getByRole('button', { name: '＋ 添加额外收入', exact: true }).click();
  await page.getByLabel('额外收入', { exact: true }).fill('2000');
  await expect(page.getByText('预计提前', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '总览', exact: true }).click();
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
});

test('未来合同付款、有限期限与无效输入不展示旧结果', async ({ page }) => {
  await seed(page); await page.goto('/evaluate');
  await page.getByLabel('消费金额', { exact: true }).fill('10000');
  await page.getByText('时间、增长与收益设置', { exact: true }).click();
  await page.getByLabel('首次发生月份', { exact: true }).fill('2028-10');
  await page.getByRole('radio', { name: '首次发生月报价' }).click();
  await expect(page.getByText('首笔付款 · 2028 年 10 月名义金额')).toBeVisible();
  await page.getByRole('radio', { name: '每月', exact: true }).click();
  await page.getByLabel('结束月份（留空为无限期）').fill('2028-09');
  await expect(page.getByText('结束月份不能早于开始月或超过 1200 个月')).toBeVisible();
  await expect(page.getByText('预计延后', { exact: true })).not.toBeVisible();
});

test('浏览器后退与 Esc 取消整次计划编辑，不落地草稿', async ({ page }) => {
  await seed(page); await page.goto('/');
  const trigger = page.getByRole('button', { name: /工资.*调整假设/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await dialog.getByLabel('当前可投资资产', { exact: true }).fill('700000');
  await dialog.getByLabel('收入增长方式', { exact: true }).selectOption('inflation');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await expect(dialog.getByLabel('当前可投资资产', { exact: true })).toHaveValue('600000');
  await expect(dialog.getByLabel('收入增长方式', { exact: true })).toHaveValue('fixed');
  await dialog.getByLabel('当前可投资资产', { exact: true }).fill('700000');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('已完成 20%')).toBeVisible();
});

for (const width of [320, 375, 390, 430, 1280]) {
  test(`宽度 ${width} 无横向溢出，内容可滚动且导航可见`, async ({ page }) => {
    await seed(page); await page.setViewportSize({ width, height: 844 }); await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const main = page.getByRole('main');
    await main.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByRole('button', { name: '评估一笔消费' })).toBeInViewport();
    if (width === 390) {
      await main.evaluate((element) => { element.scrollTop = 0; });
      await page.screenshot({ path: `test-results/overview-${test.info().project.name}.png` });
    }
  });
}

test('同页调整不增加步骤历史，模态限制焦点且关闭后恢复', async ({ page }) => {
  await seed(page); await page.goto('/');
  const trigger = page.getByRole('button', { name: /工资.*调整假设/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await dialog.getByLabel('收入增长方式', { exact: true }).selectOption('inflation');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\?panel=plan$/);
  await dialog.getByRole('button', { name: '取消', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.goBack();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
});

test('缩短视口后面板按钮仍可见，评估长内容不横向溢出', async ({ page }) => {
  await seed(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/evaluate');
  await page.getByLabel('消费金额', { exact: true }).fill('10000');
  await page.getByText('金额影响', { exact: true }).click();
  await page.screenshot({ path: `test-results/evaluation-${test.info().project.name}.png` });
  await page.getByRole('button', { name: '调整当前计划', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 460 });
  await page.getByLabel('当前可投资资产', { exact: true }).focus();
  await expect(page.getByRole('button', { name: '完成并保存', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('刷新目标指标深链接恢复已提交口径，取消子步骤恢复父草稿', async ({ page }) => {
  await seed(page); await page.goto('/?panel=goal&goal=passive-vs-income&step=left');
  await expect(page.getByRole('button', { name: '确认口径', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '确认口径', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page).toHaveURL(/panel=goal&goal=passive-vs-income$/);
  await expect(page.getByRole('button', { name: '保存目标', exact: true })).toBeVisible();
});

for (const inflation of [null, 0, 0.03, -0.02]) {
  test(`通胀 ${inflation} 的金额口径在总览和评估保持一致`, async ({ page }) => {
    await seed(page, inflation); await page.goto('/');
    const enabled = inflation !== null && inflation !== 0;
    await expect(page.getByRole('radiogroup', { name: '金额显示口径', exact: true })).toHaveCount(enabled ? 1 : 0);
    if (!enabled) await expect(page.getByText(/购买力基准/)).toHaveCount(0);
    await page.getByRole('button', { name: '评估', exact: true }).click();
    await page.getByLabel('消费金额', { exact: true }).fill('10000');
    await page.getByText('金额影响', { exact: true }).click();
    await expect(page.getByRole('radiogroup', { name: '评估金额显示口径', exact: true })).toHaveCount(enabled ? 1 : 0);
    if (inflation === 0) {
      await expect(page.getByText(/资产差额.*名义金额/)).toBeVisible();
      const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
      expect(saved.preferences.displayBasis).toBe('real');
    }
  });
}

test('三项指标和滑块在手机首屏可见，拖动与输入同步且草稿预测固定', async ({ page }) => {
  await seed(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const metrics = page.locator('[aria-label="计划核心指标"]');
  for (const label of ['年收入', '年化总收益率', '年支出']) await expect(metrics.getByRole('button', { name: new RegExp(label) })).toBeInViewport();
  await metrics.getByRole('button', { name: /年收入/ }).click();
  const dialog = page.getByRole('dialog');
  const preview = dialog.getByRole('region', { name: '草稿预测' });
  const storedBefore = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  const forecastBefore = await preview.innerText();
  for (const label of ['税后年主动收入', '年化总收益率', '当前年支出', '年通胀率']) {
    await expect(dialog.getByLabel(label, { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('slider', { name: `${label}滑块`, exact: true })).toBeInViewport({ ratio: 1 });
  }
  const incomeSlider = dialog.getByRole('slider', { name: '税后年主动收入滑块' });
  await incomeSlider.focus(); await page.keyboard.press('ArrowRight');
  await expect(dialog.getByLabel('税后年主动收入', { exact: true })).toHaveValue('241000');
  const box = (await incomeSlider.boundingBox())!;
  await page.mouse.move(box.x + 8 + (box.width - 16) * 0.241, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
  expect(Number(await dialog.getByLabel('税后年主动收入', { exact: true }).inputValue())).toBeGreaterThan(500000);
  await expect.poll(() => preview.innerText()).not.toBe(forecastBefore);
  await dialog.getByLabel('税后年主动收入', { exact: true }).fill('1500000');
  await expect(incomeSlider).toHaveAttribute('max', '1500000');
  await incomeSlider.focus(); await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByLabel('税后年主动收入', { exact: true })).toHaveValue('1499000');
  await expect(incomeSlider).toHaveAttribute('max', '1500000');
  const previewTop = (await preview.boundingBox())!.y;
  await dialog.getByText('本地数据与备份', { exact: true }).scrollIntoViewIfNeeded();
  await expect(preview).toBeInViewport();
  expect((await preview.boundingBox())!.y).toBeCloseTo(previewTop, 0);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(storedBefore);
});

test('收益与支出滑块联动预测，无效值和空白不沿用旧结果，保存可恢复', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog');
  const preview = dialog.getByRole('region', { name: '草稿预测' });
  const rate = dialog.getByLabel('年化总收益率', { exact: true });
  await rate.fill('-40');
  const rateSlider = dialog.getByRole('slider', { name: '年化总收益率滑块' });
  await expect(rateSlider).toHaveAttribute('min', '-40');
  await rateSlider.focus(); await page.keyboard.press('ArrowRight');
  await expect(rate).toHaveValue('-39.9');
  await expect(rateSlider).toHaveAttribute('min', '-40');
  await rate.fill('12');
  const before = await preview.innerText();
  const expenseSlider = dialog.getByRole('slider', { name: '当前年支出滑块' });
  await expenseSlider.focus(); await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByLabel('当前年支出', { exact: true })).toHaveValue('119000');
  await expect.poll(() => preview.innerText()).not.toBe(before);
  await rate.fill('.');
  await expect(rate).toHaveValue('.');
  await expect(preview.getByText('—', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '完成并保存' })).toBeDisabled();
  await rate.fill('');
  await expect(rate).toHaveValue('');
  await expect(preview.getByText('—', { exact: true })).toBeVisible();
  await rateSlider.focus(); await page.keyboard.press('ArrowRight');
  await expect(rate).toHaveValue('0.1');
  await rate.fill('12');
  await dialog.getByRole('button', { name: '完成并保存' }).click();
  await page.reload();
  await page.getByRole('button', { name: /年化总收益率 12/ }).click();
  await expect(page.getByLabel('年化总收益率', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('当前年支出', { exact: true })).toHaveValue('119000');
});

test('通胀在主面板滑动编辑，不改变收益率，支持取消与保存恢复', async ({ page }) => {
  await seed(page); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog');
  const inflation = dialog.getByLabel('年通胀率', { exact: true });
  const slider = dialog.getByRole('slider', { name: '年通胀率滑块', exact: true });
  const rate = dialog.getByLabel('年化总收益率', { exact: true });
  const preview = dialog.getByRole('region', { name: '草稿预测' });
  const original = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  await expect(inflation).toHaveValue('3');
  await inflation.fill('0');
  await expect(preview).toContainText('年 9 个月');
  await expect(rate).toHaveValue('8');
  await inflation.fill('-1');
  await slider.focus(); await page.keyboard.press('ArrowRight');
  await expect(inflation).toHaveValue('-0.9');
  await expect(rate).toHaveValue('8');
  await inflation.fill('15');
  await expect(slider).toHaveAttribute('max', '15');
  await slider.focus(); await page.keyboard.press('ArrowLeft');
  await expect(inflation).toHaveValue('14.9');
  await expect(slider).toHaveAttribute('max', '15');
  await inflation.fill('-100');
  await expect(preview.getByText('—', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '完成并保存', exact: true })).toBeDisabled();
  await inflation.fill('');
  await expect(inflation).toHaveValue('');
  await expect(preview.getByText('—', { exact: true })).toBeVisible();
  await expect(rate).toHaveValue('8');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
  await page.getByRole('button', { name: /年化总收益率/ }).click();
  await expect(inflation).toHaveValue('3');
  await inflation.fill('2');
  await dialog.getByRole('button', { name: '完成并保存', exact: true }).click();
  await page.reload();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.plan.inflationRate).toBe(0.02);
  expect(saved.plan.investmentReturn).toEqual({ annualRate: 0.08 });
  await page.getByRole('button', { name: /年化总收益率/ }).click();
  await expect(inflation).toHaveValue('2');
  await expect(rate).toHaveValue('8');
});
