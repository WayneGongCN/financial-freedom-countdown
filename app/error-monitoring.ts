import * as Sentry from '@sentry/browser';

const dsn = import.meta.env.PROD ? import.meta.env.VITE_SENTRY_DSN : undefined;

/** 保留代码位置并移除资源地址上的查询参数，喵~ */
function stripUrlDetails(path?: string): string | undefined {
  if (path?.startsWith('data:') || path?.startsWith('blob:')) return undefined;
  return path?.split(/[?#]/, 1)[0];
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
    /** 异常消息可能含用户输入，仅发送固定操作名、版本和代码位置，喵~ */
    beforeSend(event) {
      delete event.request;
      delete event.user;
      delete event.extra;
      delete event.breadcrumbs;
      delete event.message;
      delete event.logentry;
      for (const exception of event.exception?.values ?? []) {
        exception.type = 'Error';
        exception.value = String(event.tags?.operation ?? 'browser_exception');
        delete exception.mechanism?.data;
        for (const frame of exception.stacktrace?.frames ?? []) {
          frame.filename = stripUrlDetails(frame.filename);
          frame.abs_path = stripUrlDetails(frame.abs_path);
          delete frame.vars;
          delete frame.pre_context;
          delete frame.context_line;
          delete frame.post_context;
        }
      }
      for (const image of event.debug_meta?.images ?? []) {
        if ('code_file' in image && image.code_file) {
          image.code_file = stripUrlDetails(image.code_file) ?? '';
        }
      }
      return event.exception?.values?.length ? event : null;
    },
  });
}

/** 记录已被页面捕获的技术故障，操作名由调用点指定，喵~ */
export function reportError(error: unknown, operation: string): void {
  if (dsn) Sentry.captureException(error, { tags: { operation } });
}
