import { useMemo } from 'react';
import { calculateMilestones, compareProject, describeMetric, evaluateGoal, convertBasis, type Goal, type Plan, type Projection, type FinanceDocument, type MetricContext, type GoalForecast, type Project, type ProjectComparison } from '../../src/index';
import { forecastHero, forecastText, monthAt, monthLabel, numberText, shownMetric } from '../model/format';
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

/** 只有已设置的非零通胀才提供购买力切换，保留文档中的原始偏好，喵~ */
function displaySettings(document: FinanceDocument) {
  const { plan, preferences } = document;
  const canChangeBasis = plan.inflationRate !== null && plan.inflationRate !== 0;
  const basis = canChangeBasis ? preferences.displayBasis : 'nominal';
  const basisLabel = basis === 'real' ? `购买力基准 · ${monthLabel(plan.baseMonth)}`
    : plan.inflationRate === null ? '名义金额 · 通胀尚未设置'
      : plan.inflationRate === 0 ? '名义金额 · 不计通胀（0%）' : '名义金额 · 按发生月份计价';
  return { basis, basisLabel, canChangeBasis };
}

/** 总览固定使用方案基准月购买力，未知通胀保留名义金额说明，喵~ */
function overviewDisplaySettings(document: FinanceDocument) {
  return document.plan.inflationRate === null
    ? { basis: 'nominal' as const, basisLabel: '通胀未设置，暂按名义金额展示' }
    : { basis: 'real' as const, basisLabel: `购买力基准 · ${monthLabel(document.plan.baseMonth)}` };
}

/** 判断目标门槛是否会受已配置的收入阶段变化影响，喵~ */
function hasChangingIncomeThreshold(plan: Plan, goal?: Goal): boolean {
  return !!(goal?.right.kind === 'metric' && goal.right.metric.kind === 'flow' && goal.right.metric.components.includes('active-income')
    && plan.activeIncome?.some((stage) => stage.durationMonths !== null));
}

/** 说明收入门槛变化与期内资金不足，保留首次达成日期，喵~ */
export function resultNotices(plan: Plan, projection: Projection, goal?: Goal, label = ''): string[] {
  const notices: string[] = [];
  if (hasChangingIncomeThreshold(plan, goal)) {
    notices.push('收入变化会影响比较门槛；达成收入比较目标不代表持续覆盖支出。');
  }
  if (projection.status === 'insolvent' && projection.issue && projection.issue.month <= plan.horizonMonths) {
    notices.push(`${label}预测期内第 ${projection.issue.month} 月资金不足，不继续模拟借款。`);
  }
  return notices;
}

/** 用方案基准月的阶段信息说明收入期限，不按打开日期滚动，喵~ */
function incomeSummary(plan: Plan): string | undefined {
  const stages = plan.activeIncome;
  if (!stages) return undefined;
  if (stages.length > 1) return `共 ${stages.length} 个阶段`;
  const months = stages[0]!.durationMonths;
  return months === null ? undefined : `持续 ${months % 12 === 0 ? `${months / 12} 年` : `${months} 个月`}后停止`;
}

/** 将基准预测转换为展示数据，不因切换显示币值改变日期，喵~ */
export function overviewModel(document: FinanceDocument, calculated: CalculatedResults): OverviewModel {
  const { plan } = document;
  const { primary, forecast, future, baseline } = calculated;
  const display = overviewDisplaySettings(document);
  const { basis } = display;
  const hero = forecastHero(forecast);
  const unit = forecast?.current.left.status === 'available' && forecast.current.left.unit === 'annual-flow' ? '万/年' : '万';
  const left = forecast ? shownMetric(forecast.current.left, plan, basis) : null;
  const target = forecast ? shownMetric(forecast.current.right, plan, basis) : null;
  const gap = left !== null && target !== null ? target - left : null;
  const futureValue = future ? shownMetric(future.right, plan, basis) : null;
  const futureNominal = future ? shownMetric(future.right, plan, 'nominal') : null;
  const coverage = forecast?.current.coverage ?? null;
  const isCapital = primary?.left.kind === 'assets';
  return {
    empty: plan.currentExpenses === null && plan.initialAssets === null, noGoals: !primary,
    ...display, notices: resultNotices(plan, baseline.projection, primary),
    title: primary?.name ?? '设置你的自由目标', titleHelp: primary?.right.kind === 'metric' && primary.right.metric.kind === 'required-capital' ? 'withdrawal-rate' : 'goal-amount-basis',
    hero, target: `当前目标 ${numberText(target === null ? null : target / 10000)} ${unit}`,
    coverage: coverage === null ? '进度待补充' : `已完成 ${numberText(coverage * 100, 1)}%`, progress: coverage === null ? null : Math.max(0, Math.min(100, coverage * 100)),
    gap: { label: gap !== null && gap < 0 ? '已超出目标' : '当前缺口', value: numberText(gap === null ? null : Math.abs(gap) / 10000), unit, tone: gap !== null && gap <= 0 ? 'positive' : 'negative' },
    balances: isCapital ? [] : [{ label: '当前指标', value: numberText(left === null ? null : left / 10000), unit, tone: 'positive' }],
    projected: { title: '预计达成月份的目标', value: futureValue === null ? '—' : `${numberText(futureValue / 10000)} ${unit === '万' ? '万元' : '万元/年'}`,
      note: futureValue === null ? `${hero.note ?? '该目标金额暂不可显示'} · ${display.basisLabel}`
        : basis === 'real' ? `${monthLabel(plan.baseMonth)}购买力 · 届时约 ${numberText(futureNominal === null ? null : futureNominal / 10000)} ${unit}（名义金额）`
          : display.basisLabel },
    coreMetrics: [
      { fieldId: 'assets', label: '当前可投资资产', value: numberText(plan.initialAssets === null ? null : plan.initialAssets / 10000), unit: '万元' },
      { fieldId: 'income', label: '年收入', value: numberText(plan.activeIncome === null ? null : plan.activeIncome[0]!.amount / 10000), unit: '万元/年', note: incomeSummary(plan) },
      { fieldId: 'expenses', label: '年支出', value: numberText(plan.currentExpenses === null ? null : plan.currentExpenses.amount / 10000), unit: '万元/年' },
      { fieldId: 'returnRate', label: '年化总收益率', value: numberText(plan.investmentReturn === null ? null : plan.investmentReturn.annualRate * 100), unit: '%' },
      { fieldId: 'inflation', label: '通胀率', value: numberText(plan.inflationRate === null ? null : plan.inflationRate * 100), unit: '%' },
    ],
    milestones: baseline.goals.filter((item) => item.goalId !== primary?.id).map((item) => {
      const goal = document.goals.find((g) => g.id === item.goalId)!;
      return { id: goal.id, title: goal.name, value: forecastText(item), rule: `${describeMetric(goal.left)} / ${goal.right.kind === 'metric' ? describeMetric(goal.right.metric) : goal.right.basis === 'real' ? '保持基准月购买力' : '固定名义金额'}${hasChangingIncomeThreshold(plan, goal) ? ' · 收入变化会影响比较门槛' : ''}` };
    }),
  };
}

/** 在相同参考月显示已有归因字段，不重新发明购买力分解公式，喵~ */
export function evaluationModel(document: FinanceDocument, comparison: ProjectComparison | null, draftError?: string): EvaluationModel {
  const display = displaySettings(document);
  const { basis } = display;
  const base: EvaluationModel = { hero: { label: '预计影响', value: '—', note: '填写一笔消费，看看它如何影响自由时间。' }, rows: [], impactRows: [], impactHero: null,
    comparisonNote: '对照：当前计划，使用相同宏观假设和目标规则。', ...display, ...(draftError ? { error: draftError } : {}) };
  if (!comparison || draftError) return base;
  const result = comparison.goals.find((goal) => goal.goalId === document.preferences.primaryGoalId);
  const impact = comparison.impact;
  const primary = document.goals.find((goal) => goal.id === document.preferences.primaryGoalId);
  base.notices = [...new Set([...resultNotices(document.plan, comparison.baseline, primary, '基准计划：'), ...resultNotices(document.plan, comparison.scenario, primary, '项目后：')])];
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
export function previewGoal(document: FinanceDocument, id: string): { hero: ReturnType<typeof forecastHero>; rows: RowModel[]; targetName: string; notices: string[] } {
  const goal = document.goals.find((item) => item.id === id);
  const result = goal ? calculateMilestones(document.plan, [goal]) : undefined;
  const forecast: GoalForecast | undefined = result?.goals[0];
  return { hero: { ...forecastHero(forecast), label: '按此草稿预计还需' }, targetName: goal?.name ?? '未选择目标', notices: result ? resultNotices(document.plan, result.projection, goal) : [], rows: forecast ? [{ label: '当前目标', value: `${numberText(shownMetric(forecast.current.right, document.plan, overviewDisplaySettings(document).basis))} ${forecast.current.right.status === 'available' && forecast.current.right.unit === 'annual-flow' ? '元/年' : '元'}` }] : [] };
}
