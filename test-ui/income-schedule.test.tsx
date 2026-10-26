import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '../app/analytics';
import { useFinanceDocument } from '../app/hooks/useFinanceDocument';
import { calculateResults, evaluationModel, overviewModel, previewGoal } from '../app/hooks/useFinanceResults';
import { parsePlanDraft, planDraft, usePlanEditor } from '../app/hooks/usePlanEditor';
import { DEFAULT_STORAGE_KEY } from '../src/index';
import { fixtureDocument, memoryStorage, wrapperFor } from './fixtures';

vi.mock('../app/analytics', () => ({ trackEvent: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('收入阶段编辑', () => {
  it('单段默认不限期，指定期限后才能添加；新增空金额不能保存', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    expect(result.current.incomeSchedule!.canAdd).toBe(false);
    expect(result.current.incomeSchedule!.stages[0]!.fields.some((field) => field.id === 'income')).toBe(false);
    act(() => result.current.addIncomeStage());
    expect(result.current.incomeSchedule!.stages).toHaveLength(1);
    act(() => { result.current.change('incomeMode', 'finite'); result.current.change('incomeDuration', '5'); });
    expect(result.current.parsed.value!.activeIncome![0]!.durationMonths).toBe(60);
    expect(result.current.incomeSchedule!.stages[0]!.period).toBe('第 1～60 月');
    expect(result.current.incomeSchedule!.note).toContain('第 61 月起');
    act(() => result.current.addIncomeStage());
    expect(result.current.incomeSchedule!.stages[1]!.period).toBe('第 61 月起，不限期');
    expect(result.current.draft!.incomeStage1).toBe('');
    expect(result.current.model!.canSave).toBe(false);
    expect(result.current.model!.preview).toBeUndefined();
    expect(result.current.incomeSchedule!.stages[0]!.fields.find((field) => field.id === 'incomeMode')!.options).toEqual([{ value: 'finite', label: '指定时长' }]);
    act(() => result.current.change('incomeStage1', '0'));
    expect(result.current.parsed.value!.activeIncome![1]).toEqual({ amount: 0, growth: { kind: 'fixed' }, durationMonths: null });
    expect(result.current.model!.canSave).toBe(true);
  });

  it('年月换算保留时长，单纯换单位不计保存变化', () => {
    const document = fixtureDocument();
    document.plan.activeIncome![0]!.durationMonths = 5;
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor(memoryStorage(document)) });
    act(() => result.current.begin());
    expect(result.current.draft).toMatchObject({ incomeUnit: 'months', incomeDuration: '5' });
    act(() => result.current.change('incomeUnit', 'years'));
    expect(result.current.parsed.value!.activeIncome![0]!.durationMonths).toBe(5);
    act(() => result.current.change('incomeUnit', 'months'));
    expect(result.current.draft!.incomeDuration).toBe('5');
    act(() => result.current.save());
    expect(trackEvent).not.toHaveBeenCalledWith('plan_field_save', expect.anything());
    expect(trackEvent).toHaveBeenCalledWith('plan_save', { changed_fields: 0 });
  });

  it.each(['0', '-1', '0.1', '100.1', '.', ''])('拒绝非法年期限 %s，保留草稿供修正', (duration) => {
    const plan = fixtureDocument().plan;
    const parsed = parsePlanDraft({ ...planDraft(plan), incomeMode: 'finite', incomeDuration: duration }, plan);
    expect(parsed.value).toBeNull();
    expect(parsed.errors.incomeDuration).toBeTruthy();
  });

  it('未知收入与零收入不同，有限期的空金额不能静默丢失配置', () => {
    const plan = fixtureDocument().plan;
    expect(parsePlanDraft({ ...planDraft(plan), income: '' }, plan).value!.activeIncome).toBeNull();
    expect(parsePlanDraft({ ...planDraft(plan), income: '0' }, plan).value!.activeIncome![0]!.amount).toBe(0);
    const parsed = parsePlanDraft({ ...planDraft(plan), income: '', incomeMode: 'finite', incomeDuration: '1.5' }, plan);
    expect(parsed.value).toBeNull();
    expect(parsed.errors.income).toContain('无收入请填 0');
    expect(parsePlanDraft({ ...planDraft(plan), incomeMode: 'finite', incomeDuration: '1.5' }, plan).value!.activeIncome![0]!.durationMonths).toBe(18);
  });

  it('删除中间阶段衔接后续收入，修改预测期不裁剪阶段，取消不保存', () => {
    const document = fixtureDocument();
    document.plan.activeIncome = [
      { amount: 240000, growth: { kind: 'fixed' }, durationMonths: 60 },
      { amount: 0, growth: { kind: 'fixed' }, durationMonths: 12 },
      { amount: 120000, growth: { kind: 'custom', annualRate: 0.03 }, durationMonths: null },
    ];
    const storage = memoryStorage(document);
    const original = storage.values.get(DEFAULT_STORAGE_KEY);
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor(storage) });
    act(() => result.current.begin('income'));
    act(() => result.current.removeIncomeStage('income'));
    expect(result.current.incomeSchedule!.stages).toHaveLength(3);
    act(() => result.current.removeIncomeStage('incomeStage1'));
    expect(result.current.incomeSchedule!.stages[1]!.period).toBe('第 61 月起，不限期');
    expect(result.current.parsed.value!.activeIncome![1]).toEqual(document.plan.activeIncome[2]);
    act(() => result.current.change('horizon', '1'));
    expect(result.current.parsed.value!.activeIncome).toHaveLength(2);
    act(() => result.current.cancel());
    expect(storage.values.get(DEFAULT_STORAGE_KEY)).toBe(original);
    act(() => result.current.begin());
    expect(result.current.incomeSchedule!.stages).toHaveLength(3);
  });

  it('保存并恢复分段配置，阶段埋点只包含固定名称', () => {
    const storage = memoryStorage();
    const { result, unmount } = renderHook(() => ({ editor: usePlanEditor(), api: useFinanceDocument() }), { wrapper: wrapperFor(storage) });
    act(() => result.current.editor.begin());
    act(() => { result.current.editor.change('incomeMode', 'finite'); result.current.editor.change('incomeDuration', '5'); });
    act(() => result.current.editor.addIncomeStage());
    act(() => { result.current.editor.change('incomeStage1', '123456'); result.current.editor.change('incomeStage1Growth', 'custom'); result.current.editor.change('incomeStage1Rate', '3'); });
    act(() => { expect(result.current.editor.save()).toBe(true); });
    const expected = result.current.api.document.plan.activeIncome;
    expect(expected).toHaveLength(2);
    expect(trackEvent).toHaveBeenCalledWith('plan_field_save', { field_name: 'incomeSchedule' });
    expect(trackEvent).toHaveBeenCalledWith('plan_save', { changed_fields: 1 });
    const events = vi.mocked(trackEvent).mock.calls;
    expect(events.filter(([name]) => name === 'plan_field_edit')).toEqual([['plan_field_edit', { field_name: 'incomeSchedule', entry_point: 'plan' }]]);
    expect(JSON.stringify(events)).not.toMatch(/123456|incomeStage1|Duration|years/);
    unmount();
    const restored = renderHook(() => usePlanEditor(), { wrapper: wrapperFor(storage) });
    act(() => restored.result.current.begin());
    expect(restored.result.current.parsed.value!.activeIncome).toEqual(expected);
  });
});

describe('收入阶段结果说明', () => {
  it('收入卡显示基准月金额和期限，多段时显示阶段数量', () => {
    const document = fixtureDocument();
    document.plan.activeIncome![0]!.durationMonths = 60;
    expect(overviewModel(document, calculateResults(document, null)).coreMetrics.find((metric) => metric.fieldId === 'income')).toMatchObject({ value: '24', note: '持续 5 年后停止' });
    document.plan.activeIncome!.push({ amount: 0, growth: { kind: 'fixed' }, durationMonths: null });
    expect(overviewModel(document, calculateResults(document, null)).coreMetrics.find((metric) => metric.fieldId === 'income')).toMatchObject({ value: '24', note: '共 2 个阶段' });
  });

  it('首次达成之后仍显示期内资金不足，额外窗口不足不冒称期内问题', () => {
    const document = fixtureDocument();
    document.plan = { ...document.plan, initialAssets: 1000, inflationRate: 0, horizonMonths: 12, investmentReturn: { annualRate: 0 },
      activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: 1 }], currentExpenses: { amount: 12000, growth: { kind: 'fixed' } } };
    document.goals = [{ id: 'target', name: '资产目标', left: { kind: 'assets', basis: 'nominal' }, right: { kind: 'amount', amount: 1000, unit: 'capital', basis: 'nominal' }, ratio: 1, comparison: 'scenario' }];
    document.preferences.primaryGoalId = 'target';
    const results = calculateResults(document, null);
    expect(results.forecast).toMatchObject({ status: 'reached', firstMonth: 0 });
    expect(overviewModel(document, results).notices).toEqual(['预测期内第 2 月资金不足，不继续模拟借款。']);
    expect(previewGoal(document, 'target').notices).toEqual(['预测期内第 2 月资金不足，不继续模拟借款。']);
    document.project = { id: 'test', name: '测试', notes: '', cashFlows: [] };
    const comparison = calculateResults(document, document.project).comparison;
    expect(evaluationModel(document, comparison).notices).toEqual(['基准计划：预测期内第 2 月资金不足，不继续模拟借款。', '项目后：预测期内第 2 月资金不足，不继续模拟借款。']);
    document.plan.horizonMonths = 1;
    expect(overviewModel(document, calculateResults(document, null)).notices).toEqual([]);
  });

  it('收入目标提示门槛变化，支出资本目标不显示收入比较提示', () => {
    const document = fixtureDocument();
    document.plan.activeIncome![0]!.durationMonths = 60;
    document.preferences.primaryGoalId = 'passive-vs-income';
    expect(overviewModel(document, calculateResults(document, null)).notices?.join()).toContain('收入变化会影响比较门槛');
    expect(previewGoal(document, 'passive-vs-income').notices.join()).toContain('不代表持续覆盖支出');
    document.preferences.primaryGoalId = 'freedom-capital';
    const model = overviewModel(document, calculateResults(document, null));
    expect(model.notices?.join()).not.toContain('收入变化');
    expect(model.milestones.find((item) => item.id === 'passive-vs-income')!.rule).toContain('收入变化会影响比较门槛');
  });
});
