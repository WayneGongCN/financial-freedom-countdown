import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '../app/analytics';
import { useFinanceDocument } from '../app/hooks/useFinanceDocument';
import { calculateResults, overviewModel } from '../app/hooks/useFinanceResults';
import { parsePlanDraft, planDraft, usePlanEditor } from '../app/hooks/usePlanEditor';
import { DEFAULT_STORAGE_KEY } from '../src/index';
import { fixtureDocument, memoryStorage, wrapperFor } from './fixtures';

vi.mock('../app/analytics', () => ({ trackEvent: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('支出阶段编辑', () => {
  it('有限末段暂停预览和保存，但可添加下一段；补齐金额后恢复', () => {
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin('expenses'));
    expect(result.current.expenseSchedule!.canAdd).toBe(false);
    expect(result.current.expenseSchedule!.stages[0]!.fields.some((field) => field.id === 'expenses')).toBe(false);
    act(() => result.current.addExpenseStage());
    expect(result.current.expenseSchedule!.stages).toHaveLength(1);
    act(() => { result.current.change('expensesMode', 'finite'); result.current.change('expensesDuration', '10'); });
    expect(result.current.model!.canSave).toBe(false);
    expect(result.current.model!.preview).toBeUndefined();
    expect(result.current.parsed.errors.expensesMode).toContain('必须不限期');
    expect(result.current.expenseSchedule!.canAdd).toBe(true);
    expect(result.current.expenseSchedule!.stages[0]).toMatchObject({ period: '第 1～120 月', calendar: '2026 年 11 月～2036 年 10 月' });
    act(() => { expect(result.current.save()).toBe(false); });
    act(() => result.current.addExpenseStage());
    expect(result.current.draft).toMatchObject({ expensesStage1: '', expensesStage1Growth: 'inflation', expensesStage1Mode: 'open' });
    expect(result.current.expenseSchedule!.stages[1]).toMatchObject({ period: '第 121 月起，不限期', calendar: '2036 年 11 月起' });
    expect(result.current.model!.canSave).toBe(false);
    act(() => result.current.change('expensesStage1', '0'));
    expect(result.current.model!.canSave).toBe(true);
    expect(result.current.model!.preview).toBeDefined();
    expect(result.current.parsed.value!.currentExpenses![1]).toEqual({ amount: 0, growth: { kind: 'inflation' }, durationMonths: null });
    expect(result.current.incomeSchedule!.stages[0]!.calendar).toBe('2026 年 11 月起');
  });

  it('支出与收入单位换算、增删和取消互不污染，删除末段立即阻止保存', () => {
    const document = fixtureDocument();
    document.plan.currentExpenses = [
      { amount: 240000, growth: { kind: 'fixed' }, durationMonths: 5 },
      { amount: 180000, growth: { kind: 'custom', annualRate: 0.03 }, durationMonths: 12 },
      { amount: 120000, growth: { kind: 'inflation' }, durationMonths: null },
    ];
    const storage = memoryStorage(document);
    const original = storage.values.get(DEFAULT_STORAGE_KEY);
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor(storage) });
    act(() => result.current.begin());
    act(() => { result.current.change('incomeMode', 'finite'); result.current.change('incomeDuration', '2'); });
    act(() => result.current.addIncomeStage());
    act(() => result.current.change('incomeStage1', '0'));
    const income = result.current.parsed.value!.activeIncome;
    act(() => result.current.change('expensesUnit', 'years'));
    expect(result.current.parsed.value!.currentExpenses![0]!.durationMonths).toBe(5);
    act(() => result.current.change('expensesUnit', 'months'));
    expect(result.current.draft!.expensesDuration).toBe('5');
    act(() => result.current.removeExpenseStage('expenses'));
    expect(result.current.expenseSchedule!.stages).toHaveLength(3);
    act(() => result.current.removeExpenseStage('expensesStage1'));
    expect(result.current.parsed.value!.currentExpenses![1]).toEqual(document.plan.currentExpenses[2]);
    expect(result.current.expenseSchedule!.stages[1]!.period).toBe('第 6 月起，不限期');
    expect(result.current.parsed.value!.activeIncome).toEqual(income);
    expect(result.current.parsed.value!.currentExpenses).toHaveLength(2);
    act(() => result.current.removeExpenseStage('expensesStage1'));
    expect(result.current.model!.canSave).toBe(false);
    expect(result.current.model!.preview).toBeUndefined();
    expect(result.current.expenseSchedule!.canAdd).toBe(true);
    act(() => result.current.cancel());
    expect(storage.values.get(DEFAULT_STORAGE_KEY)).toBe(original);
    act(() => result.current.begin());
    expect(result.current.parsed.value!.currentExpenses).toEqual(document.plan.currentExpenses);
    expect(result.current.parsed.value!.activeIncome).toEqual(document.plan.activeIncome);
  });

  it('未知、显式零与无效输入分别处理', () => {
    const source = fixtureDocument().plan;
    expect(parsePlanDraft({ ...planDraft(source), expenses: '' }, source).value!.currentExpenses).toBeNull();
    expect(parsePlanDraft({ ...planDraft(source), expenses: '0' }, source).value!.currentExpenses![0]!.amount).toBe(0);
    const missing = parsePlanDraft({ ...planDraft(source), expenses: '', expensesMode: 'finite', expensesDuration: '1' }, source);
    expect(missing.errors.expenses).toContain('无支出请填 0');
    for (const duration of ['0', '-1', '0.1', '100.1', '.', '']) {
      const invalid = parsePlanDraft({ ...planDraft(source), expensesMode: 'finite', expensesDuration: duration }, source);
      expect(invalid.value).toBeNull();
      expect(invalid.errors.expensesDuration).toBeTruthy();
    }
    const { result } = renderHook(() => usePlanEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    act(() => { result.current.change('expensesMode', 'finite'); result.current.change('expensesDuration', '1.5'); });
    act(() => result.current.addExpenseStage());
    act(() => { result.current.change('expensesStage1', '120000'); result.current.change('expensesStage1Growth', 'custom'); result.current.change('expensesStage1Rate', '.'); });
    expect(result.current.model!.preview).toBeUndefined();
    expect(result.current.parsed.errors.expensesStage1Rate).toBeTruthy();
    act(() => result.current.change('expensesStage1Rate', '2'));
    expect(result.current.parsed.value!.currentExpenses![0]!.durationMonths).toBe(18);
    expect(result.current.parsed.value!.currentExpenses![1]!.growth).toEqual({ kind: 'custom', annualRate: 0.02 });
  });

  it('保存恢复两类阶段，首页显示数量，阶段埋点不带金额或日期', () => {
    const storage = memoryStorage();
    const { result, unmount } = renderHook(() => ({ editor: usePlanEditor(), api: useFinanceDocument() }), { wrapper: wrapperFor(storage) });
    act(() => result.current.editor.begin());
    act(() => { result.current.editor.change('expensesMode', 'finite'); result.current.editor.change('expensesDuration', '10'); });
    act(() => result.current.editor.addExpenseStage());
    act(() => result.current.editor.change('expensesStage1', '123456'));
    act(() => { expect(result.current.editor.save()).toBe(true); });
    const expected = result.current.api.document;
    expect(expected.schemaVersion).toBe(4);
    expect(expected.modelVersion).toBe('4.0.0');
    expect(overviewModel(expected, calculateResults(expected, null)).coreMetrics.find((metric) => metric.fieldId === 'expenses')).toMatchObject({ value: '12', note: '共 2 个阶段' });
    expect(trackEvent).toHaveBeenCalledWith('plan_field_save', { field_name: 'expenseSchedule' });
    expect(vi.mocked(trackEvent).mock.calls.filter(([name]) => name === 'plan_field_edit')).toEqual([['plan_field_edit', { field_name: 'expenseSchedule', entry_point: 'plan' }]]);
    expect(JSON.stringify(vi.mocked(trackEvent).mock.calls)).not.toMatch(/123456|expensesStage1|Duration|2036/);
    unmount();
    const restored = renderHook(() => usePlanEditor(), { wrapper: wrapperFor(storage) });
    act(() => restored.result.current.begin());
    expect(restored.result.current.parsed.value).toEqual(expected.plan);
    vi.clearAllMocks();
    act(() => restored.result.current.change('expensesUnit', 'months'));
    act(() => restored.result.current.save());
    expect(trackEvent).not.toHaveBeenCalledWith('plan_field_save', expect.anything());
  });

  it('旧版本本地存档读取失败后保留原始数据，提示重新开始或导入', () => {
    const storage = memoryStorage(null);
    const original = JSON.stringify({ ...fixtureDocument(), schemaVersion: 3, modelVersion: '3.0.0' });
    storage.values.set(DEFAULT_STORAGE_KEY, original);
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(storage) });
    expect(result.current.blocked).toBe(true);
    expect(result.current.error).toBeTruthy();
    expect(storage.values.get(DEFAULT_STORAGE_KEY)).toBe(original);
  });
});
