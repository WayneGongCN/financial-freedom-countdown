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
  it('未知通胀保留名义金额并在目标小字明确说明', () => {
    const document = documentWithInflation(null);
    const calculated = calculateResults(document, expense);
    const overview = overviewModel(document, calculated);
    const evaluation = evaluationModel(document, calculated.comparison);
    expect(overview).toMatchObject({ basis: 'nominal', basisLabel: '通胀未设置，暂按名义金额展示' });
    expect(evaluation).toMatchObject({ basis: 'nominal', canChangeBasis: false });
    expect(overview.projected.value).not.toContain('—');
    expect(overview.projected.note).toBe('通胀未设置，暂按名义金额展示');
    expect(evaluation.impactHero?.value).not.toBe('—');
    expect(document.preferences.displayBasis).toBe('real');
    expect(document.plan.inflationRate).toBeNull();
  });

  it.each([0, 0.03, -0.01])('已设置通胀 %s 时总览固定展示基准月购买力和届时名义金额', (inflationRate) => {
    const document = documentWithInflation(inflationRate);
    const calculated = calculateResults(document, expense);
    const overview = overviewModel(document, calculated);
    expect(overview).toMatchObject({ basis: 'real', basisLabel: '购买力基准 · 2026 年 10 月' });
    expect(overview.projected.value).not.toBe('—');
    expect(overview.projected.note).toMatch(/^2026 年 10 月购买力 · 届时约 .+（名义金额）$/);
    expect(overview).not.toHaveProperty('canChangeBasis');
    const nominalDocument = { ...document, preferences: { ...document.preferences, displayBasis: 'nominal' as const } };
    expect(overviewModel(nominalDocument, calculated)).toEqual(overview);
    expect(nominalDocument.preferences.displayBasis).toBe('nominal');
    expect(nominalDocument.plan.inflationRate).toBe(inflationRate);
  });

  it.each([null, 0, 0.03, -0.01])('消费评估在通胀 %s 时保留原有显示偏好与切换规则', (inflationRate) => {
    const document = documentWithInflation(inflationRate);
    const calculated = calculateResults(document, expense);
    const canChangeBasis = inflationRate !== null && inflationRate !== 0;
    expect(evaluationModel(document, calculated.comparison)).toMatchObject({ basis: canChangeBasis ? 'real' : 'nominal', canChangeBasis });
    const nominalDocument = { ...document, preferences: { ...document.preferences, displayBasis: 'nominal' as const } };
    expect(evaluationModel(nominalDocument, calculated.comparison)).toMatchObject({ basis: 'nominal', canChangeBasis });
  });

  it('显示币值切换保留同一次推演及达成日期', () => {
    const document = documentWithInflation(0.03);
    const { result } = renderHook(() => { const api = useFinanceDocument(); return { api, results: useFinanceResults(api.document) }; }, { wrapper: wrapperFor(memoryStorage(document)) });
    const calculated = result.current.results.calculated;
    const originalHero = result.current.results.overview.hero;
    const originalOverview = result.current.results.overview;
    act(() => { result.current.api.commit({ ...result.current.api.document, preferences: { ...result.current.api.document.preferences, displayBasis: 'nominal' } }); });
    expect(result.current.results.calculated).toBe(calculated);
    expect(result.current.results.overview.hero).toEqual(originalHero);
    expect(result.current.results.overview).toEqual(originalOverview);
    expect(result.current.api.document.goals).toEqual(document.goals);
  });

  it('五项核心参数按资产、收入、支出、收益和通胀排序并标记编辑字段', () => {
    const document = documentWithInflation(0.03);
    document.plan.investmentReturn = { annualRate: 0.08 };
    const overview = overviewModel(document, calculateResults(document, null));
    expect(overview.coreMetrics).toEqual([
      { fieldId: 'assets', label: '当前可投资资产', value: '60', unit: '万元' },
      { fieldId: 'income', label: '年收入', value: '24', unit: '万元/年' },
      { fieldId: 'expenses', label: '年支出', value: '12', unit: '万元/年' },
      { fieldId: 'returnRate', label: '年化总收益率', value: '8', unit: '%' },
      { fieldId: 'inflation', label: '通胀率', value: '3', unit: '%' },
    ]);
    expect(overview).not.toHaveProperty('assumptions');
    expect(overview.gap).toEqual({ label: '当前缺口', value: '240', unit: '万', tone: 'negative' });
    expect(overview.balances).toEqual([]);
  });

  it('未填写的核心参数显示未知值', () => {
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(memoryStorage(null)) });
    const document = result.current.document;
    document.plan.inflationRate = null;
    document.plan.investmentReturn = null;
    expect(overviewModel(document, calculateResults(document, null)).coreMetrics.map((metric) => metric.value)).toEqual(['—', '—', '—', '—', '—']);
  });

  it('非资产目标保留当前指标，独立缺口使用年流量单位', () => {
    const document = documentWithInflation(0.03);
    document.preferences.primaryGoalId = 'passive-vs-income';
    const overview = overviewModel(document, calculateResults(document, null));
    expect(overview.balances.map((balance) => balance.label)).toEqual(['当前指标']);
    expect(overview.balances[0]?.unit).toBe('万/年');
    expect(overview.gap).toMatchObject({ label: '当前缺口', unit: '万/年', tone: 'negative' });
    expect(overview.gap.value).not.toBe('—');
  });

  it('未知资产的缺口保留未知值而不显示零', () => {
    const document = documentWithInflation(0.03);
    document.plan.initialAssets = null;
    const overview = overviewModel(document, calculateResults(document, null));
    expect(overview.gap).toEqual({ label: '当前缺口', value: '—', unit: '万', tone: 'negative' });
    expect(overview.balances).toEqual([]);
  });

  it.each([
    { assets: 3000000, label: '当前缺口', value: '0' },
    { assets: 4000000, label: '已超出目标', value: '100' },
  ])('已达成资产目标保留缺口与超额语义：$assets', ({ assets, label, value }) => {
    const document = documentWithInflation(0.03);
    document.plan.initialAssets = assets;
    const overview = overviewModel(document, calculateResults(document, null));
    expect(overview.gap).toEqual({ label, value, unit: '万', tone: 'positive' });
    expect(overview.hero.value).toBe('已达成');
    expect(overview.balances).toEqual([]);
  });

  it.each([null, 0.03])('预测缺失时目标模块仍返回占位金额和现有原因，通胀为 %s', (inflationRate) => {
    const document = documentWithInflation(inflationRate);
    document.plan.investmentReturn = null;
    const overview = overviewModel(document, calculateResults(document, null));
    expect(overview.projected).toMatchObject({ title: '预计达成月份的目标', value: '—' });
    expect(overview.projected.note).toContain(overview.hero.note);
    expect(overview.projected.note).toContain(overview.basisLabel);
    expect(overview.hero).toMatchObject({ value: '—' });
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
  it('新建与重新开始使用默认通胀和收益及名义金额存储偏好，总览使用购买力显示', () => {
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(memoryStorage(null)) });
    expect(result.current.document.plan.inflationRate).toBe(0.02);
    expect(result.current.document.plan.investmentReturn).toEqual({ annualRate: 0.05 });
    expect(result.current.document.preferences.displayBasis).toBe('nominal');
    expect(overviewModel(result.current.document, calculateResults(result.current.document, null)).basis).toBe('real');
    act(() => { result.current.commit(documentWithInflation(null)); });
    act(() => { result.current.reset(); });
    expect(result.current.document.plan.inflationRate).toBe(0.02);
    expect(result.current.document.plan.investmentReturn).toEqual({ annualRate: 0.05 });
    expect(result.current.document.preferences.displayBasis).toBe('nominal');
  });

  it('加载与导入旧档保留未知通胀、未知收益及购买力偏好', () => {
    const legacy = documentWithInflation(null);
    legacy.plan.investmentReturn = null;
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(memoryStorage(legacy)) });
    expect(result.current.document).toEqual(legacy);
    act(() => { result.current.reset(); });
    act(() => { expect(result.current.importBackup(exportDocument(legacy))).toBeNull(); });
    expect(result.current.document).toEqual(legacy);
  });
});
