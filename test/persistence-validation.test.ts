import { describe, expect, it } from 'vitest';
import {
  clearDocument, createDefaultGoals, createDocument, createPlan, documentSchema, exportDocument,
  importAndSaveDocument, importDocument, loadDocument, metricPreset, metricSchema, planSchema,
  projectSchema, saveDocument, type StorageAdapter,
} from '../src/index.js';
import { flow, plan, project } from './fixtures.js';

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, string>();
  failWrite = false;
  /** 按键读取测试存储，不存在时返回 null，喵~ */
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  /** 模拟原子写入或配额异常，喵~ */
  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error('quota');
    this.values.set(key, value);
  }
  /** 只清除请求的测试键，喵~ */
  removeItem(key: string): void { this.values.delete(key); }
}

describe('运行时接口验证', () => {
  it.each([
    { inflationRate: -1 }, { initialAssets: -1 }, { inflationRate: NaN }, { horizonMonths: 1201 },
    { horizonMonths: 0 }, { baseMonth: '2026-13' }, { currency: 'USD' }, { unexpected: true },
    { initialAssets: '600000' }, { investmentReturn: { annualRate: Infinity } },
  ])('拒绝错误输入 %j', (change) => {
    expect(() => planSchema.parse({ ...plan(), ...change })).toThrow();
  });
  it('缺失与零值分别保存，工资默认不被偷偷联动', () => {
    const p = createPlan('2026-10');
    expect(p.initialAssets).toBeNull();
    expect(p.inflationRate).toBeNull();
    expect(p.investmentReturn).toBeNull();
    expect(p.activeIncome).toBeNull();
    expect(p.externalIncome).toEqual({ amount: 0, growth: { kind: 'fixed' } });
    expect(createPlan('2026-10', { initialAssets: 0 }).initialAssets).toBe(0);
  });
  it.each([
    { startMonth: 2, priceAnchorMonth: 1 },
    { startMonth: 2, endMonth: 1 },
    { startMonth: 2, endMonth: 3 },
    { startMonth: 1201 },
    { amount: -1 },
    { frequency: 'daily' },
  ])('拒绝错误现金流 %j', (change) => {
    expect(() => projectSchema.parse(project({ ...flow(), ...change } as ReturnType<typeof flow>))).toThrow();
  });
  it('拒绝重复现金流 ID 与过量项目行', () => {
    expect(() => projectSchema.parse(project(flow(), flow()))).toThrow('ID');
    expect(() => projectSchema.parse(project(...Array.from({ length: 101 }, (_, i) => flow({ id: `${i}` }))))).toThrow();
  });
  it.each([
    { components: ['investment-total', 'investment-total'] },
    { components: ['active-income', 'active-income'] }, { components: [] },
  ])('拒绝重复入账或空组成 %j', ({ components }) => {
    expect(() => metricSchema.parse({ kind: 'flow', basis: 'nominal', aggregation: 'annualized', components })).toThrow();
  });
  it('购买力调整必须使用实际逐月口径，提取率不能为零', () => {
    expect(() => metricSchema.parse({ kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['inflation-adjustment'] })).toThrow();
    expect(() => metricSchema.parse({ kind: 'flow', basis: 'real', aggregation: 'annualized', components: ['inflation-adjustment'] })).toThrow();
    expect(() => metricSchema.parse({ ...metricPreset('freedom-capital'), withdrawalRate: 0 })).toThrow();
  });
  it('复制预设和目标后修改互不污染', () => {
    const a = metricPreset('passive-total');
    const b = metricPreset('passive-total');
    if (a.kind === 'flow') a.components.pop();
    expect(a).not.toEqual(b);
    const goals = createDefaultGoals();
    goals[0]!.name = '自定义';
    expect(createDefaultGoals()[0]!.name).not.toBe('自定义');
    expect(metricPreset('external-contribution')).toMatchObject({ components: ['active-income', 'external-income', 'expenses'] });
  });
});

describe('版本化本地保存与备份', () => {
  it('完整配置往返保留联动、基准、显示偏好与项目锚点', () => {
    const document = createDocument('2026-10');
    document.plan = plan({ inflationRate: 0.03 });
    document.project = project(flow({ startMonth: 24, priceAnchorMonth: 24, growth: { kind: 'inflation' } }));
    expect(importDocument(exportDocument(document))).toEqual(document);
    const storage = new MemoryStorage();
    expect(loadDocument(storage)).toBeNull();
    saveDocument(storage, document);
    expect(loadDocument(storage)).toEqual(document);
  });
  it('可预览导入内容，只有明确保存才写入指定键', () => {
    const storage = new MemoryStorage();
    const text = exportDocument(createDocument('2026-10'));
    importDocument(text);
    expect(storage.values.size).toBe(0);
    const document = importAndSaveDocument(storage, text, 'custom-key');
    expect(loadDocument(storage, 'custom-key')).toEqual(document);
    expect(loadDocument(storage)).toBeNull();
    storage.setItem('unrelated', 'keep');
    clearDocument(storage, 'custom-key');
    expect(storage.getItem('unrelated')).toBe('keep');
    expect(loadDocument(storage, 'custom-key')).toBeNull();
    saveDocument(storage, document);
    clearDocument(storage);
    expect(loadDocument(storage)).toBeNull();
  });
  it.each([
    { schemaVersion: 99 }, { modelVersion: '99.0.0' }, { unexpected: true },
    { preferences: { displayBasis: 'nominal', primaryGoalId: 'missing' } },
  ])('未知版本或缺失语义不覆盖当前数据 %j', (change) => {
    const storage = new MemoryStorage();
    const document = createDocument('2026-10');
    saveDocument(storage, document);
    const previous = [...storage.values.entries()];
    expect(() => importAndSaveDocument(storage, JSON.stringify({ ...document, ...change }))).toThrow();
    expect([...storage.values.entries()]).toEqual(previous);
  });
  it('损坏 JSON、重复目标与非有限金额被拒绝', () => {
    expect(() => importDocument('{bad')).toThrow();
    const document = createDocument('2026-10');
    document.goals.push(document.goals[0]!);
    expect(() => documentSchema.parse(document)).toThrow('ID');
    const invalid = createDocument('2026-10');
    invalid.plan.initialAssets = Infinity;
    expect(() => exportDocument(invalid)).toThrow();
  });
  it('存储配额失败会抛出，已有方案保持不变', () => {
    const storage = new MemoryStorage();
    const document = createDocument('2026-10');
    saveDocument(storage, document);
    storage.failWrite = true;
    expect(() => saveDocument(storage, createDocument('2026-11'))).toThrow('quota');
    expect(loadDocument(storage)).toEqual(document);
  });
});
