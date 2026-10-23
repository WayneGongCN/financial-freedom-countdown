import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFinanceDocument } from '../app/hooks/useFinanceDocument';
import { planDraft, parsePlanDraft, usePlanEditor } from '../app/hooks/usePlanEditor';
import { createMetricContext, evaluateMetric, metricPreset, simulatePlan } from '../src/index';
import { fixtureDocument, memoryStorage, wrapperFor } from './fixtures';

describe('集中调整计划核心参数', () => {
  it('首组优先编辑资产，并提供五项核心参数的精确输入与滑块', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    const fields = result.current.model!.sections[0]!.fields;
    expect(fields.map((field) => field.id)).toEqual(['assets', 'income', 'expenses', 'returnRate', 'inflation']);
    expect(fields.map((field) => field.unit)).toEqual(['元', '元/年', '元/年', '%', '%']);
    expect(fields[0]).toMatchObject({ value: '600000', slider: { min: 0, max: 10000000, step: 10000 } });
    expect(fields[1]).toMatchObject({ value: '240000', slider: { min: 0, max: 1000000, step: 1000 } });
    expect(fields[2]).toMatchObject({ value: '120000', slider: { min: 0, max: 1000000, step: 1000 } });
    expect(fields[3]).toMatchObject({ value: '8', slider: { min: -20, max: 30, step: 0.1 } });
    expect(fields[3]!.hint).toBe('填写未扣通胀的预期年化总收益率。');
    expect(fields[4]).toMatchObject({ label: '年通胀率', value: '3', slider: { min: -5, max: 10, step: 0.1 } });
    expect(fields[4]!.hint).toBe('0% 表示不计通胀；留空表示未设置。');
    const document = fixtureDocument();
    expect(result.current.model!.targetName).toBe(document.goals.find((goal) => goal.id === document.preferences.primaryGoalId)!.name);
  });

  it('收入与支出留空仍为未知，输入中间态阻止保存并移除旧预测', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    expect(result.current.model!.preview).toBeDefined();
    act(() => { result.current.change('income', ''); result.current.change('expenses', ''); result.current.change('returnRate', ''); });
    expect(result.current.parsed.value).toMatchObject({ activeIncome: null, currentExpenses: null, investmentReturn: null });
    expect(result.current.model!.sections[0]!.fields.map((field) => field.value)).toEqual(['600000', '', '', '', '3']);
    act(() => result.current.change('expenses', '-'));
    expect(result.current.draft!.expenses).toBe('-');
    expect(result.current.model!.canSave).toBe(false);
    expect(result.current.model!.preview).toBeUndefined();
    expect(result.current.model!.sections[0]!.fields[2]!.error).toContain('有效数字');
  });

  it('精确输入不受默认滑块范围或步长限制，年化百分比仅转换一次', () => {
    const plan = fixtureDocument().plan;
    const parsed = parsePlanDraft({ ...planDraft(plan), assets: '15000000.25', income: '1234567.89', expenses: '1000001.5', returnRate: '35.25' }, plan);
    expect(parsed.value).toMatchObject({
      initialAssets: 15000000.25,
      activeIncome: { amount: 1234567.89 }, currentExpenses: { amount: 1000001.5 },
      investmentReturn: { annualRate: 0.3525 },
    });
    expect(parsePlanDraft({ ...planDraft(plan), returnRate: '-20.1' }, plan).value?.investmentReturn?.annualRate).toBeCloseTo(-0.201);
    expect(parsePlanDraft({ ...planDraft(plan), returnRate: '-100' }, plan).errors.returnRate).toBeTruthy();
    expect(parsePlanDraft({ ...planDraft(plan), assets: '0' }, plan).value?.initialAssets).toBe(0);
    expect(parsePlanDraft({ ...planDraft(plan), assets: '-1' }, plan).errors.assets).toBe('资产不能为负数');
  });

  it('所有计划配置直接平铺在同一页面，四组增长字段具有唯一名称', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    act(() => { result.current.change('budgetKind', 'custom'); for (const prefix of ['income', 'expenses', 'external', 'budget']) result.current.change(`${prefix}Growth`, 'custom'); });
    const model = result.current.model!;
    const fields = model.sections.flatMap((section) => section.fields);
    expect(model).toMatchObject({ title: '我的计划', saveLabel: '完成并保存' });
    expect(model.sections.map((section) => section.id)).toEqual(['core-controls', 'income-growth', 'expense-growth', 'external', 'budget', 'horizon', 'amount-basis']);
    expect(model.sections.every((section) => !section.destination && !section.collapsed)).toBe(true);
    expect(model.sections.filter((section) => section.layout === 'growth').map((section) => section.id)).toEqual(['income-growth', 'expense-growth']);
    expect(model.sections.filter((section) => section.layout === 'compact').map((section) => section.id)).toEqual(['external', 'budget', 'horizon', 'amount-basis']);
    expect(model.sections.filter((section) => section.help === 'growth-rules').map((section) => section.id)).toEqual(['expense-growth']);
    expect(new Set(fields.map((field) => field.label)).size).toBe(fields.length);
    expect(fields.filter((field) => field.id.endsWith('Growth') || field.id.endsWith('Rate') && field.id !== 'returnRate').map((field) => field.label)).toEqual([
      '收入增长方式', '收入年增长率', '支出增长方式', '支出年增长率', '其他被动收入增长方式', '其他被动收入年增长率', '自由后预算增长方式', '自由后预算年增长率',
    ]);
  });

  it('卡片目标只保留在当前编辑会话，取消和保存后清除', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin('returnRate'));
    expect(result.current.targetField).toBe('returnRate');
    act(() => result.current.change('returnRate', '9'));
    expect(result.current.targetField).toBe('returnRate');
    act(() => result.current.cancel());
    expect(result.current.targetField).toBeUndefined();
    act(() => result.current.begin('assets'));
    act(() => { expect(result.current.save()).toBe(true); });
    expect(result.current.targetField).toBeUndefined();
    act(() => result.current.begin());
    expect(result.current.targetField).toBeUndefined();
  });

  it('预测期限在同一页面解释单位、换算与边界', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    const fields = result.current.model!.sections.flatMap((section) => section.fields);
    expect(fields.find((field) => field.id === 'horizon')).toMatchObject({ label: '最多向后预测', unit: '个月' });
    expect(fields.find((field) => field.id === 'horizon')!.hint).toContain('100 年');
    expect(fields.find((field) => field.id === 'horizon')!.hint).toContain('超期表示期内未达成');
    act(() => result.current.change('horizon', '600'));
    expect(result.current.model!.sections.flatMap((section) => section.fields).find((field) => field.id === 'horizon')!.hint).toContain('50 年');
    act(() => result.current.change('horizon', '1201'));
    expect(result.current.model!.canSave).toBe(false);
    expect(result.current.model!.sections.flatMap((section) => section.fields).find((field) => field.id === 'horizon')!.error).toContain('1～1200');
  });

  it('资产池外收入解释税费与不重复计算投资总收益', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    const section = result.current.model!.sections.find((section) => section.id === 'external')!;
    const field = section.fields[0]!;
    expect(field).toMatchObject({ id: 'external', label: '其他年被动收入（税费后）', unit: '元/年' });
    expect(field.hint).toContain('当前持续收取的资产池外税后收入');
    expect(field.hint).toContain('资产池内投资收益已计入总收益，不重复填写');
    expect(section.help).toBe('passive-income');
    expect(section.note).toContain('每月按当月年额 ÷ 12 计入结余和资产');
    expect(section.note).toContain('并纳入总被动收入');
    expect(section.note).toContain('资本目标仅在勾选抵扣其他被动收入时减少门槛');
  });

  it('四组增长规则独立保存，百分比仅转换一次', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    act(() => {
      result.current.change('budgetKind', 'custom');
      result.current.change('budget', '96000');
      result.current.change('external', '24000');
      for (const [prefix, rate] of [['income', '5'], ['expenses', '2'], ['external', '3'], ['budget', '4']]) {
        result.current.change(`${prefix}Growth`, 'custom');
        result.current.change(`${prefix}Rate`, rate!);
      }
    });
    expect(result.current.parsed.value).toMatchObject({
      activeIncome: { growth: { kind: 'custom', annualRate: 0.05 } },
      currentExpenses: { growth: { kind: 'custom', annualRate: 0.02 } },
      externalIncome: { amount: 24000, growth: { kind: 'custom', annualRate: 0.03 } },
      retirementBudget: { kind: 'custom', flow: { amount: 96000, growth: { kind: 'custom', annualRate: 0.04 } } },
    });
    const choices = result.current.model!.sections.flatMap((section) => section.fields).filter((field) => field.id.endsWith('Growth'));
    expect(choices).toHaveLength(4);
    for (const choice of choices) expect(choice.options?.map((option) => option.value)).toEqual(['fixed', 'inflation', 'custom']);
    act(() => result.current.change('expensesGrowth', 'inflation'));
    expect(result.current.parsed.value?.currentExpenses?.growth).toEqual({ kind: 'inflation' });
    expect(result.current.parsed.value?.activeIncome?.growth).toEqual({ kind: 'custom', annualRate: 0.05 });
  });

  it('预算来源切换在同页保留自定义草稿，引用当前支出同步金额与增长', () => {
    const { result } = renderHook(() => ({ editor: usePlanEditor(), api: useFinanceDocument() }), { wrapper: wrapperFor() });
    act(() => result.current.editor.begin());
    expect(result.current.editor.model!.sections.find((section) => section.id === 'budget')!.fields.map((field) => field.id)).toEqual(['budgetKind']);
    act(() => {
      result.current.editor.change('budgetKind', 'custom'); result.current.editor.change('budget', '96000');
      result.current.editor.change('budgetGrowth', 'custom'); result.current.editor.change('budgetRate', '2');
    });
    expect(result.current.editor.model!.sections.find((section) => section.id === 'budget')!.fields.find((field) => field.id === 'budget')!.unit).toBe('元/年');
    act(() => {
      result.current.editor.change('budgetKind', 'current'); result.current.editor.change('expenses', '180000'); result.current.editor.change('expensesGrowth', 'fixed');
    });
    expect(result.current.editor.draft).toMatchObject({ budget: '96000', budgetRate: '2' });
    expect(result.current.editor.parsed.value!.retirementBudget).toEqual({ kind: 'current' });
    expect(evaluateMetric(createMetricContext(result.current.editor.parsed.value!), metricPreset('freedom-capital'))).toMatchObject({ status: 'available', value: 4500000 });
    act(() => result.current.editor.change('budgetKind', 'custom'));
    expect(result.current.editor.parsed.value!.retirementBudget).toEqual({ kind: 'custom', flow: { amount: 96000, growth: { kind: 'custom', annualRate: 0.02 } } });
    expect(result.current.api.document.plan.retirementBudget).toEqual({ kind: 'current' });
    act(() => { expect(result.current.editor.save()).toBe(true); });
    expect(result.current.api.document.plan.retirementBudget).toMatchObject({ kind: 'custom', flow: { amount: 96000 } });
  });

  it('其他年收入按十二分之一进入每月结余，并只在明确抵扣时减少资本目标', () => {
    const source = fixtureDocument().plan;
    const plan = parsePlanDraft({ ...planDraft(source), returnRate: '0', inflation: '0', external: '24000', expensesGrowth: 'fixed' }, source).value!;
    expect(simulatePlan(plan).rows[1]).toMatchObject({ activeIncome: 20000, externalIncome: 2000, expenses: 10000, netCashFlow: 12000, assets: 612000 });
    const context = createMetricContext(plan);
    expect(evaluateMetric(context, metricPreset('passive-total'))).toMatchObject({ status: 'available', value: 24000 });
    const capital = metricPreset('freedom-capital');
    if (capital.kind !== 'required-capital') throw new Error('资本目标预设类型不正确');
    expect(evaluateMetric(context, capital)).toMatchObject({ status: 'available', value: 3000000 });
    expect(evaluateMetric(context, { ...capital, deductExternalIncome: true })).toMatchObject({ status: 'available', value: 2400000 });
  });

  it.each(['income', 'expenses', 'external', 'budget'])('同页 %s 自定义增长输入无效时不能保存，修正后恢复预测', (prefix) => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    act(() => {
      if (prefix === 'budget') result.current.change('budgetKind', 'custom');
      result.current.change(`${prefix}Growth`, 'custom'); result.current.change(`${prefix}Rate`, '.');
    });
    expect(result.current.model!.canSave).toBe(false);
    expect(result.current.model!.preview).toBeUndefined();
    expect(result.current.model!.sections.flatMap((section) => section.fields).find((field) => field.id === `${prefix}Rate`)!.error).toBeTruthy();
    act(() => result.current.change(`${prefix}Rate`, '2'));
    expect(result.current.model!.canSave).toBe(true);
    expect(result.current.model!.preview).toBeDefined();
  });

  it('新空白方案进入核心参数时不替用户填入财务金额', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor(memoryStorage(null)) });
    act(() => result.current.begin());
    expect(result.current.model!.sections[0]!.fields.map((field) => field.value)).toEqual(['', '', '', '', '0']);
    expect(result.current.parsed.value).toMatchObject({ activeIncome: null, currentExpenses: null, investmentReturn: null, inflationRate: 0 });
  });

  it.each([
    ['', null], ['0', 0], ['3', 0.03], ['-2', -0.02], ['12.345678', 0.12345678], ['-9.12345678', -0.0912345678],
  ] as const)('通胀输入 %s 保留未知、零或精确百分比，并保持收益率不变', (value, expected) => {
    const plan = fixtureDocument().plan;
    const parsed = parsePlanDraft({ ...planDraft(plan), inflation: value }, plan);
    expect(parsed.errors).toEqual({});
    if (expected === null) expect(parsed.value?.inflationRate).toBeNull();
    else expect(parsed.value?.inflationRate).toBeCloseTo(expected, 12);
    expect(parsed.value?.investmentReturn).toEqual({ annualRate: 0.08 });
  });

  it.each(['-', '..', '1e2', '-100'])('无效通胀 %s 保留输入中间态并清除旧预测', (value) => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    expect(result.current.model!.preview).toBeDefined();
    act(() => result.current.change('inflation', value));
    expect(result.current.draft!.inflation).toBe(value);
    expect(result.current.model!.sections[0]!.fields[4]!.error).toBeTruthy();
    expect(result.current.model!.canSave).toBe(false);
    expect(result.current.model!.preview).toBeUndefined();
  });

  it('取消通胀调整不写入，明确零和空白确认后可分别保存并恢复', () => {
    const storage = memoryStorage();
    const { result, unmount } = renderHook(() => ({ editor: usePlanEditor(), api: useFinanceDocument() }), { wrapper: wrapperFor(storage) });
    const originalStorage = [...storage.values.entries()];
    act(() => result.current.editor.begin());
    act(() => result.current.editor.change('inflation', '-1.25'));
    expect(result.current.editor.parsed.value?.inflationRate).toBe(-0.0125);
    expect(result.current.api.document.plan.inflationRate).toBe(0.03);
    act(() => result.current.editor.cancel());
    expect(result.current.api.document.plan.inflationRate).toBe(0.03);
    expect([...storage.values.entries()]).toEqual(originalStorage);
    act(() => result.current.editor.begin());
    act(() => result.current.editor.change('inflation', '0'));
    act(() => { expect(result.current.editor.save()).toBe(true); });
    expect(result.current.api.document.plan.inflationRate).toBe(0);
    const zeroRestored = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(storage) });
    expect(zeroRestored.result.current.document.plan.inflationRate).toBe(0);
    zeroRestored.unmount();
    act(() => result.current.editor.begin());
    act(() => result.current.editor.change('inflation', ''));
    act(() => { expect(result.current.editor.save()).toBe(true); });
    expect(result.current.api.document.plan.inflationRate).toBeNull();
    unmount();
    const restored = renderHook(() => ({ editor: usePlanEditor(), api: useFinanceDocument() }), { wrapper: wrapperFor(storage) });
    expect(restored.result.current.api.document.plan.inflationRate).toBeNull();
    act(() => restored.result.current.editor.begin());
    expect(restored.result.current.editor.draft!.inflation).toBe('');
    expect(restored.result.current.editor.draft!.returnRate).toBe('8');
  });
});
