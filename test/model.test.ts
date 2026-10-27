import { describe, expect, it } from 'vitest';
import {
  annualToMonthly, annualValue, cashAmount, convertBasis, growAmount, growthRate,
  isDue, nominalReturn, priceIndex, projectAnnualAt, projectCashAt, realReturn,
  reserveSchedule, retirementAnnualAt, simulatePlan,
} from '../src/index.js';
import { flow, plan, project } from './fixtures.js';

describe('收益与增长', () => {
  it.each([0, 0.08, -0.2, 1.5])('复合年率 %s 可从月率还原', (rate) => {
    expect((1 + annualToMonthly(rate)) ** 12 - 1).toBeCloseTo(rate, 12);
  });
  it.each([-1, -2, Infinity, NaN])('拒绝无效年率 %s', (rate) => {
    expect(() => annualToMonthly(rate)).toThrow(RangeError);
  });
  it('总收益输入不受通胀影响，购买力收益仅由 Fisher 公式派生', () => {
    const p = plan({ inflationRate: 0.03 });
    expect(realReturn(p)).toBeCloseTo(0.04854368932038833, 12);
    expect(nominalReturn(p)).toBe(0.08);
    const unknownInflation = plan({ inflationRate: null });
    expect(nominalReturn(unknownInflation)).toBe(0.08);
    expect(() => realReturn(unknownInflation)).toThrow('inflationRate');
    expect(nominalReturn(plan({ inflationRate: 0.1 }))).toBe(0.08);
    expect(realReturn(plan({ inflationRate: 0.1 }))).toBeCloseTo(1.08 / 1.1 - 1, 12);
  });
  it('增长规则独立，未知通胀不阻止零金额和当前值', () => {
    const p = plan({ inflationRate: null });
    expect(growAmount(0, { kind: 'inflation' }, p, 12)).toBe(0);
    expect(growAmount(100, { kind: 'inflation' }, p, 0)).toBe(100);
    expect(growthRate({ kind: 'fixed' }, p)).toBe(0);
    expect(growthRate({ kind: 'custom', annualRate: 0.05 }, p)).toBe(0.05);
    expect(() => growthRate({ kind: 'inflation' }, p)).toThrow('inflationRate');
    expect(() => annualValue(null, p, 0, 'income')).toThrow('income');
    expect(priceIndex(p, 0)).toBe(1);
  });
  it('币值显示双向转换，价格基准不会移动', () => {
    const p = plan({ inflationRate: 0.03 });
    expect(convertBasis(10000, 'real', 'nominal', p, 24)).toBeCloseTo(10609, 8);
    expect(convertBasis(10609, 'nominal', 'real', p, 24)).toBeCloseTo(10000, 8);
    expect(convertBasis(10000, 'nominal', 'nominal', p, 24)).toBe(10000);
    expect(p.baseMonth).toBe('2026-10');
  });
});

describe('现金流价格与付款时间', () => {
  it('未来固定合同保持金额，通胀和自定义涨价只应用一次', () => {
    const p = plan({ inflationRate: 0.03 });
    expect(cashAmount(flow({ startMonth: 24 }), p, 24)).toBe(10000);
    expect(cashAmount(flow({ startMonth: 24, growth: { kind: 'inflation' } }), p, 24)).toBeCloseTo(10609, 8);
    expect(cashAmount(flow({ startMonth: 24, growth: { kind: 'custom', annualRate: 0.05 } }), p, 24)).toBeCloseTo(11025, 8);
    expect(cashAmount(flow({ startMonth: 24, priceAnchorMonth: 24, growth: { kind: 'inflation' } }), p, 24)).toBe(10000);
  });
  it('年度付款只在指定月份发生，期限包含结束月份', () => {
    const payment = flow({ startMonth: 2, endMonth: 26, frequency: 'yearly' });
    expect([1, 2, 3, 14, 26, 38].map((m) => isDue(payment, m))).toEqual([false, true, false, true, true, false]);
    expect(isDue(flow({ startMonth: 2 }), 3)).toBe(false);
    expect(isDue(flow({ startMonth: 2, frequency: 'monthly' }), 3)).toBe(true);
  });
  it('项目成本、主动收入、被动收入与节省费用分类明确', () => {
    const p = plan();
    const pr = project(flow({ amount: 100 }), flow({ id: 'active', kind: 'active-income', amount: 50 }),
      flow({ id: 'passive', kind: 'passive-income', amount: 30 }), flow({ id: 'save', kind: 'expense-saving', amount: 20 }));
    expect(projectCashAt(p, pr, 0)).toEqual({ expenses: 100, activeIncome: 50, passiveIncome: 30, savings: 20, net: 0 });
    expect(projectCashAt(p, null, 0).net).toBe(0);
  });
  it('年化只包含正在生效的周期项目，不包含一次性收益', () => {
    const p = plan();
    const pr = project(
      flow({ id: 'active', kind: 'active-income', frequency: 'monthly', amount: 100, startMonth: 1, endMonth: 2 }),
      flow({ id: 'passive', kind: 'passive-income', frequency: 'yearly', amount: 1200, startMonth: 1 }),
      flow({ id: 'expense', frequency: 'monthly', amount: 50, startMonth: 1 }),
      flow({ id: 'saving', kind: 'expense-saving', frequency: 'monthly', amount: 10, startMonth: 1 }),
      flow({ id: 'one-time', kind: 'passive-income', amount: 999999 }),
    );
    expect(projectAnnualAt(p, pr, 0).net).toBe(0);
    expect(projectAnnualAt(p, pr, 1)).toEqual({ activeIncome: 1200, passiveIncome: 1200, expenses: 600, savings: 120, net: 1920 });
    expect(projectAnnualAt(p, pr, 3).activeIncome).toBe(0);
  });
});

describe('准备金与自由后预算', () => {
  it('准备金按候选月份换算，而非按各付款月份折算', () => {
    const p = plan({ inflationRate: 0.03 });
    const reserves = reserveSchedule(p, project(flow({ startMonth: 24, growth: { kind: 'inflation' } })));
    expect(reserves[12]).toBeCloseTo(10609, 8);
    expect(reserves[12]! / priceIndex(p, 12)).toBeCloseTo(10300, 8);
    expect(reserves[24]).toBe(0);
  });
  it('按年有限义务与当月支付去重，长期费用不进入准备金', () => {
    const reserves = reserveSchedule(plan(), project(
      flow({ id: 'finite', startMonth: 1, endMonth: 25, frequency: 'yearly', amount: 100 }),
      flow({ id: 'permanent', frequency: 'monthly', amount: 50 }),
      flow({ id: 'cancel', startMonth: 3, continuesAfterFreedom: false }),
      flow({ id: 'income', startMonth: 3, kind: 'passive-income' }),
    ));
    expect(reserves[0]).toBe(300);
    expect(reserves[1]).toBe(200);
    expect(reserves[25]).toBe(0);
  });
  it('长期承诺费用纳入预算，未开始收入或节省不提前抵扣', () => {
    const p = plan();
    const pr = project(
      flow({ id: 'expense', startMonth: 24, frequency: 'monthly', amount: 100 }),
      flow({ id: 'passive', kind: 'passive-income', startMonth: 24, frequency: 'yearly', amount: 1000 }),
      flow({ id: 'saving', kind: 'expense-saving', startMonth: 24, frequency: 'monthly', amount: 10 }),
      flow({ id: 'work', kind: 'active-income', frequency: 'monthly', amount: 999999 }),
      flow({ id: 'finite', startMonth: 1, endMonth: 12, frequency: 'monthly', amount: 100 }),
    );
    expect(retirementAnnualAt(p, pr, 0, true)).toEqual({ expenses: 121200, externalIncome: 0 });
    expect(retirementAnnualAt(p, pr, 24, true)).toEqual({ expenses: 121080, externalIncome: 1000 });
    expect(retirementAnnualAt(p, pr, 24, false).externalIncome).toBe(0);
  });
  it('独立自由后预算不被当前预算覆盖，超额节省需要纠正', () => {
    const p = plan({ retirementBudget: { kind: 'custom', flow: { amount: 100, growth: { kind: 'fixed' } } } });
    expect(retirementAnnualAt(p, null, 0, false).expenses).toBe(100);
    expect(() => retirementAnnualAt(p, project(flow({ kind: 'expense-saving', frequency: 'monthly', amount: 100 })), 0, false)).toThrow('预算');
  });
});

describe('月度资产推演', () => {
  it('期初投资、月末收支，总收益只计入资产一次', () => {
    const p = plan({ initialAssets: 1000000, activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }],
      currentExpenses: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }] });
    const result = simulatePlan(p);
    expect(result.rows[12]!.assets).toBeCloseTo(1080000, 6);
    expect(result.rows[1]!.investmentTotal).toBeCloseTo(1000000 * (1.08 ** (1 / 12) - 1), 8);
    expect(result.rows.slice(1, 13).reduce((sum, row) => sum + row.investmentTotal, 0)).toBeCloseTo(80000, 6);
    expect(result.rows[1]!.netCashFlow).toBe(0);
  });
  it('总投资净损益允许为负，亏损按月减少资产', () => {
    const result = simulatePlan(plan({ initialAssets: 1000000, investmentReturn: { annualRate: -0.1 },
      activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }], currentExpenses: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }] }));
    expect(result.status).toBe('complete');
    expect(result.rows[1]!.investmentTotal).toBeLessThan(0);
    expect(result.rows[12]!.assets).toBeCloseTo(900000, 6);
    expect(result.rows.slice(1, 13).reduce((sum, row) => sum + row.investmentTotal, 0)).toBeCloseTo(-100000, 6);
  });
  it('工资不增长与跟随通胀必须产生不同结余', () => {
    const flat = simulatePlan(plan({ inflationRate: 0.03 }));
    const linked = simulatePlan(plan({ inflationRate: 0.03, activeIncome: [{ amount: 240000, growth: { kind: 'inflation' }, durationMonths: null }] }));
    expect(flat.rows[120]!.activeIncome).toBe(20000);
    expect(linked.rows[120]!.activeIncome).toBeCloseTo(20000 * 1.03 ** 10, 6);
    expect(flat.rows[120]!.netCashFlow).toBeLessThan(linked.rows[120]!.netCashFlow);
  });
  it('收益等于通胀时无投入资产的购买力保持不变', () => {
    const p = plan({ inflationRate: 0.03, investmentReturn: { annualRate: 0.03 },
      activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }], currentExpenses: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }] });
    const result = simulatePlan(p);
    expect(result.rows[120]!.assets / result.rows[120]!.priceIndex!).toBeCloseTo(600000, 6);
  });
  it('收益低于通胀时名义资产上涨但实际资产下降', () => {
    const result = simulatePlan(plan({ inflationRate: 0.03, investmentReturn: { annualRate: 0.02 },
      activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }], currentExpenses: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }] }));
    expect(result.rows[120]!.assets).toBeGreaterThan(600000);
    expect(result.rows[120]!.assets / result.rows[120]!.priceIndex!).toBeLessThan(600000);
  });
  it('未来事件发生前不扣资产，发生后才计入', () => {
    const p = plan({ investmentReturn: { annualRate: 0 } });
    const before = simulatePlan(p);
    const after = simulatePlan(p, project(flow({ startMonth: 12 })));
    expect(before.rows[11]!.assets).toBe(after.rows[11]!.assets);
    expect(before.rows[12]!.assets - after.rows[12]!.assets).toBe(10000);
  });
  it('缺少资产或收益时返回明确状态，并保留可用的当前资产', () => {
    expect(simulatePlan(plan({ initialAssets: null })).issue?.missingField).toBe('initialAssets');
    const result = simulatePlan(plan({ investmentReturn: null }));
    expect(result.status).toBe('incomplete');
    expect(result.rows[0]!.assets).toBe(600000);
    expect(result.issue?.missingField).toBe('investmentReturn');
  });
  it('资产池之外的被动收入在月末追加，不再次计入投资总收益', () => {
    const result = simulatePlan(plan({ initialAssets: 1000000,
      activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }], currentExpenses: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }],
      externalIncome: { amount: 12000, growth: { kind: 'fixed' } } }));
    const monthlyReturn = 1.08 ** (1 / 12) - 1;
    expect(result.status).toBe('complete');
    expect(result.rows[1]!.investmentTotal).toBeCloseTo(1000000 * monthlyReturn, 8);
    expect(result.rows[1]!.externalIncome).toBe(1000);
    expect(result.rows[1]!.netCashFlow).toBe(1000);
    expect(result.rows[1]!.assets).toBeCloseTo(1000000 * (1 + monthlyReturn) + 1000, 7);
    expect(result.rows[12]!.assets).toBeCloseTo(1080000 + 1000 * 0.08 / monthlyReturn, 6);
  });
  it('名义模型不依赖未填写的纯展示通胀', () => {
    const result = simulatePlan(plan({ inflationRate: null, currentExpenses: [{ amount: 120000, growth: { kind: 'fixed' }, durationMonths: null }] }));
    expect(result.status).toBe('complete');
    expect(result.rows[1]!.priceIndex).toBeNull();
    expect(result.rows[1]!.inflationAdjustmentReal).toBeNull();
  });
  it('当前及后续资金不足均停止，不默认借款', () => {
    expect(simulatePlan(plan({ initialAssets: 1 }), project(flow())).issue?.month).toBe(0);
    const result = simulatePlan(plan({ initialAssets: 1, activeIncome: [{ amount: 0, growth: { kind: 'fixed' }, durationMonths: null }] }));
    expect(result.status).toBe('insolvent');
    expect(result.issue?.month).toBe(1);
    expect(result.rows).toHaveLength(2);
  });
  it('不能把超过支出的节省伪装成收入', () => {
    expect(simulatePlan(plan(), project(flow({ kind: 'expense-saving' }))).status).toBe('invalid-cash-flow');
    const result = simulatePlan(plan(), project(flow({ kind: 'expense-saving', amount: 10001, startMonth: 1 })));
    expect(result.status).toBe('invalid-cash-flow');
  });
  it('数值溢出与价格指数下溢有单独状态', () => {
    expect(simulatePlan(plan({ investmentReturn: { annualRate: 1e308 } })).status).toBe('overflow');
    expect(simulatePlan(plan({ inflationRate: -0.999999999999, currentExpenses: [{ amount: 1, growth: { kind: 'fixed' }, durationMonths: null }] })).status).toBe('overflow');
    const result = simulatePlan(plan({ initialAssets: 1e308 }), project(flow({ kind: 'active-income', amount: 1e308 })));
    expect(result.status).toBe('overflow');
    expect(result.issue?.month).toBe(0);
  });
});
