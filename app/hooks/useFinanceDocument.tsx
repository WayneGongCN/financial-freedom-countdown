import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { createDocument, DEFAULT_STORAGE_KEY, documentSchema, exportDocument, importDocument, LegacyReturnConversionError, saveDocument, type FinanceDocument, type StorageAdapter } from '../../src/index';

interface DocumentState { document: FinanceDocument; error: string | null; notice: string | null; blocked: boolean; revision: number; savedRevision: number }
type Event = { type: 'commit'; document: FinanceDocument; recover?: boolean; notice?: string | null } | { type: 'saved'; revision: number } | { type: 'failed'; error: string } | { type: 'retry' };
export interface DocumentApi extends DocumentState {
  /**
   * 原子提交经过完整校验的文档，校验失败返回中文提示且不修改正式方案，喵~
   * @param document 新的完整文档，喵~
   */
  commit: (document: FinanceDocument) => string | null;
  /** 重试保存当前内存中的正式方案，喵~ */
  retrySave: () => void;
  /**
   * 读取并替换导入的文档，失败保留原始方案并返回提示，喵~
   * @param json 用户明确选择导入的备份，喵~
   */
  importBackup: (json: string) => string | null;
  /** 导出当前内存中的正式方案，喵~ */
  exportBackup: () => string;
  /** 用户选择重新开始后替换损坏数据，喵~ */
  reset: () => void;
}
const Context = createContext<DocumentApi | null>(null);

/** 用本地年月创建新文档，已有方案的基准月份不会被更新，喵~ */
function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** 仅在已通过校验的备份升级后说明当前口径，避免用户误解旧目标的新预测，喵~ */
function upgradeNotice(json: string, document: FinanceDocument): string | null {
  const source = JSON.parse(json) as { schemaVersion: number; modelVersion: string };
  return source.schemaVersion !== document.schemaVersion || source.modelVersion !== document.modelVersion
    ? '方案已升级：被动收入统一按投资总收益与其他被动收入合计测算，收益率统一为未扣通胀的年化总收益率。' : null;
}

/** 初始化读取失败时阻止自动写入，保护用户原始存档，喵~ */
function initialize(storage: StorageAdapter): DocumentState {
  try {
    const json = storage.getItem(DEFAULT_STORAGE_KEY);
    const document = json === null ? createDocument(currentMonth()) : importDocument(json);
    return { document, notice: json === null ? null : upgradeNotice(json, document), error: null, blocked: false, revision: 0, savedRevision: 0 };
  }
  catch (error) { return { document: createDocument(currentMonth()), notice: null,
    error: error instanceof LegacyReturnConversionError ? `${error.message}原始数据已保留。` : '无法读取已保存的方案。原始数据已保留，可导入备份或选择重新开始。', blocked: true, revision: 0, savedRevision: 0 }; }
}

/** 集中管理文档提交和保存状态，喵~ */
function reducer(state: DocumentState, event: Event): DocumentState {
  if (event.type === 'commit') {
    const document = { ...event.document };
    for (const key of ['plan', 'goals', 'project'] as const) {
      if (JSON.stringify(document[key]) === JSON.stringify(state.document[key])) Object.assign(document, { [key]: state.document[key] });
    }
    return { ...state, document, revision: state.revision + 1, notice: event.notice === undefined ? state.notice : event.notice, blocked: event.recover ? false : state.blocked, error: event.recover ? null : state.error };
  }
  if (event.type === 'saved') return { ...state, savedRevision: event.revision, error: null };
  if (event.type === 'failed') return { ...state, error: event.error };
  return { ...state, revision: state.revision + 1 };
}

/** 持有唯一正式文档和存储副作用，不保存派生财务结果，喵~ */
export function FinanceDocumentProvider({ children, storage }: { children: ReactNode; storage: StorageAdapter }) {
  const [state, dispatch] = useReducer(reducer, storage, initialize);
  /** 仅在有效提交后保存，损坏存档不会被空文档自动覆盖，喵~ */
  useEffect(() => {
    if (state.blocked || state.revision === state.savedRevision) return;
    try { saveDocument(storage, state.document); dispatch({ type: 'saved', revision: state.revision }); }
    catch { dispatch({ type: 'failed', error: '保存失败，修改仍保留在本次会话中。请重试或导出备份。' }); }
  }, [storage, state.blocked, state.document, state.revision, state.savedRevision]);
  const commit = useCallback((document: FinanceDocument) => {
    const parsed = documentSchema.safeParse(document);
    if (!parsed.success) return '方案不完整或目标数量超过上限，请检查输入。';
    dispatch({ type: 'commit', document: parsed.data }); return null;
  }, []);
  const importBackup = useCallback((json: string) => {
    try { const document = importDocument(json); dispatch({ type: 'commit', document, notice: upgradeNotice(json, document), recover: true }); return null; }
    catch (error) { return error instanceof LegacyReturnConversionError ? error.message : '备份格式、模型版本或数据内容不受支持，原方案未改变。'; }
  }, []);
  const value = useMemo<DocumentApi>(() => ({ ...state, commit, importBackup,
    retrySave: () => dispatch({ type: 'retry' }), exportBackup: () => exportDocument(state.document),
    reset: () => dispatch({ type: 'commit', document: createDocument(currentMonth()), notice: null, recover: true }),
  }), [state, commit, importBackup]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** 供容器和业务 Hook 读取统一正式文档，喵~ */
export function useFinanceDocument(): DocumentApi {
  const value = useContext(Context);
  if (!value) throw new Error('必须在 FinanceDocumentProvider 内使用');
  return value;
}
