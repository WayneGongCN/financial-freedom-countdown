import { cashAmount, isDue, projectAnnualAt, reserveSchedule, retirementAnnualAt } from './cash-flows.js';
import { activeIncomeAnnualAt, annualValue, convertBasis, expensesAnnualAt, MissingInputError, nominalReturn, priceIndex, required } from './math.js';
import { simulatePlan, type MonthlyRow, type Projection } from './projection.js';
import { metricSchema, planSchema, projectSchema, type Basis, type Component, type MetricSpec, type Plan, type Project } from './schema.js';

export interface MetricContext {
  readonly plan: Plan;
  readonly project: Project | null;
  readonly projection: Projection;
  reserve: number[] | null;
}

export interface MetricValue {
  status: 'available';
  value: number;
  basis: Basis;
  unit: 'capital' | 'annual-flow';
  frame: 'point' | 'annualized' | 'next-12-months';
  month: number;
  description: string;
}

export interface UnavailableMetric {
  status: 'unavailable';
  reason: string;
  code: 'missing-input' | 'unavailable-projection' | 'invalid';
  missingField?: string;
}
export type MetricResult = MetricValue | UnavailableMetric;

export const COMPONENT_LABELS: Record<Component, string> = {
  'active-income': '主动收入', 'external-income': '外部被动收入',
  'investment-total': '投资总收益', expenses: '支出',
  'inflation-adjustment': '持有本金购买力调整',
};

class ProjectionUnavailableError extends Error {}

/** 创建可复用的计算上下文，不修改输入计划或项目，喵~ */
export function createMetricContext(planInput: Plan, projectInput: Project | null = null): MetricContext {
  const plan = planSchema.parse(planInput);
  const project = projectInput === null ? null : projectSchema.parse(projectInput);
  return { plan, project, projection: simulatePlan(plan, project), reserve: null };
}

/** 为指标生成明确的组成与时间说明，名称不能代替计算口径，喵~ */
export function describeMetric(metric: MetricSpec): string {
  const basis = metric.basis === 'nominal' ? '名义口径' : '基准月购买力口径';
  if (metric.kind === 'assets') return `时点可投资资产；${basis}`;
  if (metric.kind === 'asset-growth') return `未来 12 个月资产余额增量；${basis}`;
  if (metric.kind === 'required-capital') return `候选月常态年化预算 ÷ ${metric.withdrawalRate * 100}%${metric.includeReserve ? ' ＋ 剩余义务准备金' : ''}；${basis}`;
  return `${metric.components.map((part) => `${part === 'expenses' ? '−' : '+'}${COMPONENT_LABELS[part]}`).join(' ')}；${metric.aggregation === 'annualized' ? '当月年化水平' : '未来 12 个月逐期合计'}；${basis}`;
}

/** 读取有效月份，禁止从资金不足后的不存在路径推断结果，喵~ */
function rowAt(context: MetricContext, month: number): MonthlyRow {
  const row = context.projection.rows[month];
  if (!row || row.assets < 0) throw new ProjectionUnavailableError(context.projection.issue?.reason ?? '该月份没有可用推演结果');
  return row;
}

/** 根据指标依赖读取当前资产，缺少预测参数不阻止时点资产展示，喵~ */
function assetsAt(context: MetricContext, month: number): number {
  if (month === 0 && context.projection.rows.length === 0) return required(context.plan.initialAssets, 'initialAssets');
  return rowAt(context, month).assets;
}

/** 提取当月年化组成项，不将一次性增收视为稳定收入，喵~ */
function annualComponent(context: MetricContext, component: Component, month: number): number {
  const { plan, project } = context;
  const relevantProject = project === null ? null : { ...project, cashFlows: project.cashFlows.filter((flow) =>
    component === 'active-income' ? flow.kind === 'active-income'
      : component === 'external-income' ? flow.kind === 'passive-income'
        : component === 'expenses' && (flow.kind === 'expense' || flow.kind === 'expense-saving')) };
  const event = projectAnnualAt(plan, relevantProject, month);
  if (component === 'active-income') return activeIncomeAnnualAt(plan, month) + event.activeIncome;
  if (component === 'external-income') return annualValue(plan.externalIncome, plan, month, 'externalIncome') + event.passiveIncome;
  if (component === 'expenses') {
    const expenses = expensesAnnualAt(plan, month) + event.expenses - event.savings;
    if (expenses < 0) throw new RangeError('节省费用不能超过当月年化支出');
    return -expenses;
  }
  const assets = assetsAt(context, month);
  if (assets === 0) return 0;
  return assets * nominalReturn(plan);
}

/** 从统一账本读取组成项，购买力调整已经是实际金额，喵~ */
function monthlyComponent(row: MonthlyRow, component: Exclude<Component, 'active-income' | 'external-income' | 'expenses'>): number {
  if (component === 'investment-total') return row.investmentTotal;
  return required(row.inflationAdjustmentReal, 'inflationRate');
}

/** 单独推导预算现金流，不要求与该指标无关的资产和投资输入，喵~ */
function budgetComponent(context: MetricContext, component: 'active-income' | 'external-income' | 'expenses', month: number): number {
  const { plan, project } = context;
  let value = (component === 'active-income' ? activeIncomeAnnualAt(plan, month)
    : component === 'expenses' ? expensesAnnualAt(plan, month)
      : annualValue(plan.externalIncome, plan, month, 'externalIncome')) / 12;
  for (const event of project?.cashFlows ?? []) {
    const relevant = component === 'active-income' ? event.kind === 'active-income'
      : component === 'external-income' ? event.kind === 'passive-income'
        : event.kind === 'expense' || event.kind === 'expense-saving';
    if (relevant && isDue(event, month)) value += cashAmount(event, plan, month) * (event.kind === 'expense-saving' ? -1 : 1);
  }
  if (component === 'expenses' && value < 0) throw new RangeError('节省费用不能超过该月支出');
  return component === 'expenses' ? -value : value;
}

/** 执行单个受限指标，返回可供 UI 区分缺失数据与非法定义的结果，喵~ */
export function evaluateMetric(context: MetricContext, spec: MetricSpec, month = 0): MetricResult {
  const metric = metricSchema.parse(spec);
  if (!Number.isInteger(month) || month < 0 || month > context.plan.horizonMonths) throw new RangeError('月份超出测算范围');
  try {
    let value: number;
    let frame: MetricValue['frame'] = 'point';
    let unit: MetricValue['unit'] = 'capital';
    if (metric.kind === 'assets') {
      value = convertBasis(assetsAt(context, month), 'nominal', metric.basis, context.plan, month);
    } else if (metric.kind === 'asset-growth') {
      frame = 'next-12-months'; unit = 'annual-flow';
      value = convertBasis(rowAt(context, month + 12).assets, 'nominal', metric.basis, context.plan, month + 12)
        - convertBasis(assetsAt(context, month), 'nominal', metric.basis, context.plan, month);
    } else if (metric.kind === 'required-capital') {
      const annual = retirementAnnualAt(context.plan, context.project, month, metric.deductExternalIncome);
      if (metric.includeReserve && context.reserve === null) context.reserve = reserveSchedule(context.plan, context.project);
      const reserve = metric.includeReserve ? context.reserve![month]! : 0;
      value = convertBasis(Math.max(annual.expenses - annual.externalIncome, 0) / metric.withdrawalRate + reserve,
        'nominal', metric.basis, context.plan, month);
    } else {
      frame = metric.aggregation; unit = 'annual-flow'; value = 0;
      if (metric.aggregation === 'annualized') {
        for (const component of metric.components) value += annualComponent(context, component, month);
        value = convertBasis(value, 'nominal', metric.basis, context.plan, month);
      } else {
        for (let m = month + 1; m <= month + 12; m++) {
          for (const component of metric.components) {
            const part = component === 'active-income' || component === 'external-income' || component === 'expenses'
              ? budgetComponent(context, component, m) : monthlyComponent(rowAt(context, m), component);
            value += metric.basis === 'real' && component !== 'inflation-adjustment'
              ? part / priceIndex(context.plan, m) : part;
          }
        }
      }
    }
    if (!Number.isFinite(value)) throw new RangeError('指标数值溢出');
    return { status: 'available', value, basis: metric.basis, unit, frame, month, description: describeMetric(metric) };
  } catch (error) {
    if (error instanceof MissingInputError) return { status: 'unavailable', code: 'missing-input', missingField: error.field, reason: error.message };
    if (error instanceof ProjectionUnavailableError) return { status: 'unavailable', code: 'unavailable-projection', reason: error.message };
    if (error instanceof RangeError) return { status: 'unavailable', code: 'invalid', reason: error.message };
    throw error;
  }
}

export interface DisplayValue {
  value: number;
  basis: Basis;
  label: string;
}

/** 仅转换已算好的金额表示，不重新计算统计口径或目标状态，喵~ */
export function displayMetric(result: MetricValue, plan: Plan, basis: Basis): DisplayValue {
  const aggregate = result.frame === 'next-12-months';
  return {
    value: convertBasis(result.value, result.basis, basis, plan, result.month), basis,
    label: `${result.description}；${basis === 'real' ? `按 ${plan.baseMonth} 购买力显示` : `第 ${result.month} 月币值显示`}${aggregate ? '（已确定合计额的等值表达，不更改逐期统计方式）' : ''}`,
  };
}
