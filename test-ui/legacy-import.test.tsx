import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFinanceDocument } from '../app/hooks/useFinanceDocument';
import { DEFAULT_STORAGE_KEY } from '../src/index';
import { fixtureDocument, memoryStorage, wrapperFor } from './fixtures';

/** 构造版本一备份，仅在兼容性测试中保留已淘汰的输入结构，喵~ */
function legacyBackup() {
  const document = fixtureDocument();
  return JSON.stringify({ ...document, schemaVersion: 1, modelVersion: '1.0.0',
    plan: { ...document.plan, cashYield: 0.02, investmentReturn: { kind: 'nominal', annualRate: 0.08 } },
    goals: document.goals.map((goal, index) => index < 2 ? { ...goal,
      left: { kind: 'flow', basis: 'nominal', aggregation: 'next-12-months', components: ['investment-cash', 'external-income'] } } : goal) });
}

describe('旧版方案升级的界面状态', () => {
  it('读取升级显示新口径提示，保留原始存档直到明确保存', () => {
    const storage = memoryStorage(null);
    const original = legacyBackup();
    storage.values.set(DEFAULT_STORAGE_KEY, original);
    const write = vi.spyOn(storage, 'setItem');
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(storage) });
    expect(result.current.blocked).toBe(false);
    expect(result.current.notice).toContain('被动收入统一按投资总收益与其他被动收入合计测算');
    expect(result.current.document.schemaVersion).toBe(3);
    expect(result.current.document.plan).toEqual(fixtureDocument().plan);
    expect(result.current.document.goals[0]!.left).toMatchObject({ components: ['investment-total', 'external-income'] });
    expect(write).not.toHaveBeenCalled();
    expect(storage.values.get(DEFAULT_STORAGE_KEY)).toBe(original);
    act(() => { expect(result.current.commit(result.current.document)).toBeNull(); });
    expect(JSON.parse(storage.values.get(DEFAULT_STORAGE_KEY)!)).toEqual(result.current.document);
  });

  it('导入升级后提示新口径，重新开始清除提示且保持新模型', () => {
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor() });
    expect(result.current.notice).toBeNull();
    act(() => { expect(result.current.importBackup(legacyBackup())).toBeNull(); });
    expect(result.current.notice).toContain('方案已升级');
    act(() => result.current.reset());
    expect(result.current.notice).toBeNull();
    expect(result.current.document.schemaVersion).toBe(3);
    expect(result.current.document.modelVersion).toBe('3.0.0');
  });

  it('旧实际收益率缺少通胀时明确说明原因，加载和失败导入都不覆盖原档', () => {
    const document = fixtureDocument();
    const original = JSON.stringify({ ...document, schemaVersion: 2, modelVersion: '2.0.0',
      plan: { ...document.plan, inflationRate: null, investmentReturn: { kind: 'real', annualRate: 0.05 } } });
    const storage = memoryStorage(null);
    storage.values.set(DEFAULT_STORAGE_KEY, original);
    const write = vi.spyOn(storage, 'setItem');
    const { result } = renderHook(() => useFinanceDocument(), { wrapper: wrapperFor(storage) });
    expect(result.current.blocked).toBe(true);
    expect(result.current.error).toContain('收益率换算需要通胀参数');
    act(() => { expect(result.current.importBackup(original)).toContain('收益率换算需要通胀参数'); });
    expect(write).not.toHaveBeenCalled();
    expect(storage.values.get(DEFAULT_STORAGE_KEY)).toBe(original);
  });
});
