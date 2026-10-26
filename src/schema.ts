import { z } from 'zod';

export const SCHEMA_VERSION = 3 as const;
export const MODEL_VERSION = '3.0.0' as const;
export const MAX_MONTHS = 1200;

const amount = z.number().finite().min(0);
const rate = z.number().finite().gt(-1);
const month = z.number().int().min(0).max(MAX_MONTHS);
const id = z.string().trim().min(1).max(100);

export const growthSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('fixed') }),
  z.strictObject({ kind: z.literal('inflation') }),
  z.strictObject({ kind: z.literal('custom'), annualRate: rate }),
]);
export const annualFlowSchema = z.strictObject({ amount, growth: growthSchema });
export const incomeStageSchema = annualFlowSchema.extend({
  durationMonths: z.number().int().min(1).max(MAX_MONTHS).nullable(),
});
export const incomeScheduleSchema = z.array(incomeStageSchema).min(1).superRefine((stages, ctx) => {
  stages.slice(0, -1).forEach((stage, index) => {
    if (stage.durationMonths === null) ctx.addIssue({ code: 'custom', path: [index, 'durationMonths'], message: '只有最后一个收入阶段可以不限期' });
  });
});
export const returnSchema = z.strictObject({
  annualRate: rate,
});

export const planSchema = z.strictObject({
  baseMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  currency: z.literal('CNY'),
  initialAssets: amount.nullable(),
  inflationRate: rate.nullable(),
  investmentReturn: returnSchema.nullable(),
  activeIncome: incomeScheduleSchema.nullable(),
  currentExpenses: annualFlowSchema.nullable(),
  externalIncome: annualFlowSchema.nullable(),
  retirementBudget: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('current') }),
    z.strictObject({ kind: z.literal('custom'), flow: annualFlowSchema }),
  ]),
  horizonMonths: z.number().int().min(1).max(MAX_MONTHS),
});

export const cashFlowSchema = z.strictObject({
  id,
  kind: z.enum(['expense', 'active-income', 'passive-income', 'expense-saving']),
  amount,
  growth: growthSchema,
  priceAnchorMonth: month,
  startMonth: month,
  endMonth: month.nullable(),
  frequency: z.enum(['once', 'monthly', 'yearly']),
  continuesAfterFreedom: z.boolean(),
}).superRefine((flow, ctx) => {
  if (flow.priceAnchorMonth !== 0 && flow.priceAnchorMonth !== flow.startMonth) {
    ctx.addIssue({ code: 'custom', path: ['priceAnchorMonth'], message: '价格锚点必须为基准月或首次发生月份' });
  }
  if (flow.endMonth !== null && flow.endMonth < flow.startMonth) {
    ctx.addIssue({ code: 'custom', path: ['endMonth'], message: '结束月份不能早于开始月份' });
  }
  if (flow.frequency === 'once' && flow.endMonth !== null && flow.endMonth !== flow.startMonth) {
    ctx.addIssue({ code: 'custom', path: ['endMonth'], message: '一次性现金流不能拥有持续期限' });
  }
});
export const projectSchema = z.strictObject({
  id,
  name: z.string().trim().min(1).max(200),
  notes: z.string().max(5000),
  cashFlows: z.array(cashFlowSchema).max(100),
}).superRefine((project, ctx) => {
  if (new Set(project.cashFlows.map((flow) => flow.id)).size !== project.cashFlows.length) {
    ctx.addIssue({ code: 'custom', path: ['cashFlows'], message: '现金流 ID 必须唯一' });
  }
});

export const basisSchema = z.enum(['nominal', 'real']);
export const componentSchema = z.enum([
  'active-income', 'external-income', 'investment-total', 'expenses', 'inflation-adjustment',
]);
export const metricSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('assets'), basis: basisSchema }),
  z.strictObject({ kind: z.literal('asset-growth'), basis: basisSchema }),
  z.strictObject({
    kind: z.literal('flow'),
    basis: basisSchema,
    aggregation: z.enum(['annualized', 'next-12-months']),
    components: z.array(componentSchema).min(1).max(5),
  }).superRefine((metric, ctx) => {
    const parts = new Set(metric.components);
    if (parts.size !== metric.components.length) {
      ctx.addIssue({ code: 'custom', path: ['components'], message: '组成项不能重复' });
    }
    if (parts.has('inflation-adjustment') && (metric.basis !== 'real' || metric.aggregation !== 'next-12-months')) {
      ctx.addIssue({ code: 'custom', path: ['components'], message: '购买力调整仅适用于逐月实际流量口径' });
    }
  }),
  z.strictObject({
    kind: z.literal('required-capital'),
    basis: basisSchema,
    withdrawalRate: z.number().finite().gt(0).max(1),
    deductExternalIncome: z.boolean(),
    includeReserve: z.boolean(),
  }),
]);

export const goalSchema = z.strictObject({
  id,
  name: z.string().trim().min(1).max(200),
  left: metricSchema,
  right: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('metric'), metric: metricSchema }),
    z.strictObject({ kind: z.literal('amount'), amount, unit: z.enum(['capital', 'annual-flow']), basis: basisSchema }),
  ]),
  ratio: z.number().finite().gt(0),
  comparison: z.enum(['scenario', 'baseline']),
});

export const documentSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  modelVersion: z.literal(MODEL_VERSION),
  plan: planSchema,
  goals: z.array(goalSchema).max(100),
  project: projectSchema.nullable(),
  preferences: z.strictObject({ displayBasis: basisSchema, primaryGoalId: id.nullable() }),
}).superRefine((document, ctx) => {
  const ids = new Set(document.goals.map((goal) => goal.id));
  if (ids.size !== document.goals.length) {
    ctx.addIssue({ code: 'custom', path: ['goals'], message: '目标 ID 必须唯一' });
  }
  if (document.preferences.primaryGoalId !== null && !ids.has(document.preferences.primaryGoalId)) {
    ctx.addIssue({ code: 'custom', path: ['preferences', 'primaryGoalId'], message: '主目标必须存在' });
  }
});

export type Growth = z.infer<typeof growthSchema>;
export type AnnualFlow = z.infer<typeof annualFlowSchema>;
export type IncomeStage = z.infer<typeof incomeStageSchema>;
export type ReturnAssumption = z.infer<typeof returnSchema>;
export type Plan = z.infer<typeof planSchema>;
export type CashFlow = z.infer<typeof cashFlowSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Basis = z.infer<typeof basisSchema>;
export type Component = z.infer<typeof componentSchema>;
export type MetricSpec = z.infer<typeof metricSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type FinanceDocument = z.infer<typeof documentSchema>;
