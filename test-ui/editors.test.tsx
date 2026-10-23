import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFinanceDocument } from '../app/hooks/useFinanceDocument';
import { planDraft, parsePlanDraft, usePlanEditor } from '../app/hooks/usePlanEditor';
import { goalDraft, parseGoalDraft, useGoalEditor } from '../app/hooks/useGoalEditor';
import { parseProjectDraft, projectDraft, useProjectEditor } from '../app/hooks/useProjectEditor';
import { useFinanceResults } from '../app/hooks/useFinanceResults';
import { monthAt, monthOffset } from '../app/model/format';
import { createDefaultGoals, DEFAULT_STORAGE_KEY } from '../src/index';
import { fixtureDocument, memoryStorage, wrapperFor } from './fixtures';

describe('计划草稿与正式方案', () => {
  it('金额空白与零不同，输入中间态不变成零', () => {
    const plan = fixtureDocument().plan;
    const draft = planDraft(plan);
    expect(parsePlanDraft({ ...draft, assets: '' }, plan).value?.initialAssets).toBeNull();
    expect(parsePlanDraft({ ...draft, assets: '0' }, plan).value?.initialAssets).toBe(0);
    expect(parsePlanDraft({ ...draft, assets: '.' }, plan).value).toBeNull();
    expect(parsePlanDraft({ ...draft, returnRate: '-100' }, plan).errors.returnRate).toBeTruthy();
    expect(parsePlanDraft({ ...draft, assets: '1e6' }, plan).value).toBeNull();
  });
  it('百分比只转换一次，随通胀保存为联动规则', () => {
    const plan = fixtureDocument().plan;
    const result = parsePlanDraft({ ...planDraft(plan), incomeGrowth: 'custom', incomeRate: '5', inflation: '3' }, plan).value!;
    expect(result.investmentReturn?.annualRate).toBe(0.08);
    expect(result.activeIncome?.growth).toEqual({ kind: 'custom', annualRate: 0.05 });
    expect(result.currentExpenses?.growth).toEqual({ kind: 'inflation' });
  });
  it('空通胀、明确零通胀和自定义通胀独立处理', () => {
    const plan = fixtureDocument().plan;
    expect(parsePlanDraft({ ...planDraft(plan), inflationMode: 'unknown' }, plan).value?.inflationRate).toBeNull();
    expect(parsePlanDraft({ ...planDraft(plan), inflationMode: 'zero' }, plan).value?.inflationRate).toBe(0);
    expect(parsePlanDraft({ ...planDraft(plan), inflationMode: 'custom', inflation: '' }, plan).value).toBeNull();
  });
  it('编辑预览不污染正式计划，取消后保持原值', () => {
    const { result } = renderHook(() => ({ api: useFinanceDocument(), editor: usePlanEditor() }), { wrapper: wrapperFor() });
    act(() => result.current.editor.begin());
    act(() => result.current.editor.change('expenses', '240000'));
    expect(result.current.editor.model?.rows?.[0]?.value).toContain('6,000,000');
    expect(result.current.api.document.plan.currentExpenses?.amount).toBe(120000);
    act(() => result.current.editor.cancel());
    expect(result.current.editor.model).toBeNull();
    expect(result.current.api.document.plan.currentExpenses?.amount).toBe(120000);
  });
  it('子步骤确认仅修改父草稿，取消子步骤恢复进入前状态', () => {
    const { result } = renderHook(() => ({ api: useFinanceDocument(), editor: usePlanEditor() }), { wrapper: wrapperFor() });
    act(() => result.current.editor.begin());
    act(() => result.current.editor.enterStep('income'));
    act(() => result.current.editor.change('incomeGrowth', 'inflation'));
    act(() => result.current.editor.cancelStep());
    expect(result.current.editor.draft?.incomeGrowth).toBe('fixed');
    act(() => result.current.editor.enterStep('income'));
    act(() => result.current.editor.change('incomeGrowth', 'inflation'));
    act(() => result.current.editor.confirmStep());
    expect(result.current.api.document.plan.activeIncome?.growth.kind).toBe('fixed');
    act(() => { expect(result.current.editor.save()).toBe(true); });
    expect(result.current.api.document.plan.activeIncome?.growth.kind).toBe('inflation');
  });
});

describe('目标编辑', () => {
  it('缺少资产等输入时也能阻止两侧不兼容的单位和窗口', () => {
    const draft = goalDraft(createDefaultGoals()[0]!);
    expect(parseGoalDraft({ ...draft, rightKind: 'assets' }).error).toContain('相同单位');
    expect(parseGoalDraft({ ...draft, rightWindow: 'annualized' }).value).toBeNull();
    expect(parseGoalDraft({ ...draft, rightBasis: 'real' }).value).toBeNull();
  });
  it('拒绝重复收益组成，允许固定金额目标独立选择购买力', () => {
    const draft = goalDraft(createDefaultGoals()[0]!);
    expect(parseGoalDraft({ ...draft, 'left:investment-total': 'true' }).value).toBeNull();
    const amount = { ...draft, leftKind: 'assets', rightType: 'amount', amount: '1000000', amountUnit: 'capital', amountBasis: 'real' };
    expect(parseGoalDraft(amount).value?.right).toEqual({ kind: 'amount', amount: 1000000, unit: 'capital', basis: 'real' });
  });
  it('子口径可以先确认，再调整另一侧以达到兼容', () => {
    const { result } = renderHook(() => useGoalEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin('passive-vs-income'));
    act(() => result.current.enterSide('left'));
    act(() => result.current.change('leftBasis', 'real'));
    expect(result.current.model?.canSave).toBe(true);
    act(() => result.current.confirmSide());
    expect(result.current.model?.canSave).toBe(false);
  });
  it('复制为未提交新目标，取消不会新增记录', () => {
    const { result } = renderHook(() => ({ api: useFinanceDocument(), editor: useGoalEditor() }), { wrapper: wrapperFor() });
    act(() => result.current.editor.begin('freedom-capital'));
    act(() => result.current.editor.duplicate());
    expect(result.current.editor.isNew).toBe(true);
    expect(result.current.api.document.goals).toHaveLength(3);
    act(() => result.current.editor.save());
    expect(result.current.api.document.goals).toHaveLength(4);
  });
  it('删除主目标时同步选择有效的剩余目标', () => {
    const { result } = renderHook(() => ({ api: useFinanceDocument(), editor: useGoalEditor() }), { wrapper: wrapperFor() });
    act(() => result.current.editor.begin('freedom-capital'));
    act(() => result.current.editor.remove());
    expect(result.current.api.document.preferences.primaryGoalId).toBe('passive-vs-saving');
    expect(result.current.api.document.goals).toHaveLength(2);
  });
});

describe('现金流输入', () => {
  it('年月偏移不依赖时区，固定合同报价与基准报价可以区分', () => {
    expect(monthOffset('2026-10', '2028-10')).toBe(24);
    expect(monthAt('2026-10', 24)).toBe('2028-10');
    const plan = fixtureDocument().plan;
    const draft = projectDraft(null, plan);
    draft.flows[0] = { ...draft.flows[0]!, amount: '10000', start: '2028-10', anchor: 'start' };
    expect(parseProjectDraft(draft, plan).value?.cashFlows[0]?.priceAnchorMonth).toBe(24);
    draft.flows[0].anchor = 'base'; draft.flows[0].amountGrowth = 'inflation';
    expect(parseProjectDraft(draft, plan).value?.cashFlows[0]?.growth.kind).toBe('inflation');
  });
  it('有限付款拒绝反向期限，结束月份可以与开始月份相同', () => {
    const plan = fixtureDocument().plan;
    const draft = projectDraft(null, plan);
    draft.flows[0] = { ...draft.flows[0]!, amount: '100', frequency: 'monthly', start: '2027-01', end: '2026-12' };
    expect(parseProjectDraft(draft, plan).value).toBeNull();
    draft.flows[0].end = '2027-01';
    expect(parseProjectDraft(draft, plan).value?.cashFlows[0]?.endMonth).toBe(3);
  });
  it('有效项目输入保存试算，但不修改正式资产和基础支出', () => {
    const { result } = renderHook(() => ({ api: useFinanceDocument(), editor: useProjectEditor() }), { wrapper: wrapperFor() });
    const id = result.current.editor.draft.flows[0]!.id!;
    act(() => result.current.editor.change(`${id}.amount`, '10000'));
    expect(result.current.api.document.project?.cashFlows[0]?.amount).toBe(10000);
    expect(result.current.api.document.plan.initialAssets).toBe(600000);
    act(() => result.current.editor.change(`${id}.amount`, '.'));
    expect(result.current.editor.parsed.value).toBeNull();
    expect(result.current.api.document.project?.cashFlows[0]?.amount).toBe(10000);
    act(() => result.current.editor.clear());
    expect(result.current.api.document.project).toBeNull();
  });
});

describe('持久化与缓存边界', () => {
  it('读取失败不会自动覆盖原始数据', () => {
    const storage = memoryStorage(); storage.values.set(DEFAULT_STORAGE_KEY, 'broken');
    const write = vi.spyOn(storage, 'setItem');
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(storage) });
    expect(result.current.blocked).toBe(true);
    act(() => result.current.commit(fixtureDocument()));
    expect(write).not.toHaveBeenCalled();
    expect(storage.values.get(DEFAULT_STORAGE_KEY)).toBe('broken');
  });
  it('保存失败保留内存修改，并可以重试', () => {
    const storage = memoryStorage(); const write = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(storage) });
    act(() => result.current.commit({ ...result.current.document, plan: { ...result.current.document.plan, initialAssets: 700000 } }));
    expect(result.current.document.plan.initialAssets).toBe(700000);
    expect(result.current.error).toContain('保存失败');
    write.mockRestore(); act(() => result.current.retrySave());
    expect(result.current.error).toBeNull();
    expect(JSON.parse(storage.values.get(DEFAULT_STORAGE_KEY)!).plan.initialAssets).toBe(700000);
  });
  it('未知版本导入保留旧方案，有效导入保留基准月份', () => {
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor() });
    const previous = result.current.document;
    act(() => { expect(result.current.importBackup(JSON.stringify({ ...previous, schemaVersion: 99 }))).toBeTruthy(); });
    expect(result.current.document).toBe(previous);
    act(() => { expect(result.current.importBackup(JSON.stringify({ ...previous, plan: { ...previous.plan, baseMonth: '2020-01' } }))).toBeNull(); });
    expect(result.current.document.plan.baseMonth).toBe('2020-01');
  });
  it('显示币值切换复用同一财务计算，日期与目标定义不变', () => {
    const { result } = renderHook(() => { const api = useFinanceDocument(); return { api, results: useFinanceResults(api.document) }; }, { wrapper: wrapperFor() });
    const original = result.current.results.calculated;
    act(() => result.current.api.commit({ ...result.current.api.document, preferences: { ...result.current.api.document.preferences, displayBasis: 'nominal' } }));
    expect(result.current.results.calculated).toBe(original);
    expect(result.current.results.overview.hero).toMatchObject({ value: '15', unit: '年 5 个月' });
    expect(result.current.results.overview.projected?.value).toContain('473.18');
  });
});

describe('预测状态和结果契约', () => {
  it.each([
    { inflation: 0, incomeGrowth: 0, before: 117, after: 118 },
    { inflation: 0.03, incomeGrowth: 0, before: 185, after: 186 },
    { inflation: 0.03, incomeGrowth: 0.03, before: 145, after: 146 },
  ])('复现通胀 $inflation / 收入增长 $incomeGrowth 的前后日期', ({ inflation, incomeGrowth, before, after }) => {
    const document = fixtureDocument();
    document.plan.inflationRate = inflation;
    document.plan.activeIncome!.growth = { kind: 'custom', annualRate: incomeGrowth };
    const draft = projectDraft(null, document.plan);
    draft.flows[0]!.amount = '10000';
    document.project = parseProjectDraft(draft, document.plan).value;
    const { result } = renderHook(() => useFinanceResults(document));
    const comparison = result.current.calculated.comparison!.goals.find((g) => g.goalId === 'freedom-capital')!;
    expect(comparison.baseline.firstMonth).toBe(before);
    expect(comparison.scenario.firstMonth).toBe(after);
  });
  it('缺少收益率或通胀不显示虚假的零月日期', () => {
    const document = fixtureDocument();
    document.plan.investmentReturn = null;
    const { result, rerender } = renderHook(() => useFinanceResults(document));
    expect(result.current.overview.hero.value).toBe('—');
    expect(result.current.overview.hero.note).toContain('补充');
    document.plan = { ...fixtureDocument().plan, inflationRate: null };
    rerender();
    expect(result.current.overview.hero.value).toBe('—');
    expect(result.current.overview.projected).toBeNull();
  });
  it('已达成保留真实覆盖率并限制进度条', () => {
    const document = fixtureDocument(); document.plan.initialAssets = 6000000;
    const { result } = renderHook(() => useFinanceResults(document));
    expect(result.current.overview.hero.value).toBe('已达成');
    expect(result.current.overview.coverage).toBe('已完成 200%');
    expect(result.current.overview.progress).toBe(100);
  });
  it('主目标切换为流量时同步标题和年流量单位', () => {
    const document = fixtureDocument(); document.preferences.primaryGoalId = 'passive-vs-income';
    const { result } = renderHook(() => useFinanceResults(document));
    expect(result.current.overview.title).toBe(document.goals[1]!.name);
    expect(result.current.overview.target).toContain('万/年');
    expect(result.current.overview.balances[0]?.unit).toBe('万/年');
  });
  it('测算期内未达成明确使用回退参考月，资金不足不显示延迟零月', () => {
    const document = fixtureDocument(); document.plan.horizonMonths = 12;
    const draft = projectDraft(null, document.plan); draft.flows[0]!.amount = '10000';
    document.project = parseProjectDraft(draft, document.plan).value;
    const { result, rerender } = renderHook(() => useFinanceResults(document));
    expect(result.current.evaluation.comparisonNote).toContain('比较月份：第 12 个月');
    expect(result.current.evaluation.hero.value).toBe('—');
    document.project = { ...document.project!, cashFlows: [{ ...document.project!.cashFlows[0]!, amount: 1000000 }] };
    rerender();
    expect(result.current.evaluation.hero.note).toContain('无法推演');
  });
  it('首次只填年支出生成预览，尚未保存时正式计划仍为空', () => {
    const { result } = renderHook(() => ({ api: useFinanceDocument(), editor: usePlanEditor() }), { wrapper: wrapperFor(memoryStorage(null)) });
    act(() => result.current.editor.changeInitialExpense('120000'));
    expect(result.current.editor.initialTarget).toContain('300');
    expect(result.current.api.document.plan.currentExpenses).toBeNull();
    act(() => result.current.editor.begin());
    expect(result.current.editor.draft?.expenses).toBe('120000');
    expect(result.current.editor.draft?.assets).toBe('');
  });
});
