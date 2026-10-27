import { expandSchedule, expect, test, type Page } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

/** 为浏览器准备显式合成数据，不使用真实财务存档，喵~ */
function exampleDocument() {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000, inflationRate: 0.03, investmentReturn: { annualRate: 0.08 },
    activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }], currentExpenses: [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }] };
  document.goals[2]!.name = '资产覆盖生活支出';
  return document;
}

/** 在页面运行前注入合成方案，喵~ */
async function seed(page: Page, inflationRate: number | null = 0.03, update?: (document: ReturnType<typeof exampleDocument>) => void) {
  const document = exampleDocument();
  document.plan.inflationRate = inflationRate;
  document.preferences.displayBasis = 'real';
  update?.(document);
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
}

test('首次填写计划，预测期限固定且保存恢复', async ({ page }) => {
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
  await expandSchedule(page, '收入');
  await expect(dialog.getByLabel('收入增长方式', { exact: true })).toHaveValue('fixed');
  await expandSchedule(page, '支出');
  await expect(dialog.getByLabel('支出增长方式', { exact: true })).toHaveValue('inflation');
  await expect(page.getByLabel('最多向后预测', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\?panel=plan$/);
  await expect(dialog.getByRole('button', { name: '确认并返回', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '完成并保存', exact: true }).click();
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.plan.horizonMonths).toBe(1200);
});

test('新方案默认 2% 通胀和 5% 收益，填写资产与收支即可预测', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('当前年支出', { exact: true }).fill('120000');
  await page.getByRole('button', { name: '填写我的计划' }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('600000');
  await page.getByLabel('税后年主动收入', { exact: true }).fill('240000');
  await expect(page.getByLabel('年化总收益率', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('年通胀率', { exact: true })).toHaveValue('2');
  await expect(page.getByRole('region', { name: '草稿预测' })).toContainText('年 11 个月');
  await page.getByRole('button', { name: '完成并保存' }).click();
  await expect(page.getByRole('radiogroup', { name: '金额显示口径', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '达成预测', exact: true })).toContainText(/2026 年 10 月购买力.*届时约/);
  await page.reload();
  await expect(page.getByText('年 11 个月', { exact: true })).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.plan.inflationRate).toBe(0.02);
  expect(saved.plan.investmentReturn).toEqual({ annualRate: 0.05 });
});

test('计划无说明入口，取消放弃草稿且目标与消费评估帮助仍可跳转', async ({ page }) => {
  await seed(page); await page.goto('/');
  const original = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  await page.getByRole('button', { name: /当前可投资资产/ }).click();
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await dialog.getByLabel('当前年支出', { exact: true }).fill('180000');
  await expect(dialog.getByRole('button', { name: /说明.*↗/ })).toHaveCount(0);
  await expect(dialog.getByRole('link')).toHaveCount(0);
  await expect(page).toHaveURL(/\?panel=plan$/);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(original);
  await expect(page.getByText('当前目标 300 万', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '资产覆盖生活支出', exact: true }).click();
  const goal = page.getByRole('dialog', { name: '配置目标', exact: true });
  await goal.getByRole('region', { name: '自定义左侧口径', exact: true }).getByRole('link', { name: '说明 ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/guide#passive-income$/);
  await page.getByRole('button', { name: '‹ 返回', exact: true }).click();
  await expect(goal).toBeVisible();
  await goal.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('link', { name: '评估', exact: true }).click();
  await page.getByText('时间、增长与收益设置', { exact: true }).click();
  await page.getByRole('link', { name: '报价与增长规则 ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/guide#growth-rules$/);
  await page.getByRole('button', { name: '‹ 返回', exact: true }).click();
  await expect(page).toHaveURL(/\/evaluate$/);
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
  await expect(page.getByRole('radiogroup', { name: '金额显示口径', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '评估', exact: true }).click();
  await page.getByLabel('消费金额', { exact: true }).fill('10000');
  await expect(page.getByText('预计延后', { exact: true })).toBeVisible();
  await expect(page.getByText('15 年 5 个月 → 15 年 6 个月')).toBeVisible();
  await page.getByText('金额影响', { exact: true }).click();
  await expect(page.getByText('本金投入减少', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: '名义金额', exact: true }).click();
  await expect(page.getByText('15 年 5 个月 → 15 年 6 个月')).toBeVisible();
  await page.getByRole('radio', { name: '基准月购买力', exact: true }).click();
  await expect(page.getByText('15 年 5 个月 → 15 年 6 个月')).toBeVisible();
  await page.getByRole('button', { name: '＋ 添加额外收入', exact: true }).click();
  await page.getByLabel('额外收入', { exact: true }).fill('2000');
  await expect(page.getByText('预计提前', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '总览', exact: true }).click();
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
  const trigger = page.getByRole('button', { name: /当前可投资资产/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await dialog.getByLabel('当前可投资资产', { exact: true }).fill('700000');
  await expandSchedule(page, '收入');
  await dialog.getByLabel('收入增长方式', { exact: true }).selectOption('inflation');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await expect(dialog.getByLabel('当前可投资资产', { exact: true })).toHaveValue('600000');
  await expandSchedule(page, '收入');
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
    const forecast = page.getByRole('region', { name: '达成预测', exact: true });
    const targetBox = (await forecast.getByText('预计达成月份的目标', { exact: true }).boundingBox())!;
    const timeBox = (await forecast.getByText('预计还需', { exact: true }).boundingBox())!;
    expect(targetBox.x).toBeLessThan(timeBox.x);
    expect(Math.abs(targetBox.y - timeBox.y)).toBeLessThan(3);
    const forecastBox = (await forecast.boundingBox())!;
    const progressBox = (await page.getByRole('progressbar', { name: '主目标完成进度' }).boundingBox())!;
    expect(progressBox.y).toBeGreaterThanOrEqual(forecastBox.y + forecastBox.height);
    const metrics = page.locator('[aria-label="计划核心指标"]');
    const assetBox = (await metrics.getByRole('button', { name: /当前可投资资产/ }).boundingBox())!;
    await expect(metrics.getByRole('button')).toHaveCount(5);
    const gap = metrics.locator('[data-goal-gap]');
    const gapBox = (await gap.boundingBox())!;
    expect(progressBox.y + progressBox.height).toBeLessThanOrEqual(assetBox.y);
    const assetNumber = metrics.getByRole('button', { name: /当前可投资资产/ }).locator('strong');
    expect(await assetNumber.evaluate((element) => getComputedStyle(element).fontSize)).toBe(await gap.locator('strong').evaluate((element) => getComputedStyle(element).fontSize));
    await expect(metrics.locator('button svg[aria-hidden="true"]')).toHaveCount(5);
    await expect(gap.locator('svg')).toHaveCount(0);
    expect(Math.abs(assetBox.y - gapBox.y)).toBeLessThan(1);
    expect(assetBox.x + assetBox.width).toBeLessThanOrEqual(gapBox.x);
    await expect(gap.getByRole('button')).toHaveCount(0);
    await expect(page.getByText('当前缺口', { exact: true })).toHaveCount(1);
    const incomeBox = (await metrics.getByRole('button', { name: /年收入/ }).boundingBox())!;
    const expensesBox = (await metrics.getByRole('button', { name: /年支出/ }).boundingBox())!;
    expect(assetBox.y + assetBox.height).toBeLessThanOrEqual(incomeBox.y);
    expect(Math.abs(incomeBox.y - expensesBox.y)).toBeLessThan(1);
    const returnBox = (await metrics.getByRole('button', { name: /年化总收益率/ }).boundingBox())!;
    const inflationBox = (await metrics.getByRole('button', { name: /通胀率/ }).boundingBox())!;
    expect(Math.abs(returnBox.y - inflationBox.y)).toBeLessThan(1);
    expect(incomeBox.y + incomeBox.height).toBeLessThanOrEqual(returnBox.y);
    const main = page.getByRole('main');
    await main.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByRole('navigation', { name: '相关工具与说明' }).getByRole('link', { name: '4% 法则与计算口径' })).toBeInViewport();
    await page.getByRole('button', { name: '评估一笔消费' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '评估一笔消费' })).toBeInViewport();
    if (width === 390) {
      await main.evaluate((element) => { element.scrollTop = 0; });
      await page.screenshot({ path: `test-results/overview-${test.info().project.name}.png` });
    }
  });
}

test('同页调整不增加步骤历史，模态限制焦点且关闭后恢复', async ({ page }) => {
  await seed(page); await page.goto('/');
  const trigger = page.getByRole('button', { name: /当前可投资资产/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await expandSchedule(page, '收入');
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
  test(`通胀 ${inflation} 总览优先购买力且评估保留原有切换`, async ({ page }) => {
    await seed(page, inflation); await page.goto('/');
    const enabled = inflation !== null && inflation !== 0;
    await expect(page.getByRole('radiogroup', { name: '金额显示口径', exact: true })).toHaveCount(0);
    const forecast = page.getByRole('region', { name: '达成预测', exact: true });
    if (inflation === null) await expect(forecast).toContainText('通胀未设置，暂按名义金额展示');
    else await expect(forecast).toContainText(/2026 年 10 月购买力.*届时约/);
    await page.getByRole('link', { name: '评估', exact: true }).click();
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

test('收入卡片定位编辑，拖动与输入同步且草稿预测固定', async ({ page }) => {
  await seed(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const metrics = page.locator('[aria-label="计划核心指标"]');
  await expect(metrics.getByRole('button')).toHaveCount(5);
  for (const label of ['当前可投资资产', '年收入', '年支出', '年化总收益率', '通胀率']) await expect(metrics.getByRole('button', { name: new RegExp(label) })).toBeInViewport();
  await metrics.getByRole('button', { name: /年收入/ }).click();
  const dialog = page.getByRole('dialog');
  const preview = dialog.getByRole('region', { name: '草稿预测' });
  const storedBefore = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  const forecastBefore = await preview.innerText();
  await expect(dialog.getByLabel('税后年主动收入', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('slider', { name: '税后年主动收入滑块', exact: true })).toBeInViewport({ ratio: 1 });
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


test('五张核心卡片定位对应编辑区，只滚动表单并短暂高亮，关闭恢复焦点', async ({ page }) => {
  await seed(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const metrics = page.locator('[aria-label="计划核心指标"]');
  const fields = [
    ['assets', '当前可投资资产', '当前可投资资产'],
    ['income', '年收入', '税后年主动收入'],
    ['expenses', '年支出', '当前年支出'],
    ['returnRate', '年化总收益率', '年化总收益率'],
    ['inflation', '通胀率', '年通胀率'],
  ];
  await expect(metrics.getByRole('button')).toHaveCount(5);
  const main = page.getByRole('main');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  for (const [fieldId, cardLabel, inputLabel] of fields) {
    const trigger = metrics.getByRole('button', { name: new RegExp(cardLabel!) });
    await trigger.scrollIntoViewIfNeeded();
    const mainScroll = await main.evaluate((element) => element.scrollTop);
    await trigger.click();
    const field = dialog.locator(`[data-plan-field="${fieldId}"]`);
    await expect(field).toHaveAttribute('data-highlighted', 'true');
    await expect(field.getByLabel(inputLabel!, { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(field.getByRole('slider', { name: `${inputLabel}滑块`, exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
    expect(await main.evaluate((element) => element.scrollTop)).toBe(mainScroll);
    if (fieldId === 'assets') await expect(field).not.toHaveAttribute('data-highlighted', 'true', { timeout: 3000 });
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(trigger).toBeFocused();
  }
  await metrics.getByRole('button', { name: /当前可投资资产/ }).click();
  await expect(dialog.locator('[data-plan-field="assets"]')).toHaveAttribute('data-highlighted', 'true');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
  await page.keyboard.press('Escape');
  await expect(metrics.getByRole('button', { name: /当前可投资资产/ })).toBeFocused();
});

test('资产置于编辑首位，滑条步进与精确超范围金额统一保存，取消不落地', async ({ page }) => {
  await seed(page); await page.goto('/');
  const trigger = page.locator('[aria-label="计划核心指标"]').getByRole('button', { name: /当前可投资资产/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  await expect(dialog.locator('[data-plan-field]').first()).toHaveAttribute('data-plan-field', 'assets');
  const assets = dialog.getByLabel('当前可投资资产', { exact: true });
  const slider = dialog.getByRole('slider', { name: '当前可投资资产滑块', exact: true });
  const preview = dialog.getByRole('region', { name: '草稿预测' });
  const originalForecast = await preview.innerText();
  await expect(slider).toHaveAttribute('min', '0');
  await expect(slider).toHaveAttribute('max', '10000000');
  await expect(slider).toHaveAttribute('step', '10000');
  await page.screenshot({ path: `test-results/plan-editor-${test.info().project.name}.png` });
  await slider.focus(); await page.keyboard.press('ArrowRight');
  await expect(assets).toHaveValue('610000');
  await assets.fill('650123.45');
  await expect(assets).toHaveValue('650123.45');
  await expect.poll(() => preview.innerText()).not.toBe(originalForecast);
  await assets.fill('15000000.25');
  await expect(slider).toHaveAttribute('max', '15000000.25');
  await expect(assets).toHaveValue('15000000.25');
  await dialog.getByRole('button', { name: '完成并保存', exact: true }).click();
  await page.reload();
  const saved = await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY);
  expect(JSON.parse(saved!).plan.initialAssets).toBe(15000000.25);
  await trigger.click();
  await expect(assets).toHaveValue('15000000.25');
  await assets.fill('700000');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEFAULT_STORAGE_KEY)).toBe(saved);
  await trigger.click();
  await expect(assets).toHaveValue('15000000.25');
});

test('收支阶段可展开且无说明入口，自定义增长校验并保存恢复', async ({ page }) => {
  await seed(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?panel=plan');
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  const incomeGrowth = dialog.getByRole('region', { name: '收入阶段', exact: true }).getByRole('region', { name: '当前阶段', exact: true });
  await expect(dialog.getByRole('button', { name: /说明.*↗/ })).toHaveCount(0);
  await expandSchedule(page, '收入'); await expandSchedule(page, '支出');
  for (const label of ['收入增长方式', '支出增长方式']) {
    const select = dialog.getByLabel(label, { exact: true });
    expect(await select.evaluate((element) => element.closest('details')?.open)).toBe(true);
    await select.selectOption('custom');
  }
  const incomeRate = dialog.getByLabel('收入年增长率', { exact: true });
  const expenseRate = dialog.getByLabel('支出年增长率', { exact: true });
  await incomeRate.fill('-100');
  await expenseRate.fill('2.5');
  await expect(incomeGrowth.getByText('增长率必须大于 -100%', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '完成并保存', exact: true })).toBeDisabled();
  await incomeRate.fill('4.5');
  await incomeGrowth.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/plan-growth-${test.info().project.name}.png` });
  await dialog.getByRole('button', { name: '完成并保存', exact: true }).click();
  await page.reload();
  await page.locator('[aria-label="计划核心指标"]').getByRole('button', { name: /年收入/ }).click();
  await expandSchedule(page, '收入');
  await expect(dialog.getByLabel('收入增长方式', { exact: true })).toHaveValue('custom');
  await expect(incomeRate).toHaveValue('4.5');
  await expandSchedule(page, '支出');
  await expect(dialog.getByLabel('支出增长方式', { exact: true })).toHaveValue('custom');
  await expect(expenseRate).toHaveValue('2.5');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.plan.activeIncome[0].growth).toEqual({ kind: 'custom', annualRate: 0.045 });
  expect(saved.plan.currentExpenses[0].growth).toEqual({ kind: 'custom', annualRate: 0.025 });
});

test('总览购买力不受旧名义金额偏好影响，移除假设行与重复资产指标', async ({ page }) => {
  await seed(page, 0.03, (document) => { document.preferences.displayBasis = 'nominal'; }); await page.goto('/');
  await expect(page.getByRole('radiogroup', { name: '金额显示口径', exact: true })).toHaveCount(0);
  await expect(page.getByText(/工资.*调整假设/)).toHaveCount(0);
  await expect(page.getByText(/^年化总收益 /)).toHaveCount(0);
  await expect(page.getByText('已积累', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '达成预测', exact: true })).toContainText(/2026 年 10 月购买力.*届时约/);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.preferences.displayBasis).toBe('nominal');
});

test('缺少收益假设时保留两栏预测位置与原因，非资产目标保留当前指标', async ({ page }) => {
  await seed(page, 0.03, (document) => { document.plan.investmentReturn = null; }); await page.goto('/');
  const forecast = page.getByRole('region', { name: '达成预测', exact: true });
  await expect(forecast.getByText('预计达成月份的目标', { exact: true })).toBeVisible();
  await expect(forecast.getByText('预计还需', { exact: true })).toBeVisible();
  await expect(forecast.getByText('—', { exact: true })).toHaveCount(2);
  await expect(forecast).toContainText(/收益|缺少|补充|未设置/);
  await page.getByRole('button', { name: /被动收入覆盖主动收入/ }).click();
  await page.getByRole('button', { name: '保存并设为主目标', exact: true }).click();
  await expect(page.getByText('当前指标', { exact: true })).toBeVisible();
});


test('320px 短视口保持总览位置，表单滚动与增长换行不遮挡保存', async ({ page }) => {
  await seed(page); await page.setViewportSize({ width: 320, height: 460 }); await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const main = page.getByRole('main');
  const trigger = page.locator('[aria-label="计划核心指标"]').getByRole('button', { name: /通胀率/ });
  await trigger.scrollIntoViewIfNeeded();
  const mainScroll = await main.evaluate((element) => element.scrollTop);
  expect(mainScroll).toBeGreaterThan(0);
  await trigger.click();
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(mainScroll);
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
  const field = dialog.locator('[data-plan-field="inflation"]');
  const save = dialog.getByRole('button', { name: '完成并保存', exact: true });
  await expect(field).toHaveAttribute('data-highlighted', 'true');
  await expect(field.getByLabel('年通胀率', { exact: true })).toBeInViewport();
  await expect(save).toBeInViewport({ ratio: 1 });
  const preview = dialog.getByRole('region', { name: '草稿预测' });
  const previewTop = (await preview.boundingBox())!.y;
  await dialog.getByText('本地数据与备份', { exact: true }).scrollIntoViewIfNeeded();
  await expect(field).not.toBeInViewport();
  await expect(save).toBeInViewport({ ratio: 1 });
  await expect(preview).toBeInViewport();
  expect((await preview.boundingBox())!.y).toBeCloseTo(previewTop, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(mainScroll);
  await trigger.click();
  await expandSchedule(page, '收入'); await expandSchedule(page, '支出');
  for (const name of ['收入', '支出']) {
    const select = dialog.getByLabel(`${name}增长方式`, { exact: true });
    await select.selectOption('custom');
    const rate = dialog.getByLabel(`${name}年增长率`, { exact: true });
    await rate.fill(name === '收入' ? '4.5' : '2.5');
    const selectBox = (await select.boundingBox())!;
    const rateBox = (await rate.boundingBox())!;
    expect(rateBox.y).toBeGreaterThanOrEqual(selectBox.y + selectBox.height);
    const region = dialog.getByRole('region', { name: `${name}阶段`, exact: true }).getByRole('region', { name: '当前阶段', exact: true });
    expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(save).toBeInViewport({ ratio: 1 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await save.click();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEFAULT_STORAGE_KEY);
  expect(saved.plan.activeIncome[0].growth).toEqual({ kind: 'custom', annualRate: 0.045 });
  expect(saved.plan.currentExpenses[0].growth).toEqual({ kind: 'custom', annualRate: 0.025 });
});


for (const { assets, label, amount } of [
  { assets: 600000, label: '当前缺口', amount: '240' },
  { assets: 3500000, label: '已超出目标', amount: '50' },
]) {
  test(`资产旁唯一展示${label}，缺口金额保留计算与单位`, async ({ page }) => {
    await seed(page, 0.03, (document) => { document.plan.initialAssets = assets; }); await page.goto('/');
    const metrics = page.locator('[aria-label="计划核心指标"]');
    const gap = metrics.locator('[data-goal-gap]');
    await expect(metrics.getByRole('button')).toHaveCount(5);
    await expect(gap).toContainText(label);
    await expect(gap).toContainText(new RegExp(`${amount}\\s*万`));
    await expect(page.getByText(label, { exact: true })).toHaveCount(1);
    expect(await gap.evaluate((element) => element.closest('button') === null)).toBe(true);
    await expect(gap.getByRole('button')).toHaveCount(0);
  });
}
