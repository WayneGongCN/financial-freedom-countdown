import { MODEL_VERSION, SCHEMA_VERSION, planSchema, type Basis, type FinanceDocument, type Goal, type MetricSpec, type Plan } from './schema.js';

export const METRIC_PRESET_NAMES = {
  'assets': '可投资资产',
  'investment-total': '投资总收益',
  'passive-total': '总被动收入',
  'active-income': '主动收入',
  'active-surplus': '主动收入结余',
  'external-contribution': '外部净投入',
  'asset-growth': '可投资资产增量',
  'freedom-capital': '支出覆盖资本目标',
} as const;
export type MetricPresetId = keyof typeof METRIC_PRESET_NAMES;

/** 用普通指标定义生成预设，调用方修改副本不会改变其他目标，喵~ */
export function metricPreset(id: MetricPresetId, basis: Basis = 'nominal'): MetricSpec {
  if (id === 'assets') return { kind: 'assets', basis };
  if (id === 'asset-growth') return { kind: 'asset-growth', basis };
  if (id === 'freedom-capital') return { kind: 'required-capital', basis, withdrawalRate: 0.04, deductExternalIncome: false, includeReserve: true };
  const parts = {
    'investment-total': ['investment-total'],
    'passive-total': ['investment-total', 'external-income'],
    'active-income': ['active-income'],
    'active-surplus': ['active-income', 'expenses'],
    'external-contribution': ['active-income', 'external-income', 'expenses'],
  } as const;
  return { kind: 'flow', basis, aggregation: 'next-12-months', components: [...parts[id]] };
}

/** 创建缺失值明确的基础计划，不暗中填入收益率或工资通胀联动，喵~ */
export function createPlan(baseMonth: string, overrides: Partial<Plan> = {}): Plan {
  return planSchema.parse({
    baseMonth, currency: 'CNY', initialAssets: null, inflationRate: null,
    investmentReturn: null, activeIncome: null, currentExpenses: null,
    externalIncome: { amount: 0, growth: { kind: 'fixed' } },
    retirementBudget: { kind: 'current' }, horizonMonths: 1200, ...overrides,
  });
}

/** 创建个人偏好的默认目标，保留所有口径与比较策略的可编辑性，喵~ */
export function createDefaultGoals(): Goal[] {
  return [
    { id: 'passive-vs-saving', name: '被动收入覆盖主动储蓄', left: metricPreset('passive-total'), right: { kind: 'metric', metric: metricPreset('active-surplus') }, ratio: 1, comparison: 'baseline' },
    { id: 'passive-vs-income', name: '被动收入覆盖主动收入', left: metricPreset('passive-total'), right: { kind: 'metric', metric: metricPreset('active-income') }, ratio: 1, comparison: 'baseline' },
    { id: 'freedom-capital', name: '支出覆盖目标（4%）', left: metricPreset('assets'), right: { kind: 'metric', metric: metricPreset('freedom-capital') }, ratio: 1, comparison: 'scenario' },
  ];
}

/** 创建带有可编辑长期假设的新文档，基准月份由调用方显式提供，喵~ */
export function createDocument(baseMonth: string): FinanceDocument {
  return {
    schemaVersion: SCHEMA_VERSION, modelVersion: MODEL_VERSION, plan: createPlan(baseMonth, { inflationRate: 0.02, investmentReturn: { annualRate: 0.05 } }),
    goals: createDefaultGoals(), project: null,
    preferences: { displayBasis: 'nominal', primaryGoalId: 'freedom-capital' },
  };
}
