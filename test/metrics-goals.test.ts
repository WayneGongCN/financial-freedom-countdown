import { describe, expect, it } from 'vitest';
import {
  availableValue, calculateMilestones, createDefaultGoals, createMetricContext, describeMetric, displayMetric,
  evaluateGoal, evaluateMetric, forecastGoal, metricPreset, type Goal, type MetricSpec,
} from '../src/index.js';
import { amountGoal, flow, freedomGoal, plan, project } from './fixtures.js';

describe('指标按依赖渐进计算', () => {
  it('收益缺失时仍显示资本目标、当前资产和进度', () => {
    const context = createMetricContext(plan({ investmentReturn: null }));
    const current = evaluateGoal(context, freedomGoal());
    expect(current.status).toBe('not-met');
    expect(current.coverage).toBe(0.2);
    expect(current.right).toMatchObject({ status: 'available', value: 3000000 });
    expect(forecastGoal(context, freedomGoal()).status).toBe('incomplete');
  });
  it('缺少资产只影响相关指标，不阻止目标金额计算', () => {
    const context = createMetricContext(plan({ initialAssets: null }));
    expect(evaluateMetric(context, metricPreset('assets'))).toMatchObject({ code: 'missing-input', missingField: 'initialAssets' });
    expect(evaluateMetric(context, metricPreset('freedom-capital'))).toMatchObject({ value: 3000000 });
    expect(evaluateMetric(context, metricPreset('active-income'))).toMatchObject({ value: 240000 });
    expect(evaluateMetric(context, metricPreset('active-surplus'))).toMatchObject({ value: 120000 });
    expect(evaluateMetric(context, metricPreset('external-contribution'))).toMatchObject({ value: 120000 });
  });
  it('年化投资总收益使用资产和总回报；零资产不要求额外收益输入', () => {
    const metric: MetricSpec = { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['investment-total'] };
    expect(evaluateMetric(createMetricContext(plan()), metric)).toMatchObject({ value: 48000 });
    expect(evaluateMetric(createMetricContext(plan({ investmentReturn: null })), metric)).toMatchObject({ missingField: 'investmentReturn' });
    expect(evaluateMetric(createMetricContext(plan({ initialAssets: 0, investmentReturn: null })), metric)).toMatchObject({ value: 0 });
  });
  it('两项默认被动收入目标仅凭总收益即可预测', () => {
    const result = calculateMilestones(plan(), createDefaultGoals());
    expect(result.projection.status).toBe('complete');
    for (const forecast of result.goals.slice(0, 2)) {
      expect(forecast.status).toBe('reached');
      expect(forecast.current.left.status).toBe('available');
      expect(forecast.firstMonth).toBeGreaterThan(0);
    }
  });
  it('未填写通胀不能冒充实际统计结果', () => {
    const context = createMetricContext(plan({ inflationRate: null, currentExpenses: [{ amount: 120000, growth: { kind: 'fixed' }, durationMonths: null }] }));
    expect(evaluateMetric(context, metricPreset('assets', 'real'), 12)).toMatchObject({ missingField: 'inflationRate' });
    expect(evaluateMetric(context, { kind: 'flow', basis: 'real', aggregation: 'next-12-months', components: ['inflation-adjustment'] })).toMatchObject({ missingField: 'inflationRate' });
  });
});

describe('指标组成与统计币值', () => {
  it('年化组成项按明确的正负方向求和', () => {
    const context = createMetricContext(plan());
    const metric: MetricSpec = { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['active-income', 'external-income', 'investment-total', 'expenses'] };
    expect(evaluateMetric(context, metric)).toMatchObject({ value: 168000 });
    expect(evaluateMetric(context, { ...metric, components: ['investment-total'] })).toMatchObject({ value: 48000 });
    expect(describeMetric(metric)).toContain('−支出');
    expect(describeMetric(metricPreset('freedom-capital'))).toContain('准备金');
  });
  it('名义资产增量等于现金流与投资总回报之和', () => {
    const context = createMetricContext(plan(), project(flow({ startMonth: 6 })));
    const summed = evaluateMetric(context, { kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['active-income', 'external-income', 'investment-total', 'expenses'] });
    const change = evaluateMetric(context, metricPreset('asset-growth'));
    expect(availableValue(summed)!.value).toBeCloseTo(availableValue(change)!.value, 7);
  });
  it('实际资产增量包含持有本金购买力变化，不能仅折算名义增量', () => {
    const context = createMetricContext(plan({ inflationRate: 0.03 }));
    const summed = evaluateMetric(context, { kind: 'flow', basis: 'real', aggregation: 'next-12-months', components: ['active-income', 'external-income', 'investment-total', 'expenses', 'inflation-adjustment'] });
    const actual = evaluateMetric(context, metricPreset('asset-growth', 'real'));
    const nominal = evaluateMetric(context, metricPreset('asset-growth'));
    expect(availableValue(summed)!.value).toBeCloseTo(availableValue(actual)!.value, 7);
    expect(availableValue(actual)!.value).not.toBeCloseTo(availableValue(nominal)!.value / 1.03, 3);
  });
  it('总被动收入等于投资总收益加其他被动收入，年化与未来一年保持各自口径', () => {
    const context = createMetricContext(plan({ externalIncome: { amount: 24000, growth: { kind: 'fixed' } } }));
    const total = availableValue(evaluateMetric(context, metricPreset('investment-total')))!;
    const passive = availableValue(evaluateMetric(context, metricPreset('passive-total')))!;
    const monthlyReturn = 1.08 ** (1 / 12) - 1;
    const expectedInvestment = 600000 * 0.08 + 12000 * (0.08 / monthlyReturn - 12);
    expect(total.value).toBeCloseTo(expectedInvestment, 6);
    expect(passive.value).toBeCloseTo(expectedInvestment + 24000, 6);
    expect(evaluateMetric(context, { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['investment-total', 'external-income'] })).toMatchObject({ value: 72000 });
    expect(passive.value).toBeGreaterThan(72000);
  });
  it('投资亏损可以使总被动收入为负，不把亏损截成零', () => {
    const context = createMetricContext(plan({ investmentReturn: { annualRate: -0.1 },
      activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }], currentExpenses: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }] }));
    expect(availableValue(evaluateMetric(context, metricPreset('passive-total')))!.value).toBeCloseTo(-60000, 6);
    expect(evaluateMetric(context, { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['investment-total', 'external-income'] })).toMatchObject({ value: -60000 });
  });
  it('显示切换不修改指标结果和达成时间', () => {
    const p = plan({ inflationRate: 0.03 });
    const context = createMetricContext(p);
    const result = availableValue(evaluateMetric(context, metricPreset('active-income'), 12))!;
    const original = structuredClone(result);
    const forecast = forecastGoal(context, freedomGoal());
    const displayed = displayMetric(result, p, 'real');
    expect(displayed.value).toBeCloseTo(result.value / 1.03, 7);
    expect(displayed.label).toContain('不更改逐期统计方式');
    expect(displayMetric(result, p, 'nominal').value).toBe(result.value);
    expect(result).toEqual(original);
    expect(forecastGoal(context, freedomGoal())).toEqual(forecast);
    const stock = availableValue(evaluateMetric(context, metricPreset('assets', 'real'), 12))!;
    expect(displayMetric(stock, p, 'nominal').value).toBeCloseTo(context.projection.rows[12]!.assets, 7);
  });
  it('年化实际金额是时点预算折算，不改变统计窗口', () => {
    const p = plan({ inflationRate: 0.03 });
    const context = createMetricContext(p);
    expect(evaluateMetric(context, { kind: 'flow', basis: 'real', aggregation: 'annualized', components: ['active-income'] }, 12)).toMatchObject({ frame: 'annualized' });
    expect(availableValue(evaluateMetric(context, { kind: 'flow', basis: 'real', aggregation: 'annualized', components: ['active-income'] }, 12))!.value).toBeCloseTo(240000 / 1.03, 7);
  });
  it('无效月份和数值溢出不返回虚构数字', () => {
    const context = createMetricContext(plan());
    expect(() => evaluateMetric(context, metricPreset('assets'), -1)).toThrow();
    expect(() => evaluateMetric(context, metricPreset('assets'), 1201)).toThrow();
    expect(evaluateMetric(createMetricContext(plan({ currentExpenses: [{ amount: 1e308, growth: { kind: 'fixed' }, durationMonths: null }] })), metricPreset('freedom-capital'))).toMatchObject({ status: 'unavailable', code: 'invalid' });
  });
  it('预算和年化节省不能超出真实支出', () => {
    const context = createMetricContext(plan(), project(flow({ kind: 'expense-saving', amount: 1000000, frequency: 'monthly' })));
    expect(evaluateMetric(context, metricPreset('freedom-capital'))).toMatchObject({ code: 'invalid' });
    expect(evaluateMetric(context, { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['expenses'] })).toMatchObject({ code: 'invalid' });
  });
  it('资金不足时不可展示后续资产，失效值可安全提取为空', () => {
    const context = createMetricContext(plan({ initialAssets: 1 }), project(flow()));
    const result = evaluateMetric(context, metricPreset('assets'));
    expect(result).toMatchObject({ code: 'unavailable-projection' });
    expect(availableValue(result)).toBeNull();
  });
});

describe('资本目标与里程碑', () => {
  it.each([[0, 0, 117], [0.03, 0, 185], [0.03, 0.03, 145]])('通胀 %s、工资增长 %s 在第 %s 月达成', (inflation, incomeGrowth, expected) => {
    const p = plan({ inflationRate: inflation, activeIncome: [{ amount: 240000, growth: { kind: 'custom', annualRate: incomeGrowth }, durationMonths: null }] });
    const result = calculateMilestones(p, [freedomGoal()]);
    expect(result.goals[0]!.firstMonth).toBe(expected);
  });
  it('固定名义目标与固定购买力目标是不同定义', () => {
    const context = createMetricContext(plan({ inflationRate: 0.03 }));
    const nominal = forecastGoal(context, amountGoal(3000000));
    const real = forecastGoal(context, amountGoal(3000000, 'real'));
    expect(real.firstMonth!).toBeGreaterThan(nominal.firstMonth!);
    expect(evaluateGoal(context, amountGoal(3000000, 'real'), 120).right).toMatchObject({ value: 3000000 * 1.03 ** 10 });
  });
  it('固定购买力目标需要通胀才能换算未来门槛', () => {
    const context = createMetricContext(plan({ inflationRate: null, currentExpenses: [{ amount: 120000, growth: { kind: 'fixed' }, durationMonths: null }] }));
    expect(evaluateGoal(context, amountGoal(3000000, 'real'), 1).status).toBe('unavailable');
  });
  it('同比通胀支出目标的实际金额稳定，显示不会双扣通胀', () => {
    const p = plan({ inflationRate: 0.03 });
    const context = createMetricContext(p);
    expect(availableValue(evaluateMetric(context, metricPreset('freedom-capital', 'real'), 120))!.value).toBeCloseTo(3000000, 7);
    expect(availableValue(evaluateMetric(context, metricPreset('freedom-capital'), 120))!.value).toBeCloseTo(3000000 * 1.03 ** 10, 7);
    const goal = freedomGoal();
    goal.left.basis = 'real';
    if (goal.right.kind === 'metric') goal.right.metric.basis = 'real';
    expect(forecastGoal(context, goal).firstMonth).toBe(forecastGoal(context, freedomGoal()).firstMonth);
  });
  it('退休预算只抵扣资产池外持续收入，不重复扣除投资总收益', () => {
    const context = createMetricContext(plan({ externalIncome: { amount: 24000, growth: { kind: 'fixed' } }, investmentReturn: { annualRate: 0.5 } }));
    const metric: MetricSpec = { kind: 'required-capital', basis: 'nominal', withdrawalRate: 0.04, deductExternalIncome: true, includeReserve: true };
    expect(evaluateMetric(context, metric)).toMatchObject({ value: 2400000 });
    expect(evaluateMetric(context, { ...metric, deductExternalIncome: false, includeReserve: false })).toMatchObject({ value: 3000000 });
  });
  it('跨越自由时点的有限付款计入准备金，已付款不再计入', () => {
    const p = plan({ investmentReturn: { annualRate: 0 } });
    const context = createMetricContext(p, project(flow({ startMonth: 12 })));
    expect(evaluateMetric(context, metricPreset('freedom-capital'), 0)).toMatchObject({ value: 3010000 });
    expect(evaluateMetric(context, metricPreset('freedom-capital'), 12)).toMatchObject({ value: 3000000 });
  });
  it('已达成和零资本需求不产生除零进度', () => {
    expect(forecastGoal(createMetricContext(plan()), amountGoal(100)).firstMonth).toBe(0);
    const context = createMetricContext(plan({ currentExpenses: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }] }));
    expect(evaluateGoal(context, freedomGoal())).toMatchObject({ status: 'met', coverage: null });
  });
  it('资本单位、年额窗口和统计币值必须兼容', () => {
    const context = createMetricContext(plan());
    const goal = amountGoal(100);
    goal.right = { kind: 'amount', amount: 100, unit: 'annual-flow', basis: 'nominal' };
    expect(forecastGoal(context, goal).status).toBe('invalid');
    goal.right = { kind: 'metric', metric: metricPreset('assets', 'real') };
    expect(evaluateGoal(context, goal).status).toBe('invalid');
    goal.left = metricPreset('active-income');
    goal.right = { kind: 'metric', metric: { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['active-income'] } };
    expect(evaluateGoal(context, goal).status).toBe('invalid');
  });
  it('门槛随同比例调整；溢出门槛被拒绝', () => {
    const context = createMetricContext(plan());
    const goal = amountGoal(1200000);
    goal.ratio = 0.5;
    expect(evaluateGoal(context, goal).status).toBe('met');
    goal.ratio = 1e308;
    expect(evaluateGoal(context, goal).status).toBe('invalid');
  });
  it('非正主动储蓄不是自动达成', () => {
    const context = createMetricContext(plan({ activeIncome: [{ amount: 120000, growth: { kind: 'fixed' }, durationMonths: null }], investmentReturn: { annualRate: 0 } }));
    expect(evaluateGoal(context, createDefaultGoals()[0]!).status).toBe('not-applicable');
    expect(forecastGoal(context, createDefaultGoals()[0]!).status).toBe('not-applicable');
  });
  it('相同指标或纯投资收益比例不伪造资本倒计时', () => {
    const context = createMetricContext(plan());
    const same: Goal = { ...amountGoal(1), right: { kind: 'metric', metric: metricPreset('assets') } };
    expect(forecastGoal(context, same).status).toBe('condition-only');
    const rate: Goal = { ...same, ratio: 0.5, left: metricPreset('investment-total'), right: { kind: 'metric', metric: metricPreset('investment-total') } };
    expect(forecastGoal(context, rate)).toMatchObject({ status: 'condition-only', firstMonth: null });
  });
  it('窗口不足、资金不足和测算期未达标分别返回', () => {
    const short = createMetricContext(plan({ horizonMonths: 12 }));
    expect(forecastGoal(short, amountGoal(1e9)).status).toBe('not-reached');
    const insolvent = createMetricContext(plan({ initialAssets: 1 }), project(flow()));
    expect(forecastGoal(insolvent, freedomGoal()).status).toBe('blocked');
    const missing = createMetricContext(plan({ activeIncome: null }));
    expect(forecastGoal(missing, createDefaultGoals()[1]!).status).toBe('incomplete');
    const growth = evaluateMetric(insolvent, metricPreset('asset-growth'));
    expect(growth.status).toBe('unavailable');
  });
  it('预算数据缺失与未来预算错误只影响相关目标', () => {
    const context = createMetricContext(plan({ initialAssets: 1, retirementBudget: { kind: 'custom', flow: { amount: 1, growth: { kind: 'fixed' } } } }),
      project(flow({ kind: 'expense-saving', startMonth: 1, frequency: 'monthly', amount: 2 })));
    expect(forecastGoal(context, freedomGoal()).status).toBe('invalid');
    expect(forecastGoal(context, amountGoal(1)).status).toBe('reached');
  });

  it('纯收入目标不依赖资产和总收益参数，但不能越过已知资金缺口', () => {
    const goal: Goal = { ...amountGoal(100), left: metricPreset('active-income'), right: { kind: 'amount', amount: 240000, unit: 'annual-flow', basis: 'nominal' } };
    expect(forecastGoal(createMetricContext(plan({ initialAssets: null, investmentReturn: null })), goal).firstMonth).toBe(0);
    expect(forecastGoal(createMetricContext(plan({ initialAssets: 1 }), project(flow())), goal).status).toBe('blocked');
  });

  it('一项项目的未知成本增长不阻止无关收入指标独立展示', () => {
    const context = createMetricContext(plan({ inflationRate: null }), project(flow({ startMonth: 6, growth: { kind: 'inflation' } })));
    expect(evaluateMetric(context, metricPreset('active-income'))).toMatchObject({ value: 240000 });
  });

  it('年化指标只读取所选现金流，资本目标忽略未选择的收入', () => {
    const p = plan({ inflationRate: null, currentExpenses: [{ amount: 120000, growth: { kind: 'fixed' }, durationMonths: null }] });
    const expenseContext = createMetricContext(p, project(flow({ startMonth: 0, frequency: 'monthly', growth: { kind: 'inflation' } })));
    expect(evaluateMetric(expenseContext, { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['active-income'] }, 1)).toMatchObject({ value: 240000 });
    const incomeContext = createMetricContext(p, project(flow({ kind: 'passive-income', frequency: 'monthly', growth: { kind: 'inflation' } })));
    expect(evaluateMetric(incomeContext, metricPreset('freedom-capital'), 1)).toMatchObject({ value: 3000000 });
  });
});
