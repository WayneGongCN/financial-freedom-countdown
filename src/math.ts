import type { AnnualFlow, Growth, Plan } from './schema.js';

export class MissingInputError extends Error {
  /** 标识具体缺失的财务输入，供调用方按需补全，喵~ */
  constructor(public readonly field: string) {
    super(`缺少输入：${field}`);
    this.name = 'MissingInputError';
  }
}

/** 读取必需输入，明确区分未填写与零值，喵~ */
export function required<T>(value: T | null, field: string): T {
  if (value === null) throw new MissingInputError(field);
  return value;
}

/** 将复合年收益率换算为等价月收益率，喵~ */
export function annualToMonthly(annualRate: number): number {
  if (!Number.isFinite(annualRate) || annualRate <= -1) throw new RangeError('年率必须有限且大于 -100%');
  return Math.expm1(Math.log1p(annualRate) / 12);
}

/** 按明确的基准月份计算物价指数，喵~ */
export function priceIndex(plan: Plan, month: number): number {
  if (month === 0) return 1;
  return Math.pow(1 + required(plan.inflationRate, 'inflationRate'), month / 12);
}

/** 读取用户锁定的未扣通胀年化总收益率，喵~ */
export function nominalReturn(plan: Plan): number {
  return required(plan.investmentReturn, 'investmentReturn').annualRate;
}

/** 仅作为派生结果计算扣除通胀后的购买力年收益率，喵~ */
export function realReturn(plan: Plan): number {
  return (1 + nominalReturn(plan)) / (1 + required(plan.inflationRate, 'inflationRate')) - 1;
}

/** 解析固定、联动物价与独立名义增长规则，喵~ */
export function growthRate(growth: Growth, plan: Plan): number {
  if (growth.kind === 'fixed') return 0;
  return growth.kind === 'custom' ? growth.annualRate : required(plan.inflationRate, 'inflationRate');
}

/** 将报价按唯一增长规则推进到指定月份，零金额无需额外假设，喵~ */
export function growAmount(amount: number, growth: Growth, plan: Plan, elapsedMonths: number): number {
  if (elapsedMonths === 0 || amount === 0) return amount;
  return amount * Math.pow(1 + growthRate(growth, plan), elapsedMonths / 12);
}

/** 读取候选月份的年化收入或预算水平，喵~ */
export function annualValue(flow: AnnualFlow | null, plan: Plan, month: number, field: string): number {
  const input = required(flow, field);
  return growAmount(input.amount, input.growth, plan, month);
}

/** 按阶段起点计算主动年收入，第零月仅提供当前水平，有限末段结束后归零，喵~ */
export function activeIncomeAnnualAt(plan: Plan, month: number): number {
  const stages = required(plan.activeIncome, 'activeIncome');
  let start = 0;
  for (const stage of stages) {
    if (stage.durationMonths === null || month <= start + stage.durationMonths) {
      return growAmount(stage.amount, stage.growth, plan, month - start);
    }
    start += stage.durationMonths;
  }
  return 0;
}

/** 在同一时点转换显示币值，统计算法保持不变，喵~ */
export function convertBasis(value: number, from: 'nominal' | 'real', to: 'nominal' | 'real', plan: Plan, month: number): number {
  if (from === to) return value;
  return to === 'real' ? value / priceIndex(plan, month) : value * priceIndex(plan, month);
}
