import { useMemo } from 'react';
import { calculateMilestones, compareProject, describeMetric, evaluateGoal, convertBasis, type FinanceDocument, type MetricContext, type GoalForecast, type Project, type ProjectComparison } from '../../src/index';
import { forecastHero, forecastText, growthLabel, monthAt, monthLabel, numberText, shownMetric } from '../model/format';
import type { EvaluationModel, OverviewModel, RowModel } from '../ui/types';

/** 共享同一次推演的上下文，不重复运行资产账本，喵~ */
export function calculateResults(document: FinanceDocument, project: Project | null) {
  const { plan, goals, preferences } = document;
  const comparison = project ? compareProject(plan, goals, project, preferences.primaryGoalId ? { primaryGoalId: preferences.primaryGoalId } : {}) : null;
  const baseline = comparison ? { projection: comparison.baseline, goals: comparison.goals.map((goal) => goal.baseline) } : calculateMilestones(plan, goals);
  const context: MetricContext = { plan, project: null, projection: baseline.projection, reserve: null };
  const primary = goals.find((goal) => goal.id === preferences.primaryGoalId);
  const forecast = baseline.goals.find((goal) => goal.goalId === primary?.id);
  const future = primary && forecast?.firstMonth !== null && forecast?.firstMonth !== undefined ? evaluateGoal(context, primary, forecast.firstMonth) : null;
  return { baseline, comparison, primary, forecast, future };
}
export type CalculatedResults = ReturnType<typeof calculateResults>;

/** 将基准预测转换为展示数据，不因切换显示币值改变日期，喵~ */
export function overviewModel(document: FinanceDocument, calculated: CalculatedResults): OverviewModel {
  const { plan, preferences } = document;
  const { primary, forecast, future, baseline } = calculated;
  const basis = preferences.displayBasis;
  const unit = forecast?.current.left.status === 'available' && forecast.current.left.unit === 'annual-flow' ? '万/年' : '万';
  const left = forecast ? shownMetric(forecast.current.left, plan, basis) : null;
  const target = forecast ? shownMetric(forecast.current.right, plan, basis) : null;
  const gap = left !== null && target !== null ? target - left : null;
  const futureValue = future ? shownMetric(future.right, plan, basis) : null;
  const futureNominal = future ? shownMetric(future.right, plan, basis === 'real' ? 'nominal' : 'real') : null;
  const coverage = forecast?.current.coverage ?? null;
  const isCapital = primary?.left.kind === 'assets';
  return {
    empty: plan.currentExpenses === null && plan.initialAssets === null, noGoals: !primary,
    basis, basisLabel: `购买力基准 · ${monthLabel(plan.baseMonth)}`,
    title: primary?.name ?? '设置你的自由目标', titleHelp: primary?.right.kind === 'metric' && primary.right.metric.kind === 'required-capital' ? 'withdrawal-rate' : 'goal-amount-basis',
    hero: forecastHero(forecast), target: `当前目标 ${numberText(target === null ? null : target / 10000)} ${unit}`,
    coverage: coverage === null ? '进度待补充' : `已完成 ${numberText(coverage * 100, 1)}%`, progress: coverage === null ? null : Math.max(0, Math.min(100, coverage * 100)),
    balances: [{ label: isCapital ? '已积累' : '当前指标', value: numberText(left === null ? null : left / 10000), unit, tone: 'positive' },
      { label: gap !== null && gap < 0 ? '已超出目标' : '当前缺口', value: numberText(gap === null ? null : Math.abs(gap) / 10000), unit, tone: gap !== null && gap <= 0 ? 'positive' : 'negative' }],
    projected: future ? { title: '预计达成月份的目标', value: `${numberText(futureValue === null ? null : futureValue / 10000)} ${unit === '万' ? '万元' : '万元/年'}`,
      note: futureValue === null ? '补充通胀假设后可换算购买力' : basis === 'real' ? `${monthLabel(plan.baseMonth)}购买力 · 届时约 ${numberText(futureNominal === null ? null : futureNominal / 10000)} ${unit}`
        : `${monthLabel(monthAt(plan.baseMonth, forecast!.firstMonth!))}名义金额 · 基准月约 ${numberText(futureNominal === null ? null : futureNominal / 10000)} ${unit}` } : null,
    assumptions: [`${plan.investmentReturn?.kind === 'real' ? '实际' : '名义'}收益 ${plan.investmentReturn ? `${numberText(plan.investmentReturn.annualRate * 100)}%` : '未填写'} · 通胀 ${plan.inflationRate === null ? '未填写' : `${numberText(plan.inflationRate * 100)}%`}`,
      `工资${growthLabel(plan.activeIncome?.growth)} · 支出${growthLabel(plan.currentExpenses?.growth)} · 调整假设 ›`],
    milestones: baseline.goals.filter((item) => item.goalId !== primary?.id).map((item) => {
      const goal = document.goals.find((g) => g.id === item.goalId)!;
      return { id: goal.id, title: goal.name, value: forecastText(item), rule: `${describeMetric(goal.left)} / ${goal.right.kind === 'metric' ? describeMetric(goal.right.metric) : goal.right.basis === 'real' ? '保持基准月购买力' : '固定名义金额'}` };
    }),
    statusNote: forecast?.firstMonth === null ? forecastHero(forecast).note ?? null : null,
  };
}

/** 在相同参考月显示已有归因字段，不重新发明购买力分解公式，喵~ */
export function evaluationModel(document: FinanceDocument, comparison: ProjectComparison | null, draftError?: string): EvaluationModel {
  const basis = document.preferences.displayBasis;
  const base: EvaluationModel = { hero: { label: '预计影响', value: '—', note: '填写一笔消费，看看它如何影响自由时间。' }, rows: [], impactRows: [], impactHero: null,
    comparisonNote: '对照：当前计划，使用相同宏观假设和目标规则。', basis, basisLabel: `${monthLabel(document.plan.baseMonth)}购买力`, ...(draftError ? { error: draftError } : {}) };
  if (!comparison || draftError) return base;
  const result = comparison.goals.find((goal) => goal.goalId === document.preferences.primaryGoalId);
  const impact = comparison.impact;
  if (result) {
    const delay = result.delayMonths;
    base.hero = delay === null ? { label: '预计影响', value: '—', note: `基准：${forecastText(result.baseline)}；项目后：${forecastText(result.scenario)}。${result.scenario.reason ?? ''}` }
      : { label: delay === 0 ? '达成月份' : delay > 0 ? '预计延后' : '预计提前', value: delay === 0 ? '不变' : numberText(Math.abs(delay), 0), ...(delay === 0 ? {} : { unit: '个月' }), tone: delay > 0 ? 'negative' : delay < 0 ? 'positive' : 'neutral' };
    const currentBefore = comparison.baseline.rows[0]?.assets;
    const currentAfter = comparison.scenario.rows[0]?.assets;
    const goal = document.goals.find((g) => g.id === result.goalId)!;
    const beforeCurrent = result.baseline.current.right;
    const afterCurrent = result.scenario.current.right;
    const targetUnit = goal.left.kind === 'flow' || goal.left.kind === 'asset-growth' ? '元/年' : '元';
    base.rows = [
      { label: '实现时间', value: `${forecastText(result.baseline)} → ${forecastText(result.scenario)}` },
      { label: '当前可投资资产', value: `${numberText(currentBefore)} → ${numberText(currentAfter)} 元` },
      { label: '当前目标', value: `${numberText(shownMetric(beforeCurrent, document.plan, basis))} → ${numberText(shownMetric(afterCurrent, document.plan, basis))} ${targetUnit}` },
    ];
    if (impact.status === 'available') {
      let targetChange: number | null = null;
      try { targetChange = result.targetChangeAtReference === null || result.baselineAtReference.right.status !== 'available' ? null : convertBasis(result.targetChangeAtReference, result.baselineAtReference.right.basis, basis, document.plan, impact.referenceMonth); } catch { /* 缺失通胀时保留不可换算状态，喵~ */ }
      const principal = basis === 'real' ? impact.netPrincipalDifferenceReal : impact.netPrincipalDifferenceNominal;
      const investment = basis === 'real' ? impact.investmentReturnDifferenceReal : impact.investmentReturnDifferenceNominal;
      const difference = basis === 'real' ? impact.assetDifferenceReal : impact.assetDifferenceNominal;
      base.impactRows = [{ label: '本金投入减少', value: `${numberText(principal)} 元` }, { label: basis === 'real' ? '实际投资影响' : '名义投资收益减少', value: `${numberText(investment)} 元` }, { label: '同月目标金额变化', value: `${numberText(targetChange)} ${targetUnit}` }];
      base.impactHero = { label: `资产差额 · 第 ${impact.referenceMonth} 个月${basis === 'real' ? '基准月购买力' : '名义金额'}`, value: numberText(difference), unit: '元', tone: difference === null || difference === 0 ? 'neutral' : difference > 0 ? 'negative' : 'positive', ...(difference === null ? { note: '填写通胀假设后可换算购买力。' } : {}) };
    }
  }
  if (impact.status === 'unavailable') base.error = impact.reason;
  const reference = comparison.impact.referenceMonth;
  base.comparisonNote = `对照：当前计划 · ${result?.baseline.firstMonth === reference ? '基准预计达成月' : '比较月份'}：第 ${reference} 个月（${monthLabel(monthAt(document.plan.baseMonth, reference))}）。本金与投资影响同月比较，不叠加“额外通胀损失”。`;
  return base;
}

/** 为容器集中提供财务结果，显示偏好不触发全量财务推演，喵~ */
export function useFinanceResults(document: FinanceDocument, project: Project | null = document.project, error?: string) {
  const { plan, goals, preferences } = document;
  const primaryId = preferences.primaryGoalId;
  const calculated = useMemo(() => calculateResults({ ...document, plan, goals, preferences: { ...preferences, primaryGoalId: primaryId } }, project),
    // 文档其余字段不参与计算，显示币值留在下面的展示转换中，喵~
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, goals, project, primaryId]);
  const overview = useMemo(() => overviewModel(document, calculated), [document, calculated]);
  const evaluation = useMemo(() => evaluationModel(document, calculated.comparison, error), [document, calculated, error]);
  return { calculated, overview, evaluation };
}

/** 为编辑器返回独立草稿预测，不更新正式文档，喵~ */
export function previewGoal(document: FinanceDocument, id: string): { hero: ReturnType<typeof forecastHero>; rows: RowModel[] } {
  const result = calculateMilestones(document.plan, document.goals);
  const forecast: GoalForecast | undefined = result.goals.find((goal) => goal.goalId === id);
  return { hero: { ...forecastHero(forecast), label: '按此草稿预计还需' }, rows: forecast ? [{ label: '当前目标', value: `${numberText(shownMetric(forecast.current.right, document.plan, document.preferences.displayBasis))} ${forecast.current.right.status === 'available' && forecast.current.right.unit === 'annual-flow' ? '元/年' : '元'}` }] : [] };
}
