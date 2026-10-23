import { describe, expect, it } from 'vitest';
import { createDocument, createPlan, METRIC_PRESET_NAMES, metricPreset, returnSchema } from '../src/index.js';

describe('新方案默认假设', () => {
  it('新文档明确不计通胀并使用名义金额', () => {
    const document = createDocument('2026-10');
    expect(document.schemaVersion).toBe(3);
    expect(document.modelVersion).toBe('3.0.0');
    expect(document.plan.inflationRate).toBe(0);
    expect(document.preferences.displayBasis).toBe('nominal');
    expect(document.plan.investmentReturn).toBeNull();
    expect(document.plan.activeIncome).toBeNull();
    expect(document.plan.currentExpenses).toBeNull();
  });

  it('直接创建核心计划时继续保留未填写通胀的状态', () => {
    expect(createPlan('2026-10').inflationRate).toBeNull();
  });

  it('收益假设仅包含未扣通胀的年化总收益率，不接受输入口径', () => {
    expect(returnSchema.parse({ annualRate: 0.08 })).toEqual({ annualRate: 0.08 });
    expect(returnSchema.parse({ annualRate: 0 })).toEqual({ annualRate: 0 });
    expect(returnSchema.parse({ annualRate: -0.1 })).toEqual({ annualRate: -0.1 });
    for (const kind of ['nominal', 'real']) expect(returnSchema.safeParse({ kind, annualRate: 0.08 }).success).toBe(false);
    for (const annualRate of [-1, Infinity, NaN]) expect(returnSchema.safeParse({ annualRate }).success).toBe(false);
  });

  it('总收益预设和默认被动目标使用唯一的总收益组成', () => {
    expect(METRIC_PRESET_NAMES['investment-total']).toBe('投资总收益');
    expect(METRIC_PRESET_NAMES['passive-total']).toBe('总被动收入');
    expect(metricPreset('investment-total')).toEqual({ kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['investment-total'] });
    expect(metricPreset('passive-total')).toEqual({ kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['investment-total', 'external-income'] });
    expect(createDocument('2026-10').goals.slice(0, 2).map((goal) => goal.left)).toEqual([metricPreset('passive-total'), metricPreset('passive-total')]);
  });
});
