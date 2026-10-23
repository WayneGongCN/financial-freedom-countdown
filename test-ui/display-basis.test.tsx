import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFinanceDocument } from '../app/hooks/useFinanceDocument';
import { calculateResults, evaluationModel, overviewModel, previewGoal, useFinanceResults } from '../app/hooks/useFinanceResults';
import { exportDocument, type FinanceDocument, type Project } from '../src/index';
import { fixtureDocument, memoryStorage, wrapperFor } from './fixtures';

/** 使用固定收支，以独立验证通胀展示与财务假设，喵~ */
function documentWithInflation(inflationRate: number | null): FinanceDocument {
  const document = fixtureDocument();
  document.plan.inflationRate = inflationRate;
  document.plan.currentExpenses = { amount: 120000, growth: { kind: 'fixed' } };
  document.preferences.displayBasis = 'real';
  return document;
}

const expense: Project = { id: 'test-expense', name: '一次消费', notes: '', cashFlows: [{ id: 'payment', kind: 'expense', amount: 10000,
  growth: { kind: 'fixed' }, priceAnchorMonth: 0, startMonth: 0, endMonth: null, frequency: 'once', continuesAfterFreedom: true }] };

describe('金额显示与通胀假设', () => {
  it.each([null, 0])('通胀为 %s 时按名义金额显示且不提供无效切换', (inflationRate) => {
    const document = documentWithInflation(inflationRate);
    const calculated = calculateResults(document, expense);
    const overview = overviewModel(document, calculated);
    const evaluation = evaluationModel(document, calculated.comparison);
    expect(overview).toMatchObject({ basis: 'nominal', canChangeBasis: false });
    expect(evaluation).toMatchObject({ basis: 'nominal', canChangeBasis: false });
    expect(overview.basisLabel).toContain('名义金额');
    expect(evaluation.basisLabel).toContain('名义金额');
    expect(overview.projected?.value).not.toContain('—');
    expect(overview.projected?.note).toContain('名义金额');
    expect(overview.projected?.note).not.toContain('基准月约');
    expect(evaluation.impactHero?.value).not.toBe('—');
    expect(document.preferences.displayBasis).toBe('real');
    expect(document.plan.inflationRate).toBe(inflationRate);
  });

  it.each([0.03, -0.01])('非零通胀 %s 保留购买力切换及用户偏好', (inflationRate) => {
    const document = documentWithInflation(inflationRate);
    const calculated = calculateResults(document, expense);
    expect(overviewModel(document, calculated)).toMatchObject({ basis: 'real', canChangeBasis: true });
    expect(evaluationModel(document, calculated.comparison)).toMatchObject({ basis: 'real', canChangeBasis: true });
    const nominalDocument = { ...document, preferences: { ...document.preferences, displayBasis: 'nominal' as const } };
    expect(overviewModel(nominalDocument, calculated)).toMatchObject({ basis: 'nominal', canChangeBasis: true });
    expect(evaluationModel(nominalDocument, calculated.comparison)).toMatchObject({ basis: 'nominal', canChangeBasis: true });
  });

  it('显示币值切换保留同一次推演及达成日期', () => {
    const document = documentWithInflation(0.03);
    const { result } = renderHook(() => { const api = useFinanceDocument(); return { api, results: useFinanceResults(api.document) }; }, { wrapper: wrapperFor(memoryStorage(document)) });
    const calculated = result.current.results.calculated;
    const originalHero = result.current.results.overview.hero;
    const originalAmount = result.current.results.overview.projected?.value;
    act(() => { result.current.api.commit({ ...result.current.api.document, preferences: { ...result.current.api.document.preferences, displayBasis: 'nominal' } }); });
    expect(result.current.results.calculated).toBe(calculated);
    expect(result.current.results.overview.hero).toEqual(originalHero);
    expect(result.current.results.overview.projected?.value).not.toBe(originalAmount);
    expect(result.current.api.document.goals).toEqual(document.goals);
  });

  it('三项核心参数使用当前年金额，收益率统一显示未扣通胀的输入', () => {
    const document = documentWithInflation(0.03);
    document.plan.investmentReturn = { annualRate: 0.08 };
    const overview = overviewModel(document, calculateResults(document, null));
    expect(overview.coreMetrics).toEqual([
      { label: '年收入', value: '24', unit: '万元/年' },
      { label: '年化总收益率', value: '8', unit: '%' },
      { label: '年支出', value: '12', unit: '万元/年' },
    ]);
  });

  it('未填写的核心参数显示未知值', () => {
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(memoryStorage(null)) });
    const document = result.current.document;
    expect(overviewModel(document, calculateResults(document, null)).coreMetrics.map((metric) => metric.value)).toEqual(['—', '—', '—']);
  });

  it('草稿预览保留目标名称和缺失原因，目标缺失时可安全显示', () => {
    const document = documentWithInflation(null);
    const id = document.preferences.primaryGoalId!;
    const expected = overviewModel(document, calculateResults(document, null));
    const preview = previewGoal(document, id);
    expect(preview.targetName).toBe('支出覆盖目标（4%）');
    expect(preview.hero).toEqual({ ...expected.hero, label: '按此草稿预计还需' });
    expect(preview.rows[0]?.value).toBe('3,000,000 元');
    document.plan.investmentReturn = null;
    expect(previewGoal(document, id).hero.note).toContain('补充信息后可预测');
    expect(previewGoal(document, 'missing')).toMatchObject({ targetName: '未选择目标', rows: [], hero: { value: '—' } });
  });
});

describe('新文档默认值与旧档兼容', () => {
  it('新建与重新开始使用零通胀和名义金额', () => {
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(memoryStorage(null)) });
    expect(result.current.document.plan.inflationRate).toBe(0);
    expect(result.current.document.preferences.displayBasis).toBe('nominal');
    act(() => { result.current.commit(documentWithInflation(null)); });
    act(() => { result.current.reset(); });
    expect(result.current.document.plan.inflationRate).toBe(0);
    expect(result.current.document.preferences.displayBasis).toBe('nominal');
  });

  it('加载与导入旧档保留未知通胀及购买力偏好', () => {
    const legacy = documentWithInflation(null);
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(memoryStorage(legacy)) });
    expect(result.current.document).toEqual(legacy);
    act(() => { result.current.reset(); });
    act(() => { expect(result.current.importBackup(exportDocument(legacy))).toBeNull(); });
    expect(result.current.document).toEqual(legacy);
  });
});
