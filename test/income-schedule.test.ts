import { describe, expect, it } from 'vitest';
import {
  activeIncomeAnnualAt, calculateMilestones, compareProject, createDocument, createMetricContext, evaluateMetric,
  exportDocument, importDocument, metricPreset, planSchema, simulatePlan, type FlowStage, type Plan,
} from '../src/index.js';
import { flow, plan, project } from './fixtures.js';

/** 使用零收益和零支出隔离阶段工资的真实现金流，喵~ */
function scheduled(stages: FlowStage[] | null, overrides: Partial<Plan> = {}): Plan {
  return plan({ initialAssets: 100000, inflationRate: 0, investmentReturn: { annualRate: 0 },
    currentExpenses: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }], activeIncome: stages, ...overrides });
}

/** 创建固定金额阶段以表达合成收入场景，喵~ */
function stage(amount: number, durationMonths: number | null): FlowStage {
  return { amount, durationMonths, growth: { kind: 'fixed' } };
}

describe('主动收入阶段', () => {
  it('单段有限期只结算指定次数，基准月只展示年收入', () => {
    const p = scheduled([stage(240000, 2)]);
    const rows = simulatePlan(p).rows;
    expect(activeIncomeAnnualAt(p, 0)).toBe(240000);
    expect(rows.slice(0, 4).map((row) => row.activeIncome)).toEqual([0, 20000, 20000, 0]);
    expect(rows[3]!.assets).toBe(140000);
    expect(evaluateMetric(createMetricContext(p), { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['active-income'] }, 3)).toMatchObject({ value: 0 });
  });

  it('收入切换和失业空档连续衔接，未来一年逐月累计为十三万元', () => {
    const p = scheduled([stage(240000, 2), stage(0, 1), stage(120000, null)]);
    const rows = simulatePlan(p).rows;
    expect(rows.slice(1, 5).map((row) => row.activeIncome)).toEqual([20000, 20000, 0, 10000]);
    expect(evaluateMetric(createMetricContext(p), metricPreset('active-income'))).toMatchObject({ value: 130000 });
    expect(evaluateMetric(createMetricContext(p), { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['active-income'] }, 2)).toMatchObject({ value: 240000 });
    expect(evaluateMetric(createMetricContext(p), metricPreset('active-income'), 2)).toMatchObject({ value: 110000 });
  });

  it('段内增长使用各自起点，第一段保持基准月增长算法', () => {
    const p = scheduled([
      { ...stage(240000, 12), growth: { kind: 'custom', annualRate: 0.1 } },
      { ...stage(120000, null), growth: { kind: 'custom', annualRate: 0.2 } },
    ]);
    expect(activeIncomeAnnualAt(p, 1)).toBeCloseTo(240000 * 1.1 ** (1 / 12));
    expect(activeIncomeAnnualAt(p, 12)).toBeCloseTo(264000);
    expect(activeIncomeAnnualAt(p, 13)).toBeCloseTo(120000 * 1.2 ** (1 / 12));
    expect(activeIncomeAnnualAt(p, 24)).toBeCloseTo(144000);
  });

  it('各段通胀联动独立，零收入和已结束收入不要求通胀假设', () => {
    const p = scheduled([stage(240000, 12), { ...stage(120000, 12), growth: { kind: 'inflation' } }], { inflationRate: 0.03 });
    expect(activeIncomeAnnualAt(p, 24)).toBeCloseTo(123600);
    expect(activeIncomeAnnualAt({ ...p, inflationRate: null }, 25)).toBe(0);
    expect(() => activeIncomeAnnualAt({ ...p, inflationRate: null }, 13)).toThrow('inflationRate');
    expect(activeIncomeAnnualAt(scheduled([{ ...stage(0, null), growth: { kind: 'inflation' } }], { inflationRate: null }), 1)).toBe(0);
  });

  it('独立收入指标不依赖资产与收益，但未知工资不能当作零', () => {
    const p = scheduled([stage(120000, 6)], { initialAssets: null, investmentReturn: null });
    expect(evaluateMetric(createMetricContext(p), metricPreset('active-income'))).toMatchObject({ value: 60000 });
    expect(evaluateMetric(createMetricContext({ ...p, activeIncome: null }), metricPreset('active-income'))).toMatchObject({ status: 'unavailable', missingField: 'activeIncome' });
  });

  it('缩短预测期不裁剪阶段，不限期阶段覆盖额外十二个月', () => {
    const p = scheduled([stage(240000, 2), stage(120000, null)], { horizonMonths: 3 });
    const result = simulatePlan(p);
    expect(result.rows).toHaveLength(16);
    expect(result.rows[15]!.activeIncome).toBe(10000);
    expect(evaluateMetric(createMetricContext(p), metricPreset('active-income'), 3)).toMatchObject({ value: 120000 });
    expect(simulatePlan({ ...p, horizonMonths: 1 }).rows.slice(0, 13)).toEqual(result.rows.slice(0, 13));
    expect(p.activeIncome).toEqual([stage(240000, 2), stage(120000, null)]);
  });

  it('工资结束后其他收入与支出继续，项目增收只在项目路径叠加一次', () => {
    const p = scheduled([stage(240000, 1)], { externalIncome: { amount: 24000, growth: { kind: 'fixed' } }, currentExpenses: [{ amount: 12000, growth: { kind: 'fixed' }, durationMonths: null }] });
    const pr = project(flow({ kind: 'active-income', amount: 3000, frequency: 'monthly', startMonth: 1 }));
    const comparison = compareProject(p, createDocument('2026-10').goals, pr);
    expect(comparison.baseline.rows[2]).toMatchObject({ activeIncome: 0, externalIncome: 2000, expenses: 1000, netCashFlow: 1000 });
    expect(comparison.scenario.rows[2]).toMatchObject({ activeIncome: 3000, externalIncome: 2000, expenses: 1000, netCashFlow: 4000 });
    expect(comparison.scenario.rows[2]!.assets - comparison.baseline.rows[2]!.assets).toBe(6000);
  });

  it('停薪不降低支出覆盖门槛，也不会因收入门槛归零自动达成', () => {
    const p = scheduled([stage(120000, 1)], { currentExpenses: [{ amount: 12000, growth: { kind: 'fixed' }, durationMonths: null }] });
    const context = createMetricContext(p);
    expect(evaluateMetric(context, metricPreset('freedom-capital'), 0)).toMatchObject({ value: 300000 });
    expect(evaluateMetric(context, metricPreset('freedom-capital'), 2)).toMatchObject({ value: 300000 });
    const empty = scheduled([stage(0, null)]);
    expect(calculateMilestones(empty, [createDocument('2026-10').goals[1]!]).goals[0]!.status).toBe('not-applicable');
  });

  it('失业期间资金不足即停止，不用未来再就业收入隐式借款', () => {
    const result = simulatePlan(scheduled([stage(0, 2), stage(240000, null)], {
      initialAssets: 1000, currentExpenses: [{ amount: 12000, growth: { kind: 'fixed' }, durationMonths: null }],
    }));
    expect(result).toMatchObject({ status: 'insolvent', issue: { month: 2 } });
    expect(result.rows).toHaveLength(3);
  });

  it.each([[], [stage(1, 0)], [stage(1, -1)], [stage(1, 0.5)], [stage(1, 1201)], [stage(-1, 1)], [stage(1, null), stage(2, 1)]].map((stages) => ({ stages })))('拒绝无效阶段 $stages', ({ stages }) => {
    expect(() => planSchema.parse({ ...plan(), activeIncome: stages })).toThrow();
  });

  it('分段配置往返保留金额、增长、期限与基准月', () => {
    const document = createDocument('2026-10');
    document.plan = scheduled([stage(240000, 60), stage(0, 12), { ...stage(120000, null), growth: { kind: 'custom', annualRate: -0.02 } }]);
    expect(importDocument(exportDocument(document))).toEqual(document);
  });
});
