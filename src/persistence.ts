import { z } from 'zod';
import { componentSchema, documentSchema, goalSchema, metricSchema, MODEL_VERSION, planSchema, returnSchema, SCHEMA_VERSION, type FinanceDocument, type MetricSpec } from './schema.js';

export const DEFAULT_STORAGE_KEY = 'financial-freedom-countdown.v1';

export class LegacyReturnConversionError extends Error {
  /** 旧实际收益缺少通胀时保留原始方案，提示用户补齐而不猜测，喵~ */
  constructor() {
    super('旧方案的收益率换算需要通胀参数，请补齐后重新导入。');
    this.name = 'LegacyReturnConversionError';
  }
}

const legacyReturnSchema = z.strictObject({ kind: z.enum(['nominal', 'real']), annualRate: returnSchema.shape.annualRate });
const legacyPlanSchema = planSchema.extend({ investmentReturn: legacyReturnSchema.nullable() });

/** 仅用于校验旧备份中的拆分指标，当前计算模型不再接受这些组成，喵~ */
const legacyFlowSchema = z.strictObject({
  ...metricSchema.options[2].shape,
  components: z.array(z.enum([...componentSchema.options, 'investment-cash', 'investment-price-change'])).min(1).max(7),
}).superRefine((metric, ctx) => {
  const parts = new Set(metric.components);
  if (parts.size !== metric.components.length) ctx.addIssue({ code: 'custom', path: ['components'], message: '组成项不能重复' });
  if (parts.has('investment-total') && (parts.has('investment-cash') || parts.has('investment-price-change'))) {
    ctx.addIssue({ code: 'custom', path: ['components'], message: '总收益不能与拆分收益重复相加' });
  }
});
const legacyMetricSchema = z.union([metricSchema, legacyFlowSchema]);
const legacyGoalSchema = goalSchema.extend({
  left: legacyMetricSchema,
  right: z.discriminatedUnion('kind', [goalSchema.shape.right.options[0].extend({ metric: legacyMetricSchema }), goalSchema.shape.right.options[1]]),
});
const legacyDocumentSchema = z.strictObject({
  ...documentSchema.shape,
  schemaVersion: z.literal(1), modelVersion: z.literal('1.0.0'),
  plan: legacyPlanSchema.extend({ cashYield: z.number().finite().min(0).nullable() }),
  goals: z.array(legacyGoalSchema).max(100),
});
const legacyV2DocumentSchema = z.strictObject({
  ...documentSchema.shape,
  schemaVersion: z.literal(2), modelVersion: z.literal('2.0.0'), plan: legacyPlanSchema,
});

/** 旧组成已校验后统一为总收益，合并原本互补的两种拆分，喵~ */
function migrateMetric(metric: z.infer<typeof legacyMetricSchema>): MetricSpec {
  return metric.kind === 'flow' ? { ...metric, components: [...new Set(metric.components.map((part) =>
    part === 'investment-cash' || part === 'investment-price-change' ? 'investment-total' : part))] } : metric;
}

/** 旧实际收益只在导入时换算一次，当前模型始终接收未扣通胀的收益，喵~ */
function migrateLegacyReturn(assumption: z.infer<typeof legacyReturnSchema> | null, inflationRate: number | null) {
  if (assumption === null) return null;
  if (assumption.kind === 'nominal') return { annualRate: assumption.annualRate };
  if (inflationRate === null) throw new LegacyReturnConversionError();
  return returnSchema.parse({ annualRate: (1 + assumption.annualRate) * (1 + inflationRate) - 1 });
}

/** 完整验证其余配置后升级收益口径，不写回存储或重新创建方案，喵~ */
function migrateLegacyDocument(legacy: Omit<z.infer<typeof legacyV2DocumentSchema>, 'schemaVersion' | 'modelVersion'>): FinanceDocument {
  const current = documentSchema.parse({ ...legacy, schemaVersion: SCHEMA_VERSION, modelVersion: MODEL_VERSION,
    plan: { ...legacy.plan, investmentReturn: null } });
  return { ...current, plan: { ...current.plan,
    investmentReturn: migrateLegacyReturn(legacy.plan.investmentReturn, legacy.plan.inflationRate) } };
}

export interface StorageAdapter {
  /**
   * 读取指定键的原始 JSON；不存在时返回 null，存储异常直接抛出，喵~
   * @param key 当前应用的独立存储键，喵~
   */
  getItem(key: string): string | null;
  /**
   * 原子替换指定键；失败时抛出异常，保持已有值，喵~
   * @param key 当前应用的独立存储键，喵~
   * @param value 已校验的序列化文档，喵~
   */
  setItem(key: string, value: string): void;
  /**
   * 只删除指定应用键，不清空其他应用的数据，喵~
   * @param key 当前应用的独立存储键，喵~
   */
  removeItem(key: string): void;
}

/** 校验版本和完整语义后导出配置，不保存派生结果缓存，喵~ */
export function exportDocument(document: FinanceDocument): string {
  return JSON.stringify(documentSchema.parse(document), null, 2);
}

/** 解析不可信备份，拒绝未知版本或不完整口径且不触碰存储，喵~ */
export function importDocument(json: string): FinanceDocument {
  const value: unknown = JSON.parse(json);
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value && 'modelVersion' in value) {
    if (value.schemaVersion === 1 && value.modelVersion === '1.0.0') {
      const legacy = legacyDocumentSchema.parse(value);
      const { cashYield: _cashYield, ...plan } = legacy.plan;
      return migrateLegacyDocument({ ...legacy, plan,
        goals: legacy.goals.map((goal) => ({ ...goal, left: migrateMetric(goal.left),
          right: goal.right.kind === 'metric' ? { ...goal.right, metric: migrateMetric(goal.right.metric) } : goal.right })) });
    }
    if (value.schemaVersion === 2 && value.modelVersion === '2.0.0') return migrateLegacyDocument(legacyV2DocumentSchema.parse(value));
  }
  return documentSchema.parse(value);
}

/** 在任何存储写入前完成校验，异常不被吞掉，喵~ */
export function saveDocument(storage: StorageAdapter, document: FinanceDocument, key = DEFAULT_STORAGE_KEY): void {
  const json = exportDocument(document);
  storage.setItem(key, json);
}

/** 读取当前方案并保留原始基准月份，不随系统日期静默迁移，喵~ */
export function loadDocument(storage: StorageAdapter, key = DEFAULT_STORAGE_KEY): FinanceDocument | null {
  const value = storage.getItem(key);
  return value === null ? null : importDocument(value);
}

/** 确认导入后才调用此操作，验证失败不覆盖已有方案，喵~ */
export function importAndSaveDocument(storage: StorageAdapter, json: string, key = DEFAULT_STORAGE_KEY): FinanceDocument {
  const document = importDocument(json);
  saveDocument(storage, document, key);
  return document;
}

/** 清除本应用保存的方案，不触碰其他键，喵~ */
export function clearDocument(storage: StorageAdapter, key = DEFAULT_STORAGE_KEY): void {
  storage.removeItem(key);
}
