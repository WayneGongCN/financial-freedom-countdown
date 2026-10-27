import { expect, test, type Locator, type Page } from './fixtures';
import { createDocument, DEFAULT_STORAGE_KEY } from '../src/index';

/** 独立注入合成方案，所有输入、保存与刷新只涉及测试浏览器，喵~ */
async function seed(page: Page) {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000, inflationRate: 0.03,
    investmentReturn: { annualRate: 0.08 },
    activeIncome: [{ amount: 240000, growth: { kind: 'fixed' }, durationMonths: null }],
    currentExpenses: [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }] };
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: DEFAULT_STORAGE_KEY, value: JSON.stringify(document) });
}

/** 从可访问字段定位真实滚动祖先，验证输入区滚动而摘要保持固定，喵~ */
async function scrollEditorToEnd(field: Locator) {
  return field.evaluate((element) => {
    let parent = element.parentElement;
    while (parent) {
      if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
        parent.scrollTop = parent.scrollHeight;
        return parent.scrollTop;
      }
      parent = parent.parentElement;
    }
    return 0;
  });
}

test('目标两侧直接选择、具体兼容提示与保存刷新后的真实回显', async ({ page }) => {
  await seed(page);
  await page.goto('/?panel=goal&goal=passive-vs-income');
  const dialog = page.getByRole('dialog', { name: '配置目标', exact: true });
  const left = dialog.getByLabel('要达成的指标', { exact: true });
  const right = dialog.getByLabel('比较目标', { exact: true });
  const summary = dialog.getByRole('region', { name: '草稿预测', exact: true });
  await expect(left).toHaveValue('passive-total');
  await expect(right).toHaveValue('active-income');
  await expect(left.getByRole('option', { name: '自定义指标', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('目标模板', { exact: true }).getByRole('option', { name: '自定义目标', exact: true })).toBeDisabled();
  await expect(dialog.getByText('总被动收入 ≥ 主动收入 × 1', { exact: true })).toBeVisible();
  await expect(summary.locator('strong')).not.toHaveText('—');

  await left.selectOption('assets');
  await expect(right).toHaveValue('active-income');
  await expect(dialog.getByRole('alert')).toContainText('左侧为资本金额（元），右侧为年流量（元/年）');
  await expect(dialog.getByRole('alert')).toContainText('左侧为时点金额，右侧为未来 12 个月合计');
  await expect(dialog.getByRole('button', { name: '保存目标', exact: true })).toBeDisabled();
  await expect(summary.locator('strong')).toHaveText('—');
  await expect(summary.getByText('被动收入覆盖主动收入', { exact: true })).toBeVisible();
  await expect(summary.getByText('当前目标', { exact: true })).toHaveCount(0);

  await left.selectOption('investment-total');
  await expect(right).toHaveValue('active-income');
  await expect(dialog.getByText('投资总收益 ≥ 主动收入 × 1', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: '保存目标', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^被动收入覆盖主动收入/ }).click();
  await expect(left).toHaveValue('investment-total');
  await expect(right).toHaveValue('active-income');
  await expect(dialog.getByLabel('目标模板', { exact: true })).toHaveValue('');
});

test('高级子页取消恢复父草稿，取消整个目标不提交单侧选择', async ({ page }) => {
  await seed(page);
  await page.goto('/?panel=goal&goal=passive-vs-income');
  const parent = page.getByRole('dialog', { name: '配置目标', exact: true });
  await parent.getByLabel('要达成的指标', { exact: true }).selectOption('investment-total');
  await parent.getByRole('button', { name: /^自定义左侧口径/ }).click();
  const advanced = page.getByRole('dialog', { name: '选择指标口径', exact: true });
  await expect(page).toHaveURL(/step=left/);
  await expect(advanced.getByLabel('选择预设口径', { exact: true })).toHaveValue('investment-total');
  await expect(advanced.getByLabel('选择预设口径', { exact: true }).getByRole('option', { name: '自定义指标', exact: true })).toBeDisabled();
  await advanced.getByLabel('选择预设口径', { exact: true }).selectOption('active-income');
  await advanced.getByRole('button', { name: '取消', exact: true }).click();
  await expect(parent).toBeVisible();
  await expect(parent.getByLabel('要达成的指标', { exact: true })).toHaveValue('investment-total');
  await expect(parent.getByLabel('比较目标', { exact: true })).toHaveValue('active-income');
  await parent.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: /^被动收入覆盖主动收入/ }).click();
  await expect(parent.getByLabel('要达成的指标', { exact: true })).toHaveValue('passive-total');
});

test('金额模板允许设置金额与购买力，保存刷新后仍正确回显', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.getByRole('button', { name: '＋ 添加', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '配置目标', exact: true });
  await dialog.getByLabel('目标模板', { exact: true }).selectOption('amount');
  await dialog.getByLabel('目标名称', { exact: true }).fill('我的购买力目标');
  await dialog.getByLabel('目标金额', { exact: true }).fill('1000000');
  await dialog.getByRole('radio', { name: '保持购买力', exact: true }).click();
  await expect(dialog.getByLabel('目标模板', { exact: true })).toHaveValue('amount');
  await expect(dialog.getByLabel('要达成的指标', { exact: true })).toHaveValue('assets');
  await expect(dialog.getByText('可投资资产 ≥ 1000000 元 × 1', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '保存目标', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /^我的购买力目标/ }).click();
  await expect(dialog.getByLabel('目标模板', { exact: true })).toHaveValue('amount');
  await expect(dialog.getByLabel('目标金额', { exact: true })).toHaveValue('1000000');
  await expect(dialog.getByRole('radio', { name: '保持购买力', exact: true })).toBeChecked();
});

test('目标与高级口径输入区可滚动，固定摘要始终可见且无效输入清除旧结果', async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 460 });
  await page.goto('/?panel=goal&goal=passive-vs-income');
  const parent = page.getByRole('dialog', { name: '配置目标', exact: true });
  const summary = page.getByRole('region', { name: '草稿预测', exact: true });
  await expect(summary).toBeInViewport();
  const parentTop = (await summary.boundingBox())!.y;
  expect(await scrollEditorToEnd(parent.getByLabel('目标名称', { exact: true }))).toBeGreaterThan(0);
  await expect(summary).toBeInViewport();
  expect(Math.abs((await summary.boundingBox())!.y - parentTop)).toBeLessThan(1);
  await expect(parent.getByRole('button', { name: '保存目标', exact: true })).toBeInViewport();

  await parent.getByRole('button', { name: /^自定义左侧口径/ }).click();
  const advanced = page.getByRole('dialog', { name: '选择指标口径', exact: true });
  await expect(summary).toBeInViewport();
  const advancedTop = (await summary.boundingBox())!.y;
  expect(await scrollEditorToEnd(advanced.getByLabel('选择预设口径', { exact: true }))).toBeGreaterThan(0);
  await expect(summary).toBeInViewport();
  expect(Math.abs((await summary.boundingBox())!.y - advancedTop)).toBeLessThan(1);
  await expect(advanced.getByRole('button', { name: '确认口径', exact: true })).toBeInViewport();
  await advanced.getByRole('checkbox', { name: '外部被动收入', exact: true }).uncheck();
  await advanced.getByRole('checkbox', { name: '投资总收益', exact: true }).uncheck();
  await expect(summary.locator('strong')).toHaveText('—');
  await expect(summary.getByText('被动收入覆盖主动收入', { exact: true })).toBeVisible();
  await expect(summary.getByText('当前目标', { exact: true })).toHaveCount(0);
  await expect(summary).toBeInViewport();
  await expect(advanced.getByRole('button', { name: '确认口径', exact: true })).toBeDisabled();
});
