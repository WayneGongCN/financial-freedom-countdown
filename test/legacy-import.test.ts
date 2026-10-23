import { describe, expect, it, vi } from 'vitest';
import {
  calculateMilestones, createDocument, DEFAULT_STORAGE_KEY, exportDocument, importAndSaveDocument, importDocument, LegacyReturnConversionError,
  loadDocument, saveDocument, type StorageAdapter,
} from '../src/index.js';

/** 保留真实 v1 必填字段和默认现金口径，测试不依赖当前默认指标，喵~ */
function legacyDocument() {
  const document = createDocument('2026-10');
  return { ...document, schemaVersion: 1, modelVersion: '1.0.0',
    plan: { ...document.plan, cashYield: 0.02, initialAssets: 600000,
      investmentReturn: { kind: 'nominal', annualRate: 0.08 },
      activeIncome: { amount: 240000, growth: { kind: 'fixed' } },
      currentExpenses: { amount: 120000, growth: { kind: 'inflation' } } },
    goals: document.goals.map((goal, index) => index < 2 ? { ...goal,
      left: { kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['investment-cash', 'external-income'] } } : goal),
  };
}

/** v2 已删除拆分组成，但收益假设仍保存名义/实际种类，喵~ */
function legacyV2Document() {
  const legacy = legacyDocument();
  const { cashYield: _cashYield, ...plan } = legacy.plan;
  return { ...legacy, schemaVersion: 2, modelVersion: '2.0.0', plan, goals: createDocument('2026-10').goals };
}

/** 用可观察写入的内存存储，区分读取升级与用户主动保存，喵~ */
function memoryStorage(json: string) {
  const values = new Map([[DEFAULT_STORAGE_KEY, json], ['unrelated', 'keep']]);
  const storage: StorageAdapter = {
    getItem: (key) => values.get(key) ?? null,
    setItem: vi.fn((key, value) => { values.set(key, value); }),
    removeItem: vi.fn((key) => { values.delete(key); }),
  };
  return { values, storage };
}

describe('v1 存档在导入边界升级', () => {
  it('真实旧默认现金目标与必填现金收益字段可读取为当前总收益目标', () => {
    const legacy = legacyDocument();
    const imported = importDocument(JSON.stringify(legacy));
    expect(imported).toMatchObject({ schemaVersion: 3, modelVersion: '3.0.0' });
    expect(imported.plan).not.toHaveProperty('cashYield');
    expect(imported.plan.baseMonth).toBe('2026-10');
    expect(imported.goals.slice(0, 2).map((goal) => goal.left)).toEqual([
      { kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['investment-total', 'external-income'] },
      { kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['investment-total', 'external-income'] },
    ]);
    expect(imported.goals.map((goal) => goal.id)).toEqual(legacy.goals.map((goal) => goal.id));
    expect(imported.preferences).toEqual(legacy.preferences);
  });

  it('旧版明确缺失的收益与通胀仍保留为缺失，不替用户补假设', () => {
    const legacy = legacyDocument();
    const imported = importDocument(JSON.stringify({ ...legacy,
      plan: { ...legacy.plan, cashYield: null, investmentReturn: null, inflationRate: null },
    }));
    expect(imported.plan.investmentReturn).toBeNull();
    expect(imported.plan.inflationRate).toBeNull();
    expect(imported.plan).not.toHaveProperty('cashYield');
  });

  it('左右指标都迁移，现金与价格收益合并一次，其他配置无损', () => {
    const legacy = legacyDocument();
    const configured = { ...legacy, plan: { ...legacy.plan, baseMonth: '2024-02', horizonMonths: 600 },
      project: { id: 'trip', name: '假期', notes: '保留项目', cashFlows: [] },
      goals: [{ id: 'custom', name: '自定义目标', ratio: 1.5, comparison: 'baseline',
        left: { kind: 'flow', basis: 'real', aggregation: 'annualized',
          components: ['active-income', 'investment-cash', 'external-income', 'investment-price-change', 'expenses'] },
        right: { kind: 'metric', metric: { kind: 'flow', basis: 'real', aggregation: 'annualized',
          components: ['investment-price-change', 'investment-cash', 'external-income'] } } },
      { id: 'amount', name: '金额目标', ratio: 2, comparison: 'scenario',
        left: { kind: 'assets', basis: 'nominal' },
        right: { kind: 'amount', amount: 1234567, unit: 'capital', basis: 'real' } }],
      preferences: { displayBasis: 'nominal', primaryGoalId: 'custom' },
    };
    const imported = importDocument(JSON.stringify(configured));
    const { cashYield: _cashYield, ...expectedPlan } = configured.plan;
    expect(imported).toEqual({ ...configured, schemaVersion: 3, modelVersion: '3.0.0',
      plan: { ...expectedPlan, investmentReturn: { annualRate: 0.08 } },
      goals: [{ ...configured.goals[0],
        left: { kind: 'flow', basis: 'real', aggregation: 'annualized',
          components: ['active-income', 'investment-total', 'external-income', 'expenses'] },
        right: { kind: 'metric', metric: { kind: 'flow', basis: 'real', aggregation: 'annualized',
          components: ['investment-total', 'external-income'] } } }, configured.goals[1]],
    });
  });

  it.each([-0.01, '0.02', false, {}, undefined])('丢弃字段前拒绝非法旧现金收益率 %j', (cashYield) => {
    const legacy = legacyDocument();
    expect(() => importDocument(JSON.stringify({ ...legacy, plan: { ...legacy.plan, cashYield } }))).toThrow();
  });

  it.each([
    ['investment-cash', 'investment-cash'], ['investment-price-change', 'investment-price-change'],
    ['investment-total', 'investment-cash'], ['investment-total', 'investment-price-change'],
    ['investment-total', 'investment-cash', 'investment-price-change'], [], ['unknown'],
  ])('映射前拒绝重复、重复计总收益或无效组成 %j', (...components) => {
    const legacy = legacyDocument();
    const goal = legacy.goals[0]!;
    expect(() => importDocument(JSON.stringify({ ...legacy,
      goals: [{ ...goal, left: { ...goal.left, components } }],
      preferences: { ...legacy.preferences, primaryGoalId: goal.id },
    }))).toThrow();
  });

  it('严格校验原始旧字段、指标口径、目标引用和唯一 ID', () => {
    const legacy = legacyDocument();
    expect(() => importDocument(JSON.stringify({ ...legacy, plan: { ...legacy.plan, ignored: true } }))).toThrow();
    expect(() => importDocument(JSON.stringify({ ...legacy, goals: [...legacy.goals, legacy.goals[0]] }))).toThrow('ID');
    expect(() => importDocument(JSON.stringify({ ...legacy, preferences: { ...legacy.preferences, primaryGoalId: 'missing' } }))).toThrow();
    const goal = legacy.goals[0]!;
    expect(() => importDocument(JSON.stringify({ ...legacy,
      goals: [{ ...goal, left: { kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['investment-cash', 'inflation-adjustment'] } }],
      preferences: { ...legacy.preferences, primaryGoalId: goal.id },
    }))).toThrow();
  });

  it('v3 严格拒绝旧字段、收益种类和旧组成，不会为混合版本开启兼容分支', () => {
    const document = createDocument('2026-10');
    expect(() => importDocument(JSON.stringify({ ...document, plan: { ...document.plan, cashYield: 0.02 } }))).toThrow();
    expect(() => importDocument(JSON.stringify({ ...document,
      plan: { ...document.plan, investmentReturn: { kind: 'nominal', annualRate: 0.08 } },
    }))).toThrow();
    for (const component of ['investment-cash', 'investment-price-change']) {
      expect(() => importDocument(JSON.stringify({ ...document, goals: [{ ...document.goals[0],
        left: { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: [component] } }],
        preferences: { ...document.preferences, primaryGoalId: document.goals[0]!.id },
      }))).toThrow();
    }
    for (const version of [{ schemaVersion: 1, modelVersion: '2.0.0' }, { schemaVersion: 2, modelVersion: '1.0.0' },
      { schemaVersion: 3, modelVersion: '2.0.0' }, { schemaVersion: 2, modelVersion: '3.0.0' },
      { schemaVersion: 99, modelVersion: '99.0.0' }]) {
      expect(() => importDocument(JSON.stringify({ ...legacyDocument(), ...version }))).toThrow();
    }
  });

  it('load 只在内存升级，主动保存仍写入原存储键且只导出新字段', () => {
    const original = JSON.stringify(legacyDocument());
    const { storage, values } = memoryStorage(original);
    const imported = loadDocument(storage)!;
    expect(imported.schemaVersion).toBe(3);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(values.get(DEFAULT_STORAGE_KEY)).toBe(original);
    const exported = exportDocument(imported);
    expect(exported).not.toMatch(/cashYield|investment-cash|investment-price-change/);
    expect(JSON.parse(exported).plan.investmentReturn).toEqual({ annualRate: 0.08 });
    expect(JSON.parse(exported)).toEqual(imported);
    expect(DEFAULT_STORAGE_KEY).toBe('financial-freedom-countdown.v1');
    saveDocument(storage, imported);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(DEFAULT_STORAGE_KEY, exported);
    expect([...values.keys()]).toEqual([DEFAULT_STORAGE_KEY, 'unrelated']);
    expect(values.get('unrelated')).toBe('keep');
  });

  it('旧备份导入失败保持已有原文，明确导入保存后才写当前版本', () => {
    const original = exportDocument(createDocument('2026-09'));
    const { storage, values } = memoryStorage(original);
    const legacy = legacyDocument();
    expect(() => importAndSaveDocument(storage, JSON.stringify({ ...legacy, plan: { ...legacy.plan, cashYield: -1 } }))).toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.get(DEFAULT_STORAGE_KEY)).toBe(original);
    const imported = importAndSaveDocument(storage, JSON.stringify(legacy));
    expect(imported.schemaVersion).toBe(3);
    expect(loadDocument(storage)).toEqual(imported);
    expect(values.get(DEFAULT_STORAGE_KEY)).not.toMatch(/cashYield|investment-cash|investment-price-change/);
    expect(values.get('unrelated')).toBe('keep');
  });
});

describe('v1/v2 收益假设升级为未扣通胀收益', () => {
  it.each([1, 2])('v%i 名义收益原值保留，缺少通胀也不影响转换', (version) => {
    const legacy = version === 1 ? legacyDocument() : legacyV2Document();
    const imported = importDocument(JSON.stringify({ ...legacy,
      plan: { ...legacy.plan, inflationRate: null, investmentReturn: { kind: 'nominal', annualRate: -0.05 } },
    }));
    expect(imported).toMatchObject({ schemaVersion: 3, modelVersion: '3.0.0' });
    expect(imported.plan.investmentReturn).toEqual({ annualRate: -0.05 });
    expect(imported.plan.inflationRate).toBeNull();
  });

  it.each([
    [1, 0.05, 0.03, 0.0815], [1, 0.05, -0.02, 0.029],
    [2, 0.05, 0.03, 0.0815], [2, 0.05, -0.02, 0.029],
    [2, -0.05, 0.03, -0.0215], [2, -0.05, -0.02, -0.069],
    [2, 0.05, 0, 0.05],
  ])('v%i 实际收益 %s 与通胀 %s 换算为 %s', (version, annualRate, inflationRate, expected) => {
    const legacy = version === 1 ? legacyDocument() : legacyV2Document();
    const imported = importDocument(JSON.stringify({ ...legacy,
      plan: { ...legacy.plan, inflationRate, investmentReturn: { kind: 'real', annualRate } },
    }));
    expect(imported.plan.investmentReturn?.annualRate).toBeCloseTo(expected!, 14);
    expect(imported.plan.investmentReturn).not.toHaveProperty('kind');
    expect(imported.plan.inflationRate).toBe(inflationRate);
    expect(imported.plan.baseMonth).toBe(legacy.plan.baseMonth);
  });

  it.each([1, 2])('v%i 空收益假设仍为空，不依赖通胀', (version) => {
    const legacy = version === 1 ? legacyDocument() : legacyV2Document();
    const imported = importDocument(JSON.stringify({ ...legacy,
      plan: { ...legacy.plan, inflationRate: null, investmentReturn: null },
    }));
    expect(imported.plan.investmentReturn).toBeNull();
    expect(imported.plan.inflationRate).toBeNull();
  });

  it.each([1, 2])('v%i 实际收益缺少通胀时给出专用中文原因，读取或导入均不覆盖原文', (version) => {
    const legacy = version === 1 ? legacyDocument() : legacyV2Document();
    const original = JSON.stringify({ ...legacy,
      plan: { ...legacy.plan, inflationRate: null, investmentReturn: { kind: 'real', annualRate: 0.05 } },
    });
    const { storage, values } = memoryStorage(original);
    expect(() => loadDocument(storage)).toThrow(LegacyReturnConversionError);
    expect(() => importAndSaveDocument(storage, original)).toThrow('旧方案的收益率换算需要通胀参数，请补齐后重新导入。');
    expect(values.get(DEFAULT_STORAGE_KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'unknown', annualRate: 0.05 }, { kind: 'nominal', annualRate: -1 },
    { kind: 'real', annualRate: '0.05' }, { annualRate: 0.05 },
    { kind: 'real', annualRate: 0.05, extra: true },
  ])('丢弃收益种类前拒绝非法旧收益结构 %j', (investmentReturn) => {
    const legacy = legacyV2Document();
    expect(() => importDocument(JSON.stringify({ ...legacy, plan: { ...legacy.plan, investmentReturn } }))).toThrow();
  });

  it.each([
    [Number.MAX_VALUE, Number.MAX_VALUE], [-0.9999999999999999, -0.9999999999999999],
  ])('拒绝换算后溢出或不再大于 -100%% 的收益（%s，通胀 %s）', (annualRate, inflationRate) => {
    const legacy = legacyV2Document();
    const original = JSON.stringify({ ...legacy,
      plan: { ...legacy.plan, inflationRate, investmentReturn: { kind: 'real', annualRate } },
    });
    const { storage, values } = memoryStorage(original);
    expect(() => importAndSaveDocument(storage, original)).toThrow();
    expect(values.get(DEFAULT_STORAGE_KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('v2 不能借收益兼容分支接收已删除的现金字段或拆分组成', () => {
    const legacy = legacyV2Document();
    expect(() => importDocument(JSON.stringify({ ...legacy, plan: { ...legacy.plan, cashYield: 0.02 } }))).toThrow();
    expect(() => importDocument(JSON.stringify({ ...legacy,
      goals: [{ ...legacy.goals[0], left: { kind: 'flow', basis: 'nominal', aggregation: 'annualized', components: ['investment-cash'] } }],
      preferences: { ...legacy.preferences, primaryGoalId: legacy.goals[0]!.id },
    }))).toThrow();
  });

  it.each([0.03, -0.02])('v2 实际收益在通胀 %s 下保留年末资产及达成月，保存重读不二次换算', (inflationRate) => {
    const legacy = legacyV2Document();
    const imported = importDocument(JSON.stringify({ ...legacy,
      plan: { ...legacy.plan, initialAssets: 1000000, inflationRate, investmentReturn: { kind: 'real', annualRate: 0.05 },
        activeIncome: { amount: 0, growth: { kind: 'fixed' } }, currentExpenses: { amount: 0, growth: { kind: 'fixed' } } },
      goals: [{ id: 'double', name: '资产翻倍', left: { kind: 'assets', basis: 'nominal' },
        right: { kind: 'amount', amount: 2000000, unit: 'capital', basis: 'nominal' }, ratio: 1, comparison: 'scenario' }],
      preferences: { displayBasis: 'real', primaryGoalId: 'double' },
    }));
    const result = calculateMilestones(imported.plan, imported.goals);
    const annualFactor = 1.05 * (1 + inflationRate);
    expect(result.projection.rows[12]!.assets).toBeCloseTo(1000000 * annualFactor, 6);
    expect(result.goals[0]!.firstMonth).toBe(Math.ceil(12 * Math.log(2) / Math.log(annualFactor)));
    const restored = importDocument(exportDocument(imported));
    expect(restored).toEqual(imported);
    expect(calculateMilestones(restored.plan, restored.goals).goals[0]!.firstMonth).toBe(result.goals[0]!.firstMonth);
  });
});
