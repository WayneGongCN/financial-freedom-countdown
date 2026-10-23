import type { ReactNode } from 'react';
import { createDocument, exportDocument, DEFAULT_STORAGE_KEY, type FinanceDocument, type StorageAdapter } from '../src/index';
import { FinanceDocumentProvider } from '../app/hooks/useFinanceDocument';

/** 提供与 Figma 对照场景一致的合成文档，喵~ */
export function fixtureDocument(): FinanceDocument {
  const document = createDocument('2026-10');
  document.plan = { ...document.plan, initialAssets: 600000, inflationRate: 0.03, investmentReturn: { annualRate: 0.08 },
    activeIncome: { amount: 240000, growth: { kind: 'fixed' } }, currentExpenses: { amount: 120000, growth: { kind: 'inflation' } } };
  return document;
}

/** 注入内存存储，测试不读取真实用户数据，喵~ */
export function memoryStorage(document: FinanceDocument | null = fixtureDocument()): StorageAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>();
  if (document) values.set(DEFAULT_STORAGE_KEY, exportDocument(document));
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
}

/** 构造 Hook 测试所需的唯一文档上下文，喵~ */
export function wrapperFor(storage: StorageAdapter = memoryStorage()) {
  /** 提供测试文档状态，喵~ */
  return function Wrapper({ children }: { children: ReactNode }) { return <FinanceDocumentProvider storage={storage}>{children}</FinanceDocumentProvider>; };
}
