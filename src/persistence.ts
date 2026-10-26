import { documentSchema, type FinanceDocument } from './schema.js';

export const DEFAULT_STORAGE_KEY = 'financial-freedom-countdown.v1';

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
  return documentSchema.parse(JSON.parse(json));
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
