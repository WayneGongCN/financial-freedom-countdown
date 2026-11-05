import * as Sentry from '@sentry/browser';
import { ZodError } from 'zod';
import { createDocument, documentSchema } from '../src/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/browser', async importOriginal => ({
  ...await importOriginal<typeof Sentry>(),
  init: vi.fn(),
  captureException: vi.fn(),
}));

/** 取得生产初始化配置，使用合成 DSN 且不连接外部服务，喵~ */
async function monitoringOptions() {
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@sentry.invalid/1');
  const monitoring = await import('../app/error-monitoring');
  monitoring.initializeErrorMonitoring();
  return vi.mocked(Sentry.init).mock.calls[0]![0]!;
}

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('Sentry 技术分类与数据最小化', () => {
  it.each([
    [false, 'https://public@sentry.invalid/1'], [true, ''],
  ])('开发或未配置 DSN 时不初始化或上报', async (production, dsn) => {
    vi.stubEnv('PROD', production); vi.stubEnv('VITE_SENTRY_DSN', dsn);
    const monitoring = await import('../app/error-monitoring');
    monitoring.initializeErrorMonitoring();
    monitoring.reportError(new Error('private-finance'), 'finance_storage_read');
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([
    ['SyntaxError', 'finance_storage_read', 'storage_json_invalid'],
    ['ZodError', 'finance_storage_read', 'storage_validation_failed'],
    ['ZodError', 'finance_storage_save', 'storage_validation_failed'],
    ['SecurityError', 'finance_storage_read', 'storage_access_denied'],
    ['QuotaExceededError', 'finance_storage_save', 'storage_quota_exceeded'],
    ['NS_ERROR_DOM_QUOTA_REACHED', 'finance_storage_save', 'storage_quota_exceeded'],
    ['Error', 'finance_storage_read', 'storage_read_failed'],
    ['Error', 'finance_storage_save', 'storage_save_failed'],
    ['TypeError', undefined, 'javascript_type_error'],
    ['ReferenceError', undefined, 'javascript_reference_error'],
    ['SyntaxError', undefined, 'javascript_syntax_error'],
    ['private-finance', 'private-operation', 'javascript_exception'],
  ])('将 %s / %s 映射为固定分类 %s', async (type, operation, category) => {
    const options = await monitoringOptions();
    const clean = await options.beforeSend!({ type: undefined, tags: { operation }, exception: { values: [{ type, value: 'private-finance' }] } }, {});
    expect(clean?.tags).toEqual({ operation: operation?.startsWith('finance_storage_') ? operation : 'browser_exception', error_type: type === 'private-finance' ? 'Error' : type, error_category: category });
    expect(JSON.stringify(clean)).not.toContain('private-');
  });

  it('兼容 SDK 将无堆栈 DOMException 转成普通消息的情况', async () => {
    const options = await monitoringOptions();
    const error = new DOMException('private-finance', 'SecurityError');
    const clean = await options.beforeSend!({ type: undefined, message: error.message, tags: { operation: 'finance_storage_read' } }, { originalException: error });
    expect(clean?.tags).toMatchObject({ error_type: 'SecurityError', error_category: 'storage_access_denied' });
    expect(clean?.exception?.values?.[0]?.mechanism?.handled).toBe(true);
    expect(JSON.stringify(clean)).not.toContain('private-finance');
  });

  it.each([false, true])('区分存档版本不兼容与结构错误，版本错误=%s', async versionMismatch => {
    const options = await monitoringOptions();
    const secret = 'private-finance-7654321';
    const document = createDocument('2026-11');
    const parsed = documentSchema.safeParse(versionMismatch
      ? { ...document, schemaVersion: 3, modelVersion: secret }
      : { ...document, plan: { ...document.plan, initialAssets: secret }, [secret]: secret });
    if (parsed.success) throw new Error('测试数据应校验失败');
    const clean = await options.beforeSend!({ type: undefined, tags: { operation: 'finance_storage_read' },
      exception: { values: [{ type: 'ZodError', value: parsed.error.message }] } }, { originalException: parsed.error });
    expect(clean?.tags?.storage_validation_reason).toBe(versionMismatch ? 'version_mismatch' : 'invalid_document');
    expect(clean?.contexts?.storage_validation).toEqual({ truncated: false, issues: versionMismatch
      ? [{ path: 'schemaVersion', code: 'invalid_value' }, { path: 'modelVersion', code: 'invalid_value' }]
      : [{ path: 'plan.initialAssets', code: 'invalid_type' }, { path: 'document', code: 'unrecognized_keys' }] });
    expect(JSON.stringify(clean)).not.toContain(secret);
  });

  it('校验诊断隐藏未知路径和数组下标，并限制诊断长度', async () => {
    const options = await monitoringOptions();
    const secret = 'private-finance-7654321';
    const error = new ZodError(Array.from({ length: 12 }, () => ({
      code: 'custom', path: ['goals', 7654321, secret, 'name'], message: secret, params: { input: secret },
    })));
    const event = { type: undefined, tags: { operation: 'finance_storage_read' }, exception: { values: [{ type: 'ZodError' }] } } as const;
    const clean = await options.beforeSend!({ ...event, exception: { values: [...event.exception.values] } }, { originalException: error });
    expect(clean?.contexts?.storage_validation).toEqual({ truncated: true,
      issues: Array.from({ length: 10 }, () => ({ path: 'goals.*.unknown.name', code: 'custom' })) });
    expect(JSON.stringify(clean)).not.toContain(secret);
    expect(JSON.stringify(clean)).not.toContain('7654321');
    const browserError = await options.beforeSend!({ type: undefined, exception: { values: [{ type: 'ZodError' }] } }, { originalException: error });
    expect(browserError?.contexts?.storage_validation).toBeUndefined();
  });

  it.each([
    ['Mozilla/5.0 Version/15.3 Mobile/15E148 Safari/604.1', 'Safari', '15.3'],
    ['Mozilla/5.0 Chrome/90.0.4430.212 Safari/537.36', 'Chrome', '90.0.4430.212'],
    ['Mozilla/5.0 Chrome/130.0.0.0 Edg/130.0.2849.80', 'Edge', '130.0.2849.80'],
    ['Mozilla/5.0 CriOS/120.0.6099.119 Mobile Safari/604.1', 'Chrome', '120.0.6099.119'],
    ['Mozilla/5.0 FxiOS/120.0 Mobile Safari/605.1.15', 'Firefox', '120.0'],
    ['Mozilla/5.0 Chrome/100.0.0.0 OPR/90.0.0.0', 'Opera', '90.0.0.0'],
    ['Mozilla/5.0 SamsungBrowser/19.0 Chrome/102.0.0.0', 'Samsung Internet', '19.0'],
    ['Mozilla/5.0 MQQBrowser/13.0 Chrome/100.0.0.0', 'QQ Browser', '13.0'],
    ['Mozilla/5.0 Mobile MicroMessenger/8.0.40', 'WeChat', '8.0.40'],
    ['private-finance-device', 'Unknown', undefined],
  ])('只发送浏览器 %s 的名称和数字版本', async (ua, name, version) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
    const options = await monitoringOptions();
    const clean = await options.beforeSend!({ type: undefined, exception: { values: [{ type: 'Error' }] } }, {});
    expect(clean?.contexts).toEqual({ browser: version ? { name, version } : { name } });
    expect(JSON.stringify(clean)).not.toContain(ua);
  });

  it('从事件和附件中去除财务内容，并保留可还原 Source Map 的代码位置', async () => {
    const options = await monitoringOptions();
    const secret = 'private-finance-7654321';
    const debugId = 'c3115347-2da6-49d1-9e84-8215382ade26';
    const asset = `${window.location.origin}/assets/index-abc123.js`;
    const hint = { attachments: [{ filename: `${secret}.json`, data: secret }] };
    const clean = await options.beforeSend!({
      type: undefined, event_id: 'a'.repeat(32), release: 'b'.repeat(40), timestamp: 123,
      message: secret, logentry: { message: secret }, user: { id: secret }, request: { data: secret, url: secret },
      transaction: secret, fingerprint: [secret], extra: { document: secret },
      breadcrumbs: [{ message: secret }], contexts: { finance: { plan: secret }, trace: { trace_id: 'c'.repeat(32), span_id: 'd'.repeat(16), data: { plan: secret } } },
      tags: { operation: 'finance_storage_read', goal: secret },
      exception: { values: [{ type: 'ZodError', value: secret, module: secret, mechanism: { type: 'generic', handled: true, data: { document: secret } }, stacktrace: { frames: [
        { filename: `${asset}?plan=${secret}#${secret}`, abs_path: `blob:${secret}`, function: 'importDocument', lineno: 31, colno: 25, vars: { amount: secret }, pre_context: [secret], context_line: secret, post_context: [secret], module_metadata: { plan: secret }, debug_id: debugId },
        { filename: `${window.location.origin}/${secret}`, function: `eval ${secret}()`, abs_path: `data:${secret}` },
        { filename: `https://external.invalid/${secret}` },
      ] } }] },
      debug_meta: { images: [{ type: 'sourcemap', debug_id: debugId, code_file: `${asset}?plan=${secret}` }, { type: 'sourcemap', debug_id: debugId, code_file: `https://external.invalid/${secret}` }] },
    }, hint);
    expect(JSON.stringify(clean)).not.toContain(secret);
    expect(hint.attachments).toEqual([]);
    expect(clean).toMatchObject({ event_id: 'a'.repeat(32), release: 'b'.repeat(40), contexts: { browser: expect.any(Object) }, exception: { values: [{ type: 'ZodError', mechanism: { type: 'generic', handled: true }, stacktrace: { frames: [{ filename: asset, function: 'importDocument', lineno: 31, colno: 25, debug_id: debugId }, {}, {}] } }] }, debug_meta: { images: [{ type: 'sourcemap', code_file: asset, debug_id: debugId }] } });
    expect(await options.beforeSend!({ type: undefined, message: secret }, {})).toBeNull();
    expect(options).toMatchObject({ defaultIntegrations: false, dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false } });
  });

  it('真实 SDK 序列化的校验错误不含财务文档、消息或附件', async () => {
    const options = await monitoringOptions();
    const sdk = await vi.importActual<typeof Sentry>('@sentry/browser');
    const { importDocument } = await import('../src/persistence');
    const envelopes: unknown[] = [];
    const client = sdk.init({ ...options, transport: () => ({ send: async envelope => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }) });
    const secret = 'private-finance-7654321';
    try {
      sdk.withScope(scope => {
        scope.setExtra('document', secret);
        scope.setContext('finance', { name: secret });
        scope.setTag('goal', secret);
        scope.setUser({ id: secret });
        scope.addAttachment({ filename: `${secret}.json`, data: secret });
        scope.addBreadcrumb({ message: secret });
        for (const json of [secret, JSON.stringify({ [secret]: secret })]) {
          try { importDocument(json); }
          catch (error) { sdk.captureException(error, { tags: { operation: 'finance_storage_read' } }); }
        }
        sdk.captureException(new DOMException(secret, 'SecurityError'), { tags: { operation: 'finance_storage_read' } });
        sdk.captureException(new DOMException(secret, 'QuotaExceededError'), { tags: { operation: 'finance_storage_save' } });
      });
      await client!.flush(2000);
      expect(envelopes).toHaveLength(4);
      expect(JSON.stringify(envelopes)).not.toContain(secret);
      expect(JSON.stringify(envelopes)).toContain('storage_validation_failed');
      expect(JSON.stringify(envelopes)).toContain('ZodError');
      expect(JSON.stringify(envelopes)).toContain('storage_json_invalid');
      expect(JSON.stringify(envelopes)).toContain('storage_access_denied');
      expect(JSON.stringify(envelopes)).toContain('storage_quota_exceeded');
      expect(JSON.stringify(envelopes)).not.toContain('attachment');
    } finally { await client?.close(); }
  });
});
