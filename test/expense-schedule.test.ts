import { describe, expect, it } from 'vitest';
import {
  annualValue, compareProject, createDocument, createMetricContext, expensesAnnualAt,
  evaluateMetric, exportDocument, importDocument, metricPreset, planSchema, simulatePlan,
  type FlowStage, type MetricSpec,
} from '../src/index.js';
import { flow, plan, project } from './fixtures.js';

/** 创建固定年额的测试阶段，喵~ */
function stage(amount: number, durationMonths: number | null): FlowStage {
  return { amount, growth: { kind: 'fixed' }, durationMonths };
}
const expenses: MetricSpec = { kind: 'flow', components: ['expenses'], basis: 'nominal', aggregation: 'next-12-months' };

describe('支出阶段计算', () => {
  it('月末扣款、年化支出、未来一年和资本目标在同一边界切换', () => {
    const p = plan({ inflationRate: 0, investmentReturn: { annualRate: 0 }, currentExpenses: [stage(240000, 2), stage(120000, null)] });
    const context = createMetricContext(p);
    expect(context.projection.rows.slice(0, 4).map((row) => row.expenses)).toEqual([0, 20000, 20000, 10000]);
    expect(context.projection.rows.slice(1, 4).map((row) => row.netCashFlow)).toEqual([0, 0, 10000]);
    expect(evaluateMetric(context, expenses)).toMatchObject({ value: -140000 });
    expect(evaluateMetric(context, metricPreset('active-surplus'))).toMatchObject({ value: 100000 });
    for (const month of [0, 2, 3]) {
      const annual = month <= 2 ? 240000 : 120000;
      expect(evaluateMetric(context, { ...expenses, aggregation: 'annualized' }, month)).toMatchObject({ value: -annual });
      expect(evaluateMetric(context, metricPreset('freedom-capital'), month)).toMatchObject({ value: annual / 0.04 });
    }
  });

  it.each([{ kind: 'fixed' }, { kind: 'inflation' }, { kind: 'custom', annualRate: 0.05 }] as const)('单段不限期保持原年额增长结果 %j', (growth) => {
    const input = { amount: 120000, growth };
    const p = plan({ currentExpenses: [{ ...input, durationMonths: null }] });
    for (const month of [0, 1, 12, 120, 1212]) {
      expect(expensesAnnualAt(p, month)).toBe(annualValue(input, p, month, 'currentExpenses'));
    }
  });

  it('每段增长从自己的起点重算，不继承前段金额或累计增长', () => {
    const p = plan({ inflationRate: 0.12, currentExpenses: [
      { amount: 240000, growth: { kind: 'custom', annualRate: 0.21 }, durationMonths: 12 },
      { amount: 120000, growth: { kind: 'inflation' }, durationMonths: 12 },
      stage(60000, null),
    ] });
    expect(expensesAnnualAt(p, 12)).toBeCloseTo(240000 * 1.21);
    expect(expensesAnnualAt(p, 13)).toBeCloseTo(120000 * 1.12 ** (1 / 12));
    expect(expensesAnnualAt(p, 24)).toBeCloseTo(120000 * 1.12);
    expect(expensesAnnualAt(p, 25)).toBe(60000);
    const context = createMetricContext(p);
    const expected = Array.from({ length: 12 }, (_, index) => {
      const month = index + 13;
      return -expensesAnnualAt(p, month) / 12 / (1.12 ** (month / 12));
    }).reduce((sum, value) => sum + value, 0);
    expect(evaluateMetric(context, { ...expenses, basis: 'real' }, 12)).toMatchObject({ status: 'available' });
    const actual = evaluateMetric(context, { ...expenses, basis: 'real' }, 12);
    if (actual.status === 'available') expect(actual.value).toBeCloseTo(expected);
  });

  it('单独设置的自由后预算独立于支出阶段，项目仍叠加一次', () => {
    const p = plan({ inflationRate: 0, currentExpenses: [stage(240000, 2), stage(120000, null)],
      retirementBudget: { kind: 'custom', flow: { amount: 96000, growth: { kind: 'fixed' } } } });
    const item = project(flow({ amount: 1000, frequency: 'monthly', startMonth: 1, endMonth: null, continuesAfterFreedom: true }));
    const context = createMetricContext(p, item);
    expect(context.projection.rows[3]!.expenses).toBe(11000);
    for (const month of [0, 2, 3]) expect(evaluateMetric(context, metricPreset('freedom-capital'), month)).toMatchObject({ value: 2700000 });
    const comparison = compareProject(p, [], item);
    expect(comparison.baseline.rows[3]!.expenses).toBe(10000);
    expect(comparison.scenario.rows[3]!.expenses).toBe(11000);
  });

  it('后续支出下降后，费用节省仍不能超过当月支出', () => {
    const p = plan({ currentExpenses: [stage(240000, 2), stage(120000, null)] });
    const item = project(flow({ kind: 'expense-saving', amount: 15000, frequency: 'monthly', startMonth: 1, endMonth: null, continuesAfterFreedom: true }));
    const context = createMetricContext(p, item);
    expect(context.projection.issue?.month).toBe(3);
    expect(evaluateMetric(context, expenses)).toMatchObject({ status: 'unavailable', code: 'invalid' });
    expect(evaluateMetric(context, { ...expenses, aggregation: 'annualized' }, 3)).toMatchObject({ status: 'unavailable', code: 'invalid' });
    expect(evaluateMetric(context, metricPreset('freedom-capital'), 3)).toMatchObject({ status: 'unavailable', code: 'invalid' });
  });

  it('缩短预测期不裁剪阶段，额外年度窗口仍跨段计算', () => {
    const p = plan({ horizonMonths: 1, currentExpenses: [stage(240000, 2), stage(120000, null)] });
    const context = createMetricContext(p);
    expect(context.projection.rows).toHaveLength(14);
    expect(evaluateMetric(context, expenses, 1)).toMatchObject({ value: -130000 });
    expect(p.currentExpenses).toHaveLength(2);
  });

  it('资金不足时停止，不能跨越到后续支出下降月份', () => {
    const p = plan({ initialAssets: 30000, investmentReturn: { annualRate: 0 }, activeIncome: [stage(0, null)],
      currentExpenses: [stage(240000, 2), stage(12000, null)] });
    const projection = simulatePlan(p);
    expect(projection.status).toBe('insolvent');
    expect(projection.issue?.month).toBe(2);
    expect(projection.rows.at(-1)?.month).toBe(2);
  });

  it('零金额与未知不同，零支出无需额外通胀假设', () => {
    const zero = plan({ inflationRate: null, currentExpenses: [{ amount: 0, growth: { kind: 'inflation' }, durationMonths: null }] });
    expect(expensesAnnualAt(zero, 120)).toBe(0);
    expect(evaluateMetric(createMetricContext(zero), metricPreset('freedom-capital'), 120)).toMatchObject({ value: 0 });
    expect(evaluateMetric(createMetricContext(plan({ currentExpenses: null })), expenses)).toMatchObject({ status: 'unavailable', missingField: 'currentExpenses' });
  });
});

describe('支出阶段结构与备份', () => {
  it.each([
    [], [stage(100, 12)], [stage(100, null), stage(200, null)],
    [stage(100, 0), stage(200, null)], [stage(100, 1.5), stage(200, null)],
    [stage(100, 1201), stage(200, null)], [stage(-1, null)],
  ].map((stages) => [stages]))('拒绝不完整或非法的支出阶段 %j', (stages) => {
    expect(planSchema.safeParse({ ...plan(), currentExpenses: stages }).success).toBe(false);
  });

  it('v4 往返保留两类阶段，旧版本和旧支出对象均拒绝', () => {
    const document = createDocument('2026-10');
    document.plan = plan({ currentExpenses: [stage(240000, 2), stage(120000, null)] });
    expect(importDocument(exportDocument(document))).toEqual(document);
    expect(() => importDocument(JSON.stringify({ ...document, schemaVersion: 3, modelVersion: '3.0.0' }))).toThrow();
    expect(() => importDocument(JSON.stringify({ ...document, plan: { ...document.plan, currentExpenses: { amount: 120000, growth: { kind: 'fixed' } } } }))).toThrow();
  });
});
