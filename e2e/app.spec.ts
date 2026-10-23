import { expect, test, type Page } from '@playwright/test';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

/** 为浏览器准备显式合成数据，不使用真实财务存档，喵~ */
function exampleDocument() {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000, inflationRate: 0.03, investmentReturn: { kind: 'nominal', annualRate: 0.08 }, cashYield: 0.02,
    activeIncome: { amount: 240000, growth: { kind: 'fixed' } }, currentExpenses: { amount: 120000, growth: { kind: 'inflation' } } };
  document.goals[2]!.name = '资产覆盖生活支出';
  return document;
}

/** 在页面运行前注入合成方案，喵~ */
async function seed(page: Page) {
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(exampleDocument()) });
}

test('首次填写计划、独立设置假设、保存并刷新恢复', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '离自由，还有多远？' })).toBeVisible();
  await page.getByLabel('当前年支出', { exact: true }).fill('120000');
  await page.getByRole('button', { name: '填写我的计划' }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('600000');
  await page.getByLabel('税后年主动收入', { exact: true }).fill('240000');
  await expect(page.getByRole('dialog').getByLabel('当前年支出', { exact: true })).toHaveValue('120000');
  await page.getByRole('button', { name: /长期假设/ }).click();
  await page.getByLabel('年化总收益率', { exact: true }).fill('8');
  await page.getByLabel('通胀假设', { exact: true }).selectOption('custom');
  await page.getByLabel('年通胀率', { exact: true }).fill('3');
  await page.getByLabel('现金收益率', { exact: true }).fill('2');
  await page.getByRole('button', { name: '确认并返回', exact: true }).click();
  await page.getByRole('button', { name: '完成并保存', exact: true }).click();
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('年 5 个月', { exact: true })).toBeVisible();
});

test('说明锚点往返保留编辑草稿，取消后正式计划不变', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: /工资.*调整假设/ }).click();
  await page.getByLabel('当前年支出', { exact: true }).fill('180000');
  await page.getByRole('button', { name: /长期假设/ }).click();
  await page.getByRole('button', { name: '说明 ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/guide#return-assumptions/);
  await expect(page.getByRole('heading', { name: '收益、通胀与长期假设' })).toBeInViewport();
  await page.getByRole('link', { name: '目标定义与显示口径 ↗' }).click();
  await page.getByRole('button', { name: '‹ 返回', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '长期测算假设' })).toBeVisible();
  await page.getByRole('button', { name: '确认并返回' }).click();
  await expect(page.getByLabel('当前年支出', { exact: true })).toHaveValue('180000');
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

test('浏览器后退关闭子面板，Esc 取消父编辑，不落地草稿', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: /工资.*调整假设/ }).click();
  await page.getByLabel('当前可投资资产', { exact: true }).fill('700000');
  await page.getByRole('button', { name: /收入增长/ }).click();
  await expect(page).toHaveURL(/step=income/);
  await page.goBack();
  await expect(page).toHaveURL(/\?panel=plan$/);
  await expect(page.getByRole('dialog', { name: '我的计划', exact: true })).toBeVisible();
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

test('确认子面板不留下重复历史，模态限制焦点且关闭后恢复', async ({ page }) => {
  await seed(page); await page.goto('/');
  const trigger = page.getByRole('button', { name: /工资.*调整假设/ });
  await trigger.click();
  await page.getByRole('button', { name: /收入增长/ }).click();
  await expect(page.getByRole('dialog', { name: '收入增长', exact: true })).toBeVisible();
  await page.getByLabel('增长规则', { exact: true }).selectOption('inflation');
  await page.getByRole('button', { name: '确认并返回', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '我的计划', exact: true });
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
