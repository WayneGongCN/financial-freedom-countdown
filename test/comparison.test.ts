import { describe, expect, it } from 'vitest';
import { compareProject, createDefaultGoals, type Goal } from '../src/index.js';
import { amountGoal, flow, freedomGoal, plan, project } from './fixtures.js';

describe('消费与增收的两条路径', () => {
  it.each([[0, 0, 117, 118], [0.03, 0, 185, 186], [0.03, 0.03, 145, 146]])('回归示例：通胀 %s、工资增长 %s', (inflation, growth, before, after) => {
    const p = plan({ inflationRate: inflation, activeIncome: [{ amount: 240000, growth: { kind: 'custom', annualRate: growth }, durationMonths: null }] });
    const result = compareProject(p, [freedomGoal()], project(flow()));
    expect(result.goals[0]).toMatchObject({ baseline: { firstMonth: before }, scenario: { firstMonth: after }, delayMonths: 1, targetChangeAtReference: 0 });
  });
  it('第 145 月本金、名义复利与购买力差额对账', () => {
    const p = plan({ inflationRate: 0.03, activeIncome: [{ amount: 240000, growth: { kind: 'inflation' }, durationMonths: null }] });
    const result = compareProject(p, [freedomGoal()], project(flow()));
    expect(result.impact.status).toBe('available');
    if (result.impact.status !== 'available') return;
    expect(result.impact.referenceMonth).toBe(145);
    expect(result.impact.immediateAssetReduction).toBe(10000);
    expect(result.impact.netPrincipalDifferenceNominal).toBe(10000);
    expect(result.impact.investmentReturnDifferenceNominal).toBeCloseTo(15343.720991727, 6);
    expect(result.impact.assetDifferenceNominal).toBeCloseTo(25343.720991727, 6);
    expect(result.impact.assetDifferenceReal).toBeCloseTo(17731.844480771, 6);
    expect(result.impact.netPrincipalDifferenceReal).toBe(10000);
    expect(result.impact.investmentReturnDifferenceReal).toBeCloseTo(7731.844480771, 6);
    expect(result.goals[0]!.gapChangeAtReference).toBeCloseTo(result.impact.assetDifferenceNominal, 7);
  });
  it('无项目变化时所有差额为零，默认参考主目标月份', () => {
    const result = compareProject(plan(), createDefaultGoals(), project());
    expect(result.impact).toMatchObject({ status: 'available', immediateAssetReduction: 0, assetDifferenceNominal: 0, referenceMonth: 117 });
    expect(result.goals.every((goal) => goal.delayMonths === 0)).toBe(true);
  });
  it('永久消费同时降低积累速度并提高资本目标', () => {
    const p = plan({ investmentReturn: { annualRate: 0 } });
    const result = compareProject(p, [freedomGoal()], project(flow({ amount: 1000, startMonth: 1, frequency: 'monthly' })));
    expect(result.goals[0]).toMatchObject({ baseline: { firstMonth: 240 }, scenario: { firstMonth: 300 }, delayMonths: 60, targetChangeAtReference: 300000 });
  });
  it('有限期消费提高准备金，不被永久乘以二十五', () => {
    const result = compareProject(plan(), [freedomGoal()], project(flow({ amount: 1000, startMonth: 1, endMonth: 24, frequency: 'monthly' })), { referenceMonth: 12 });
    expect(result.goals[0]!.targetChangeAtReference).toBe(12000);
    expect(result.impact).toMatchObject({ netPrincipalDifferenceNominal: 12000 });
  });
  it('固定基准门槛与动态门槛分别计算且原因可解释', () => {
    const p = plan();
    const original = createDefaultGoals()[0]!;
    const frozen: Goal = { ...original, id: 'frozen', comparison: 'baseline' };
    const dynamic: Goal = { ...original, id: 'dynamic', comparison: 'scenario' };
    const result = compareProject(p, [frozen, dynamic], project(flow({ startMonth: 1, frequency: 'monthly', amount: 1000 })), { referenceMonth: 12 });
    expect(result.goals[0]!.targetChangeAtReference).toBe(0);
    expect(result.goals[1]!.targetChangeAtReference).toBe(-12000);
  });
  it('延后增收实际开始才影响积累，主动收入不抵扣退休预算', () => {
    const result = compareProject(plan(), [freedomGoal()], project(
      flow(), flow({ id: 'work-income', kind: 'active-income', amount: 5000, startMonth: 12, endMonth: 36, frequency: 'monthly' }),
    ), { referenceMonth: 24 });
    expect(result.impact).toMatchObject({ status: 'available', netPrincipalDifferenceNominal: -55000 });
    expect(result.goals[0]!.targetChangeAtReference).toBe(0);
    expect(result.goals[0]!.delayMonths!).toBeLessThan(0);
  });
  it('每期现金流按发生月份计本金购买力并累积投资差额', () => {
    const p = plan({ inflationRate: 0.03 });
    const result = compareProject(p, [freedomGoal()], project(flow({ startMonth: 12, amount: 10000 })), { referenceMonth: 24 });
    expect(result.impact.status).toBe('available');
    if (result.impact.status !== 'available') return;
    expect(result.impact.immediateAssetReduction).toBe(0);
    expect(result.impact.assetDifferenceNominal).toBeCloseTo(10800, 6);
    expect(result.impact.netPrincipalDifferenceReal).toBeCloseTo(10000 / 1.03, 7);
    expect(result.impact.assetDifferenceReal).toBeCloseTo(10800 / 1.03 ** 2, 6);
    expect(result.impact.investmentReturnDifferenceReal! + result.impact.netPrincipalDifferenceReal!).toBeCloseTo(result.impact.assetDifferenceReal!, 8);
  });
  it('负收益对应少承担的投资亏损，投资差额允许为负', () => {
    const result = compareProject(plan({ investmentReturn: { annualRate: -0.1 } }), [amountGoal(1e9)], project(flow()), { referenceMonth: 12 });
    expect(result.impact.status).toBe('available');
    if (result.impact.status !== 'available') return;
    expect(result.impact.investmentReturnDifferenceNominal).toBeCloseTo(-1000, 6);
  });
  it('任一路径未达成或资金不足时不强算延迟月份', () => {
    const result = compareProject(plan({ horizonMonths: 12 }), [freedomGoal()], project(flow({ amount: 1e7 })));
    expect(result.goals[0]!.delayMonths).toBeNull();
    expect(result.impact.status).toBe('unavailable');
  });
  it('未达成时采用第十年或较短测算期限，支持指定主目标和参考月', () => {
    expect(compareProject(plan(), [amountGoal(1e50)], project()).impact.referenceMonth).toBe(120);
    expect(compareProject(plan({ horizonMonths: 12 }), [], project()).impact.referenceMonth).toBe(12);
    expect(compareProject(plan(), [amountGoal(600000)], project(), { primaryGoalId: 'amount' }).impact.referenceMonth).toBe(0);
    expect(compareProject(plan(), [freedomGoal()], project(), { referenceMonth: 24 }).impact.referenceMonth).toBe(24);
    expect(() => compareProject(plan(), [], project(), { primaryGoalId: 'unknown' })).toThrow('主目标');
    expect(() => compareProject(plan(), [], project(), { referenceMonth: -1 })).toThrow('月份');
    expect(() => compareProject(plan(), [], project(), { referenceMonth: 1201 })).toThrow('月份');
  });
  it('未知通胀只隐藏购买力分解，不阻止名义差额', () => {
    const result = compareProject(plan({ inflationRate: null, currentExpenses: [{ amount: 120000, growth: { kind: 'fixed' }, durationMonths: null }] }), [amountGoal(3000000)], project(flow()));
    expect(result.impact).toMatchObject({ status: 'available', netPrincipalDifferenceReal: null, investmentReturnDifferenceReal: null, assetDifferenceReal: null });
  });
  it('比较不能修改宏观计划、目标、项目或共享预设', () => {
    const p = plan();
    const goals = createDefaultGoals();
    const pr = project(flow());
    const original = structuredClone({ p, goals, pr });
    compareProject(p, goals, pr);
    expect({ p, goals, pr }).toEqual(original);
  });
});
