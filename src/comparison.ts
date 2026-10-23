import { evaluateGoal, forecastGoal, type GoalEvaluation, type GoalForecast } from './goals.js';
import { createMetricContext } from './metrics.js';
import type { Goal, Plan, Project } from './schema.js';

export interface FinancialImpact {
  status: 'available';
  referenceMonth: number;
  immediateAssetReduction: number;
  netPrincipalDifferenceNominal: number;
  investmentReturnDifferenceNominal: number;
  assetDifferenceNominal: number;
  netPrincipalDifferenceReal: number | null;
  investmentReturnDifferenceReal: number | null;
  assetDifferenceReal: number | null;
}

export interface GoalComparison {
  goalId: string;
  baseline: GoalForecast;
  scenario: GoalForecast;
  delayMonths: number | null;
  baselineAtReference: GoalEvaluation;
  scenarioAtReference: GoalEvaluation;
  targetChangeAtReference: number | null;
  gapChangeAtReference: number | null;
}

/** 使用同一宏观假设和目标定义比较项目，正差额表示资产减少或目标延后，喵~ */
export function compareProject(plan: Plan, goals: readonly Goal[], project: Project, options: { referenceMonth?: number; primaryGoalId?: string } = {}) {
  const baseline = createMetricContext(plan);
  const scenario = createMetricContext(plan, project);
  const forecasts = goals.map((goal) => ({ goal, baseline: forecastGoal(baseline, goal), scenario: forecastGoal(scenario, goal, baseline) }));
  if (options.primaryGoalId !== undefined && !goals.some((goal) => goal.id === options.primaryGoalId)) throw new RangeError('主目标不存在');
  const primary = options.primaryGoalId === undefined
    ? forecasts.find(({ goal }) => goal.right.kind === 'metric' && goal.right.metric.kind === 'required-capital') ?? forecasts[0]
    : forecasts.find(({ goal }) => goal.id === options.primaryGoalId);
  const referenceMonth = options.referenceMonth ?? primary?.baseline.firstMonth ?? Math.min(120, plan.horizonMonths);
  if (!Number.isInteger(referenceMonth) || referenceMonth < 0 || referenceMonth > plan.horizonMonths) throw new RangeError('比较月份超出测算范围');
  const goalResults: GoalComparison[] = forecasts.map(({ goal, baseline: before, scenario: after }) => {
    const beforeAt = evaluateGoal(baseline, goal, referenceMonth);
    const afterAt = evaluateGoal(scenario, goal, referenceMonth, baseline);
    const comparable = beforeAt.right.status === 'available' && afterAt.right.status === 'available'
      && !['invalid', 'unavailable'].includes(beforeAt.status) && !['invalid', 'unavailable'].includes(afterAt.status);
    return {
      goalId: goal.id, baseline: before, scenario: after,
      delayMonths: before.firstMonth !== null && after.firstMonth !== null ? after.firstMonth - before.firstMonth : null,
      baselineAtReference: beforeAt, scenarioAtReference: afterAt,
      targetChangeAtReference: comparable && beforeAt.right.status === 'available' && afterAt.right.status === 'available'
        ? afterAt.right.value - beforeAt.right.value : null,
      gapChangeAtReference: beforeAt.gap !== null && afterAt.gap !== null ? afterAt.gap - beforeAt.gap : null,
    };
  });
  let impact: FinancialImpact | { status: 'unavailable'; referenceMonth: number; reason: string };
  const before = baseline.projection.rows[referenceMonth];
  const after = scenario.projection.rows[referenceMonth];
  if (!before || !after || before.assets < 0 || after.assets < 0) {
    impact = { status: 'unavailable', referenceMonth, reason: '比较月份缺少有效资产路径，请补齐输入或处理资金缺口' };
  } else {
    let principalNominal = 0;
    let principalReal: number | null = 0;
    for (let m = 0; m <= referenceMonth; m++) {
      const a = baseline.projection.rows[m]!;
      const b = scenario.projection.rows[m]!;
      const difference = a.netCashFlow - b.netCashFlow;
      principalNominal += difference;
      principalReal = principalReal === null || a.priceIndex === null ? null : principalReal + difference / a.priceIndex;
    }
    const differenceNominal = before.assets - after.assets;
    const differenceReal = before.priceIndex === null ? null : differenceNominal / before.priceIndex;
    impact = {
      status: 'available', referenceMonth,
      immediateAssetReduction: baseline.projection.rows[0]!.assets - scenario.projection.rows[0]!.assets,
      netPrincipalDifferenceNominal: principalNominal,
      investmentReturnDifferenceNominal: differenceNominal - principalNominal,
      assetDifferenceNominal: differenceNominal,
      netPrincipalDifferenceReal: principalReal,
      investmentReturnDifferenceReal: differenceReal === null || principalReal === null ? null : differenceReal - principalReal,
      assetDifferenceReal: differenceReal,
    };
  }
  return { baseline: baseline.projection, scenario: scenario.projection, goals: goalResults, impact };
}

export type ProjectComparison = ReturnType<typeof compareProject>;
