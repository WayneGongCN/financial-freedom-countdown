import { convertBasis } from './math.js';
import { createMetricContext, evaluateMetric, type MetricContext, type MetricResult, type MetricValue } from './metrics.js';
import { goalSchema, type Goal, type MetricSpec, type Plan, type Project } from './schema.js';

export interface GoalEvaluation {
  status: 'met' | 'not-met' | 'unavailable' | 'invalid' | 'not-applicable';
  left: MetricResult;
  right: MetricResult;
  gap: number | null;
  coverage: number | null;
  reason: string | null;
}

export interface GoalForecast {
  goalId: string;
  current: GoalEvaluation;
  status: 'reached' | 'not-reached' | 'incomplete' | 'blocked' | 'not-applicable' | 'condition-only' | 'invalid';
  firstMonth: number | null;
  reason: string | null;
}

/** 判断完全相同的指标定义，组成项的顺序不改变语义，喵~ */
function sameMetric(a: MetricSpec, b: MetricSpec): boolean {
  const left = a.kind === 'flow' ? { ...a, components: [...a.components].sort() } : a;
  const right = b.kind === 'flow' ? { ...b, components: [...b.components].sort() } : b;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 识别只比较同源投资收益比例的规则，避免制造与本金无关的倒计时，喵~ */
function rateOnly(goal: Goal): boolean {
  if (goal.right.kind !== 'metric') return false;
  const left = goal.left;
  const right = goal.right.metric;
  if (left.kind !== 'flow' || right.kind !== 'flow' || left.basis !== right.basis || left.aggregation !== right.aggregation) return false;
  return [...left.components, ...right.components].every((part) => part === 'investment-total');
}

/** 在同一候选月份判断条件，参照基准时只替换右侧数据路径，喵~ */
export function evaluateGoal(context: MetricContext, goalInput: Goal, month = 0, baseline: MetricContext = context): GoalEvaluation {
  const goal = goalSchema.parse(goalInput);
  const left = evaluateMetric(context, goal.left, month);
  let right: MetricResult;
  if (goal.right.kind === 'metric') {
    right = evaluateMetric(goal.comparison === 'baseline' ? baseline : context, goal.right.metric, month);
  } else if (left.status === 'available') {
    try {
      right = { ...left, value: convertBasis(goal.right.amount, goal.right.basis, left.basis, context.plan, month), unit: goal.right.unit, description: '固定金额目标' };
    } catch {
      right = { status: 'unavailable', code: 'missing-input', missingField: 'inflationRate', reason: '金额目标换算需要通胀假设' };
    }
  } else right = left;
  const base = { left, right, gap: null, coverage: null, reason: null };
  if (left.status !== 'available' || right.status !== 'available') {
    const unavailable = left.status === 'unavailable' ? left : right as Extract<MetricResult, { status: 'unavailable' }>;
    return { ...base, status: unavailable.code === 'invalid' ? 'invalid' : 'unavailable', reason: unavailable.reason };
  }
  if (left.unit !== right.unit || left.frame !== right.frame || left.basis !== right.basis) {
    return { ...base, status: 'invalid', reason: '两侧必须使用相同单位、时间范围和统计币值口径' };
  }
  if (goal.right.kind === 'metric' && left.unit === 'annual-flow' && right.value <= 0) {
    return { ...base, status: 'not-applicable', reason: '收入或结余比较门槛不为正，不能将其视为自动达成' };
  }
  const threshold = right.value * goal.ratio;
  if (!Number.isFinite(threshold)) return { ...base, status: 'invalid', reason: '目标门槛数值溢出' };
  const gap = threshold - left.value;
  return { left, right: { ...right, value: threshold }, gap, coverage: threshold > 0 && left.value >= 0 ? left.value / threshold : null,
    status: gap <= 0 ? 'met' : 'not-met', reason: null };
}

/** 为一项目标搜索首次达成月份，不把窗口不足或资金缺口当作未达到，喵~ */
export function forecastGoal(context: MetricContext, goalInput: Goal, baseline: MetricContext = context): GoalForecast {
  const goal = goalSchema.parse(goalInput);
  const current = evaluateGoal(context, goal, 0, baseline);
  const base = { goalId: goal.id, current, firstMonth: null, reason: current.reason };
  if (current.status === 'invalid') return { ...base, status: 'invalid' };
  if ((goal.comparison === 'scenario' || context === baseline) && goal.right.kind === 'metric'
    && ((sameMetric(goal.left, goal.right.metric) && goal.ratio === 1) || rateOnly(goal))) {
    return { ...base, status: 'condition-only', reason: '该规则比较同源指标或收益比例，不提供资本增长倒计时' };
  }
  let applicable = false;
  for (let month = 0; month <= context.plan.horizonMonths; month++) {
    const needsWindow = goal.left.kind === 'asset-growth' || (goal.left.kind === 'flow' && goal.left.aggregation === 'next-12-months')
      || (goal.right.kind === 'metric' && (goal.right.metric.kind === 'asset-growth'
        || (goal.right.metric.kind === 'flow' && goal.right.metric.aggregation === 'next-12-months')));
    const failed = [context.projection, ...(goal.comparison === 'baseline' ? [baseline.projection] : [])]
      .find((projection) => ['insolvent', 'invalid-cash-flow', 'overflow'].includes(projection.status)
        && projection.issue !== null && projection.issue.month <= month + (needsWindow ? 12 : 0));
    if (failed) return { ...base, status: 'blocked', reason: failed.issue!.reason };
    const evaluation = month === 0 ? current : evaluateGoal(context, goal, month, baseline);
    if (evaluation.status === 'met') return { ...base, status: 'reached', firstMonth: month, reason: null };
    if (evaluation.status === 'not-met') applicable = true;
    if (evaluation.status === 'invalid') return { ...base, status: 'invalid', reason: evaluation.reason };
    if (evaluation.status === 'unavailable') {
      const blocked = [context.projection, ...(goal.comparison === 'baseline' ? [baseline.projection] : [])]
        .some((projection) => ['insolvent', 'invalid-cash-flow', 'overflow'].includes(projection.status));
      return { ...base, status: blocked ? 'blocked' : 'incomplete', reason: evaluation.reason };
    }
  }
  return { ...base, status: applicable ? 'not-reached' : 'not-applicable', reason: applicable ? '测算期内未达到' : current.reason };
}

/** 批量计算独立里程碑，共享同一份资产推演，喵~ */
export function calculateMilestones(plan: Plan, goals: readonly Goal[], project: Project | null = null): { projection: MetricContext['projection']; goals: GoalForecast[] } {
  const context = createMetricContext(plan, project);
  const baseline = project === null ? context : createMetricContext(plan);
  return { projection: context.projection, goals: goals.map((goal) => forecastGoal(context, goal, baseline)) };
}

/** 读取可用结果的数值，供同一时点的差额比较使用，喵~ */
export function availableValue(result: MetricResult): MetricValue | null {
  return result.status === 'available' ? result : null;
}
