import { expect, test } from './fixtures';

const origin = 'https://freedom-countdown.waynegong.com';
const routes = [
  { path: '/', title: '财富自由倒计时｜财务自由计算器', content: '用自己的计划，估算财富自由还需要多久' },
  { path: '/evaluate', title: '消费与增收影响评估｜财富自由倒计时', content: '评估一笔消费或增收，对自由时间的影响' },
  { path: '/guide', title: '4% 法则与计算口径说明｜财富自由倒计时', content: '有限期支出的剩余准备金' },
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
  await page.getByRole('link', { name: '口径说明 ↗', exact: true }).click();
  await expect(page).toHaveTitle(routes[2]!.title);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('meta[name="description"]')).toHaveCount(1);
  await expect(page.locator('#page-schema')).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveTitle(routes[1]!.title);
});
