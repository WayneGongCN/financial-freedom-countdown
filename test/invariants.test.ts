import { describe, expect, it } from 'vitest';
import {
  annualToMonthly, compareProject, createMetricContext, evaluateMetric,
  forecastGoal, nominalReturn, priceIndex, simulatePlan, type MetricSpec,
} from '../src/index.js';
import { amountGoal, flow, freedomGoal, plan, project } from './fixtures.js';

describe('跨模型不变量', () => {
  it('多组收益、通胀及增长假设下，独立实际金额递推与名义递推等价', () => {
    for (const inflation of [-0.01, 0, 0.03, 0.08]) {
      for (const investmentReturn of [-0.05, 0, 0.03, 0.12]) {
        const p = plan({ inflationRate: inflation, investmentReturn: { kind: 'nominal', annualRate: investmentReturn }, horizonMonths: 240,
          activeIncome: { amount: 240000, growth: { kind: 'custom', annualRate: 0.01 } },
          currentExpenses: { amount: 60000, growth: { kind: 'inflation' } } });
        const pr = project(flow({ startMonth: 13, amount: 1000, endMonth: 36, frequency: 'monthly', growth: { kind: 'custom', annualRate: 0.02 } }));
        const nominal = simulatePlan(p, pr);
        expect(nominal.status).toBe('complete');
        let actual = p.initialAssets!;
        const factor = ((1 + nominalReturn(p)) / (1 + inflation)) ** (1 / 12);
        for (let m = 1; m <= p.horizonMonths; m++) {
          const row = nominal.rows[m]!;
          actual = actual * factor + row.netCashFlow / priceIndex(p, m);
          expect(Math.abs(actual - row.assets / priceIndex(p, m)) / Math.max(1, Math.abs(actual))).toBeLessThan(1e-10);
        }
      }
    }
  });
  it('名义收益与等价实际收益输入不改变任何一月的资产', () => {
    const nominalPlan = plan({ inflationRate: 0.03 });
    const actualPlan = plan({ inflationRate: 0.03, investmentReturn: { kind: 'real', annualRate: 1.08 / 1.03 - 1 } });
    const a = simulatePlan(nominalPlan);
    const b = simulatePlan(actualPlan);
    for (let m = 0; m <= 1200; m++) expect(Math.abs(a.rows[m]!.assets - b.rows[m]!.assets) / a.rows[m]!.assets).toBeLessThan(1e-10);
    expect(forecastGoal(createMetricContext(nominalPlan), freedomGoal()).firstMonth).toBe(forecastGoal(createMetricContext(actualPlan), freedomGoal()).firstMonth);
  });
  it('现金流守恒与实际资产增长守恒在有项目时同时成立', () => {
    const p = plan({ inflationRate: 0.03 });
    const pr = project(flow({ startMonth: 1, endMonth: 24, frequency: 'monthly', amount: 1000 }),
      flow({ id: 'income', kind: 'passive-income', startMonth: 3, endMonth: 27, frequency: 'yearly', amount: 100 }));
    const context = createMetricContext(p, pr);
    const all: MetricSpec = { kind: 'flow', basis: 'real', aggregation: 'next-12-months',
      components: ['active-income', 'external-income', 'investment-cash', 'investment-price-change', 'expenses', 'inflation-adjustment'] };
    for (const month of [0, 1, 12, 24, 120]) {
      const flowValue = evaluateMetric(context, all, month);
      const growth = evaluateMetric(context, { kind: 'asset-growth', basis: 'real' }, month);
      expect(flowValue.status).toBe('available');
      expect(growth.status).toBe('available');
      if (flowValue.status === 'available' && growth.status === 'available') expect(flowValue.value).toBeCloseTo(growth.value, 6);
    }
  });
  it('净现金流差按真实月份复利后等于最终资产差', () => {
    const p = plan({ inflationRate: 0.03 });
    const pr = project(flow(), flow({ id: 'future', startMonth: 12, amount: 1200, frequency: 'monthly', endMonth: 24 }),
      flow({ id: 'benefit', kind: 'active-income', startMonth: 24, amount: 6000 }));
    const h = 120;
    const result = compareProject(p, [freedomGoal()], pr, { referenceMonth: h });
    const monthly = annualToMonthly(0.08);
    let expected = 0;
    for (let m = 0; m <= h; m++) expected += (result.baseline.rows[m]!.netCashFlow - result.scenario.rows[m]!.netCashFlow) * (1 + monthly) ** (h - m);
    expect(result.impact.status).toBe('available');
    if (result.impact.status === 'available') expect(result.impact.assetDifferenceNominal).toBeCloseTo(expected, 6);
  });
  it('未变更预算的一次性支出不改变同月门槛，且不会增加资产', () => {
    for (const inflation of [0, 0.03]) {
      const p = plan({ inflationRate: inflation });
      for (const amount of [0, 1, 10000, 50000]) {
        const result = compareProject(p, [freedomGoal()], project(flow({ amount })), { referenceMonth: 120 });
        expect(result.goals[0]!.targetChangeAtReference).toBe(0);
        expect(result.goals[0]!.delayMonths!).toBeGreaterThanOrEqual(0);
        if (result.impact.status === 'available') expect(result.impact.assetDifferenceNominal).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('参照基准同月时不会把左右两条不同路径错误约消', () => {
    const p = plan();
    const goal = amountGoal(1);
    goal.comparison = 'baseline';
    goal.right = { kind: 'metric', metric: { kind: 'assets', basis: 'nominal' } };
    const base = createMetricContext(p);
    const changed = createMetricContext(p, project(flow()));
    expect(forecastGoal(base, goal).status).toBe('condition-only');
    expect(forecastGoal(changed, goal, base).status).toBe('not-reached');
  });
});
