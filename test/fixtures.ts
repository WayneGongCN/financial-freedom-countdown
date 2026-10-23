import { createDefaultGoals, createPlan, type CashFlow, type Goal, type Plan, type Project } from '../src/index.js';

/** 提供显式假设的合成财务计划，禁止测试依赖真实个人数据，喵~ */
export function plan(overrides: Partial<Plan> = {}): Plan {
  return createPlan('2026-10', {
    initialAssets: 600000, inflationRate: 0, investmentReturn: { kind: 'nominal', annualRate: 0.08 },
    cashYield: 0.02,
    activeIncome: { amount: 240000, growth: { kind: 'fixed' } },
    currentExpenses: { amount: 120000, growth: { kind: 'inflation' } }, ...overrides,
  });
}

/** 创建可覆盖时间与增长规则的单笔合成现金流，喵~ */
export function flow(overrides: Partial<CashFlow> = {}): CashFlow {
  return { id: 'payment', kind: 'expense', amount: 10000, growth: { kind: 'fixed' },
    priceAnchorMonth: 0, startMonth: 0, endMonth: null, frequency: 'once', continuesAfterFreedom: true, ...overrides };
}

/** 将现金流包装为独立试算项目，喵~ */
export function project(...cashFlows: CashFlow[]): Project {
  return { id: 'test-project', name: '合成项目', notes: '', cashFlows };
}

/** 读取可编辑的提取率模板副本，喵~ */
export function freedomGoal(): Goal {
  return createDefaultGoals()[2]!;
}

/** 构造固定名义或购买力资本门槛，喵~ */
export function amountGoal(amount: number, basis: 'nominal' | 'real' = 'nominal'): Goal {
  return { id: 'amount', name: '资产目标', left: { kind: 'assets', basis: 'nominal' },
    right: { kind: 'amount', amount, unit: 'capital', basis }, ratio: 1, comparison: 'scenario' };
}
