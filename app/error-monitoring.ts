import * as Sentry from '@sentry/browser';
import { ZodError } from 'zod';

const dsn = import.meta.env.PROD ? import.meta.env.VITE_SENTRY_DSN : undefined;
type Operation = 'finance_storage_read' | 'finance_storage_save';
const errorTypes = ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'ZodError', 'SecurityError', 'QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'];
const mechanisms = ['generic', 'auto.browser.global_handlers.onerror', 'auto.browser.global_handlers.onunhandledrejection'];
const debugIdPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const validationFields = new Set([
  'schemaVersion', 'modelVersion', 'plan', 'goals', 'project', 'preferences',
  'baseMonth', 'currency', 'initialAssets', 'inflationRate', 'investmentReturn',
  'activeIncome', 'currentExpenses', 'externalIncome', 'retirementBudget', 'horizonMonths',
  'amount', 'growth', 'kind', 'annualRate', 'durationMonths', 'flow', 'id', 'name', 'notes',
  'cashFlows', 'priceAnchorMonth', 'startMonth', 'endMonth', 'frequency', 'continuesAfterFreedom',
  'left', 'right', 'basis', 'aggregation', 'components', 'withdrawalRate', 'deductExternalIncome',
  'includeReserve', 'metric', 'unit', 'ratio', 'comparison', 'displayBasis', 'primaryGoalId',
]);
const validationCodes = new Set([
  'invalid_type', 'too_big', 'too_small', 'invalid_format', 'not_multiple_of',
  'unrecognized_keys', 'invalid_union', 'invalid_key', 'invalid_element', 'invalid_value', 'custom',
]);

/** 仅提取固定字段路径和校验代码，不保留输入值、消息、未知键或版本值，喵~ */
function storageValidation(error: unknown) {
  if (!(error instanceof ZodError)) return undefined;
  const issues = error.issues.slice(0, 10).map(issue => ({
    path: issue.path.slice(0, 8).map(part => typeof part === 'number' ? '*'
      : typeof part === 'string' && validationFields.has(part) ? part : 'unknown').join('.') || 'document',
    code: validationCodes.has(issue.code) ? issue.code : 'unknown',
  }));
  const reason = error.issues.some(issue => issue.path.length === 1
    && (issue.path[0] === 'schemaVersion' || issue.path[0] === 'modelVersion'))
    ? 'version_mismatch' : 'invalid_document';
  return { reason, issues, truncated: error.issues.length > 10 };
}

/** 只允许本站构建脚本地址，过滤动态地址、外站、查询参数和锚点，喵~ */
function scriptUrl(path?: string): string | undefined {
  if (!path) return undefined;
  try {
    const url = new URL(path, window.location.origin);
    return url.origin === window.location.origin && /^\/assets\/[\w-]+\.js$/.test(url.pathname)
      ? `${url.origin}${url.pathname}` : undefined;
  } catch { return undefined; }
}

/** 从 UA 提取固定浏览器名称和纯数字版本，不发送完整 UA 或设备标识，喵~ */
function browserContext(): { name: string; version?: string } {
  const browsers: [string, RegExp][] = [
    ['Edge', /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
    ['Opera', /OPR\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['QQ Browser', /(?:MQQBrowser|QQBrowser)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari\//],
    ['WeChat', /MicroMessenger\/([\d.]+)/],
  ];
  for (const [name, pattern] of browsers) {
    const version = navigator.userAgent.match(pattern)?.[1];
    if (version && /^\d{1,4}(?:\.\d{1,5}){0,3}$/.test(version)) return { name, version };
  }
  return { name: 'Unknown' };
}

/** 根据操作和白名单异常类型分类，不读取异常消息或校验失败的财务值，喵~ */
function errorCategory(type: string, operation: Operation | 'browser_exception'): string {
  if (operation !== 'browser_exception') {
    if (type === 'SecurityError') return 'storage_access_denied';
    if (type === 'QuotaExceededError' || type === 'NS_ERROR_DOM_QUOTA_REACHED') return 'storage_quota_exceeded';
    if (operation === 'finance_storage_read' && type === 'SyntaxError') return 'storage_json_invalid';
    if (type === 'ZodError') return 'storage_validation_failed';
    return operation === 'finance_storage_read' ? 'storage_read_failed' : 'storage_save_failed';
  }
  return type === 'TypeError' ? 'javascript_type_error'
    : type === 'ReferenceError' ? 'javascript_reference_error'
      : type === 'SyntaxError' ? 'javascript_syntax_error' : 'javascript_exception';
}

/** 仅在已配置 DSN 的生产构建中收集前端异常，喵~ */
export function initializeErrorMonitoring(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: 'production',
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    defaultIntegrations: false,
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.globalHandlersIntegration(),
      Sentry.dedupeIntegration(),
    ],
    /** 重建白名单事件，仅保留技术分类、浏览器版本和代码位置，喵~ */
    beforeSend(event, hint) {
      hint.attachments = [];
      const original = hint.originalException;
      const originalType = original instanceof Error || (typeof DOMException !== 'undefined' && original instanceof DOMException)
        ? original.name : undefined;
      const exceptions = event.exception?.values?.length ? event.exception.values : originalType ? [{ type: originalType }] : undefined;
      if (!exceptions?.length) return null;
      const operation = event.tags?.operation === 'finance_storage_read' || event.tags?.operation === 'finance_storage_save'
        ? event.tags.operation : 'browser_exception';
      const validation = operation !== 'browser_exception' ? storageValidation(original) : undefined;
      const values = exceptions.map((exception, index) => {
        const name = index === exceptions.length - 1 && originalType ? originalType : exception.type;
        const type = errorTypes.includes(name ?? '') ? name! : 'Error';
        const category = errorCategory(type, operation);
        return {
          type,
          value: `${operation}: ${category}`,
          mechanism: {
            type: mechanisms.includes(exception.mechanism?.type ?? '') ? exception.mechanism!.type : 'generic',
            handled: exception.mechanism?.handled ?? (operation !== 'browser_exception'),
          },
          stacktrace: { frames: exception.stacktrace?.frames?.map(frame => ({
            filename: scriptUrl(frame.filename),
            abs_path: scriptUrl(frame.abs_path),
            function: frame.function && /^[\w.$<> [\]-]{1,120}$/.test(frame.function) ? frame.function : undefined,
            lineno: Number.isInteger(frame.lineno) ? frame.lineno : undefined,
            colno: Number.isInteger(frame.colno) ? frame.colno : undefined,
            in_app: frame.in_app,
            debug_id: debugIdPattern.test(frame.debug_id ?? '') ? frame.debug_id : undefined,
          })) },
        };
      });
      const primary = values[values.length - 1]!;
      return {
        type: undefined,
        event_id: event.event_id,
        timestamp: event.timestamp,
        platform: 'javascript',
        level: 'error',
        environment: 'production',
        release: /^[\da-f]{7,64}$/i.test(event.release ?? '') ? event.release : undefined,
        tags: { operation, error_type: primary.type, error_category: errorCategory(primary.type, operation),
          ...(validation ? { storage_validation_reason: validation.reason } : {}) },
        contexts: { browser: browserContext(),
          ...(validation ? { storage_validation: { issues: validation.issues, truncated: validation.truncated } } : {}) },
        exception: { values },
        debug_meta: { images: event.debug_meta?.images?.flatMap(image => {
          const codeFile = 'code_file' in image ? scriptUrl(image.code_file) : undefined;
          return image.type === 'sourcemap' && codeFile && debugIdPattern.test(image.debug_id)
            ? [{ type: 'sourcemap' as const, code_file: codeFile, debug_id: image.debug_id }] : [];
        }) },
      };
    },
  });
}

/** 记录已被页面捕获的技术故障，操作名只能取固定枚举，喵~ */
export function reportError(error: unknown, operation: Operation): void {
  if (dsn) Sentry.captureException(error, { tags: { operation } });
}
