import { expect, test } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

const origin = 'https://freedom-countdown.waynegong.com';
const routes = [
  { path: '/', title: '财富自由倒计时｜财务自由计算器', content: '财务自由计算器能算出什么？' },
  { path: '/evaluate', title: '消费与增收影响评估｜财富自由倒计时', content: '评估一笔消费或增收，对自由时间的影响' },
  { path: '/guide', title: '财富自由需要多少钱？4% 法则与计算口径｜财富自由倒计时', content: '有限期支出的剩余准备金' },
];

for (const route of routes) {
  test(`无 JavaScript 可读取 ${route.path} 的公开正文`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    try {
      const page = await context.newPage();
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(route.title);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: route.content, exact: true })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', origin + route.path);
      if (route.path === '/evaluate') await expect(page.locator('#car-case-results')).toContainText('46 个月');
      if (route.path === '/guide') await expect(page.getByRole('table', { name: '按 4% 提取率估算目标资本' })).toContainText('450 万元');
      const link = route.path === '/guide' ? page.getByRole('link', { name: '返回财务自由计算器' }) : page.getByRole('link', { name: '4% 法则与计算口径', exact: false });
      await link.click();
      await expect(page).toHaveURL(route.path === '/guide' ? /\/$/ : /\/guide$/);
    } finally { await context.close(); }
  });
}

test('客户端路由更新元信息且编辑参数不进入规范地址', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '评估', exact: true }).click();
  await expect(page).toHaveTitle(routes[1]!.title);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${origin}/evaluate`);
  await page.getByRole('button', { name: '调整当前计划' }).click();
  await expect(page).toHaveURL(/panel=plan/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/evaluate`);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('link', { name: '4% 法则与计算口径', exact: false }).click();
  await expect(page).toHaveTitle(routes[2]!.title);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  await expect(page.locator('#page-schema')).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveTitle(routes[1]!.title);
});

test('首页案例链接定位正文，直接访问和刷新仍能定位，窄屏表格可读', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.getByRole('link', { name: '买车影响财务自由的计算案例 ↗', exact: true }).click();
  await expect(page).toHaveURL(/\/evaluate#car-case$/);
  const heading = page.getByRole('heading', { name: '买一辆 15 万元的车，会让财务自由推迟多久？', exact: true });
  await expect(heading).toBeInViewport();
  await page.reload();
  await expect(heading).toBeInViewport();
  await expect(page.locator('#car-case-results')).toContainText('46 个月');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('#car-case-results, #car-case-paths').evaluateAll(tables => tables.every(table => table.getBoundingClientRect().right <= innerWidth))).toBe(true);
});

test('按公开买车案例在评估工具输入车价及养车费，得到相同延后月份', async ({ page }) => {
  const document = createDocument('2026-11');
  document.plan.initialAssets = 600000;
  document.plan.activeIncome = [{ amount: 240000, growth: { kind: 'inflation' }, durationMonths: null }];
  document.plan.currentExpenses = [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }];
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
  await page.goto('/evaluate');
  await page.getByLabel('消费金额', { exact: true }).fill('150000');
  await expect(page.getByText('14 年 2 个月 → 15 年 4 个月', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '＋ 添加支出', exact: true }).click();
  const secondFlow = page.getByLabel('消费金额', { exact: true }).nth(1);
  await secondFlow.fill('1000');
  await page.getByRole('radio', { name: '每月', exact: true }).nth(1).click();
  await page.getByText('时间、增长与收益设置', { exact: true }).nth(1).click();
  await page.getByLabel('增长规则', { exact: true }).nth(1).selectOption('inflation');
  await expect(page.getByText('14 年 2 个月 → 18 年 0 个月', { exact: true })).toBeVisible();
});
