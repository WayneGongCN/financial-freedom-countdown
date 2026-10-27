import { annualValue, growAmount, scheduledAnnualAt } from './math.js';
import { MAX_MONTHS, type CashFlow, type Plan, type Project } from './schema.js';

export interface ProjectCash {
  activeIncome: number;
  passiveIncome: number;
  expenses: number;
  savings: number;
  net: number;
}

/** 判断实际收付月份，年度付款不被摊成月付款，喵~ */
export function isDue(flow: CashFlow, month: number): boolean {
  if (month < flow.startMonth || (flow.endMonth !== null && month > flow.endMonth)) return false;
  if (flow.frequency === 'once') return month === flow.startMonth;
  return flow.frequency === 'monthly' || (month - flow.startMonth) % 12 === 0;
}

/** 根据价格锚点生成一笔名义金额，不重复叠加通胀，喵~ */
export function cashAmount(flow: CashFlow, plan: Plan, month: number): number {
  return growAmount(flow.amount, flow.growth, plan, month - flow.priceAnchorMonth);
}

/** 汇总项目当月实际现金流，正负方向由业务类型决定，喵~ */
export function projectCashAt(plan: Plan, project: Project | null, month: number): ProjectCash {
  const cash: ProjectCash = { activeIncome: 0, passiveIncome: 0, expenses: 0, savings: 0, net: 0 };
  for (const flow of project?.cashFlows ?? []) {
    if (!isDue(flow, month)) continue;
    const value = cashAmount(flow, plan, month);
    if (flow.kind === 'active-income') cash.activeIncome += value;
    else if (flow.kind === 'passive-income') cash.passiveIncome += value;
    else if (flow.kind === 'expense') cash.expenses += value;
    else cash.savings += value;
  }
  cash.net = cash.activeIncome + cash.passiveIncome + cash.savings - cash.expenses;
  return cash;
}

/** 返回当前生效的周期项目年化水平，一次性款项不伪装成稳定收入，喵~ */
export function projectAnnualAt(plan: Plan, project: Project | null, month: number): ProjectCash {
  const cash: ProjectCash = { activeIncome: 0, passiveIncome: 0, expenses: 0, savings: 0, net: 0 };
  for (const flow of project?.cashFlows ?? []) {
    if (flow.frequency === 'once' || month < flow.startMonth || (flow.endMonth !== null && month > flow.endMonth)) continue;
    const value = cashAmount(flow, plan, month) * (flow.frequency === 'monthly' ? 12 : 1);
    if (flow.kind === 'active-income') cash.activeIncome += value;
    else if (flow.kind === 'passive-income') cash.passiveIncome += value;
    else if (flow.kind === 'expense') cash.expenses += value;
    else cash.savings += value;
  }
  cash.net = cash.activeIncome + cash.passiveIncome + cash.savings - cash.expenses;
  return cash;
}

/** 建立剩余义务后缀表，准备金假定划出后赚取零名义收益，喵~ */
export function reserveSchedule(plan: Plan, project: Project | null): number[] {
  const payments = Array<number>(MAX_MONTHS + 1).fill(0);
  for (const flow of project?.cashFlows ?? []) {
    if (flow.kind !== 'expense' || !flow.continuesAfterFreedom || (flow.frequency !== 'once' && flow.endMonth === null)) continue;
    const end = flow.frequency === 'once' ? flow.startMonth : flow.endMonth!;
    const step = flow.frequency === 'yearly' ? 12 : 1;
    for (let m = flow.startMonth; m <= end; m += step) {
      payments[m] = payments[m]! + cashAmount(flow, plan, m);
    }
  }
  const remaining = Array<number>(MAX_MONTHS + 1).fill(0);
  for (let m = MAX_MONTHS - 1; m >= 0; m--) remaining[m] = remaining[m + 1]! + payments[m + 1]!;
  return remaining;
}

/** 计算候选月的长期生活预算与已生效外部收入，有限期项目另走准备金，喵~ */
export function retirementAnnualAt(plan: Plan, project: Project | null, month: number, deductExternalIncome: boolean): { expenses: number; externalIncome: number } {
  let expenses = plan.retirementBudget.kind === 'current'
    ? scheduledAnnualAt(plan.currentExpenses, plan, month, 'retirementBudget')
    : annualValue(plan.retirementBudget.flow, plan, month, 'retirementBudget');
  let externalIncome = deductExternalIncome ? annualValue(plan.externalIncome, plan, month, 'externalIncome') : 0;
  for (const item of project?.cashFlows ?? []) {
    if (!item.continuesAfterFreedom || item.frequency === 'once' || item.endMonth !== null) continue;
    if (item.kind === 'active-income' || (item.kind === 'passive-income' && !deductExternalIncome)) continue;
    if (item.kind !== 'expense' && item.startMonth > month) continue;
    const annual = cashAmount(item, plan, month) * (item.frequency === 'monthly' ? 12 : 1);
    if (item.kind === 'expense') expenses += annual;
    if (item.startMonth <= month && item.kind === 'expense-saving') expenses -= annual;
    if (item.startMonth <= month && item.kind === 'passive-income' && deductExternalIncome) externalIncome += annual;
  }
  if (expenses < 0) throw new RangeError('节省费用不能超过自由后生活预算');
  return { expenses, externalIncome };
}
