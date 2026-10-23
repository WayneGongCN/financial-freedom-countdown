import { projectCashAt } from './cash-flows.js';
import { annualToMonthly, annualValue, MissingInputError, nominalReturn, priceIndex, required } from './math.js';
import { planSchema, projectSchema, type Plan, type Project } from './schema.js';

export interface MonthlyRow {
  month: number;
  assets: number;
  priceIndex: number | null;
  activeIncome: number;
  externalIncome: number;
  expenses: number;
  netCashFlow: number;
  investmentTotal: number;
  investmentCash: number | null;
  investmentPriceChange: number | null;
  inflationAdjustmentReal: number | null;
}

export interface Projection {
  status: 'complete' | 'incomplete' | 'insolvent' | 'invalid-cash-flow' | 'overflow';
  rows: MonthlyRow[];
  horizonMonths: number;
  issue: { month: number; reason: string; missingField?: string } | null;
}

/** 允许名义计算独立于未填写的展示通胀参数，喵~ */
function optionalPriceIndex(plan: Plan, month: number): number | null {
  return month === 0 || plan.inflationRate !== null ? priceIndex(plan, month) : null;
}

/** 将数值溢出与零值区分，避免输出无穷资本或错误倒计时，喵~ */
function finiteRow(row: MonthlyRow): boolean {
  return Object.values(row).every((value) => value === null || (Number.isFinite(value)))
    && (row.priceIndex === null || row.priceIndex > 0);
}

/** 按月末收付规则推演名义资产，预留额外十二个月供窗口指标使用，喵~ */
export function simulatePlan(planInput: Plan, projectInput: Project | null = null): Projection {
  const plan = planSchema.parse(planInput);
  const project = projectInput === null ? null : projectSchema.parse(projectInput);
  const result: Projection = { status: 'complete', rows: [], horizonMonths: plan.horizonMonths, issue: null };
  let month = 0;
  try {
    const initial = required(plan.initialAssets, 'initialAssets');
    const upfront = projectCashAt(plan, project, 0);
    if (upfront.savings > upfront.expenses) throw new RangeError('第 0 月不能节省尚未发生的基础月末支出');
    const first: MonthlyRow = {
      month: 0, assets: initial + upfront.net, priceIndex: 1,
      activeIncome: upfront.activeIncome, externalIncome: upfront.passiveIncome,
      expenses: upfront.expenses - upfront.savings, netCashFlow: upfront.net,
      investmentTotal: 0, investmentCash: 0, investmentPriceChange: 0, inflationAdjustmentReal: 0,
    };
    result.rows.push(first);
    if (!finiteRow(first)) {
      result.status = 'overflow'; result.issue = { month, reason: '金额超出数值范围' }; return result;
    }
    if (first.assets < 0) {
      result.status = 'insolvent'; result.issue = { month, reason: '当前可投资资产不足，不自动借款' }; return result;
    }
    const monthlyReturn = annualToMonthly(nominalReturn(plan));
    for (month = 1; month <= plan.horizonMonths + 12; month++) {
      const previous = result.rows[month - 1]!;
      const cash = projectCashAt(plan, project, month);
      const activeIncome = annualValue(plan.activeIncome, plan, month, 'activeIncome') / 12 + cash.activeIncome;
      const externalIncome = annualValue(plan.externalIncome, plan, month, 'externalIncome') / 12 + cash.passiveIncome;
      const expenses = annualValue(plan.currentExpenses, plan, month, 'currentExpenses') / 12 + cash.expenses - cash.savings;
      if (expenses < 0) throw new RangeError('节省费用不能超过该月支出');
      const investmentTotal = previous.assets * monthlyReturn;
      const investmentCash = plan.cashYield === null ? null : previous.assets * plan.cashYield / 12;
      const index = optionalPriceIndex(plan, month);
      const netCashFlow = activeIncome + externalIncome - expenses;
      const row: MonthlyRow = {
        month, assets: previous.assets + investmentTotal + netCashFlow, priceIndex: index,
        activeIncome, externalIncome, expenses, netCashFlow, investmentTotal, investmentCash,
        investmentPriceChange: investmentCash === null ? null : investmentTotal - investmentCash,
        inflationAdjustmentReal: index === null || previous.priceIndex === null ? null
          : previous.assets * (1 / index - 1 / previous.priceIndex),
      };
      if (!finiteRow(row)) {
        result.status = 'overflow'; result.issue = { month, reason: '增长假设导致数值溢出或物价指数下溢' }; return result;
      }
      result.rows.push(row);
      if (row.assets < 0) {
        result.status = 'insolvent'; result.issue = { month, reason: '可投资资产不足，不继续模拟借款收益' }; return result;
      }
    }
  } catch (error) {
    if (!(error instanceof MissingInputError || error instanceof RangeError)) throw error;
    result.status = error instanceof MissingInputError ? 'incomplete' : 'invalid-cash-flow';
    result.issue = error instanceof MissingInputError
      ? { month, reason: error.message, missingField: error.field }
      : { month, reason: error.message };
  }
  return result;
}
