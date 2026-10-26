import { SITE_HOSTNAME, seoPages } from './seo';
/** GA 只接收使用行为，调用方不得传入财务数值、名称、备注或文档标识。 */
type EventParams = { field_name?: string; entry_point?: string; flow_type?: string; flow_count?: number; changed_fields?: number; result_status?: 'available' | 'unavailable' | 'invalid'; display_basis?: 'real' | 'nominal' };
type EventName = 'plan_open' | 'plan_field_edit' | 'plan_field_save' | 'plan_save' | 'goal_save' | 'evaluation_open' | 'evaluation_field_edit' | 'evaluation_run' | 'evaluation_add_flow' | 'evaluation_remove_flow' | 'evaluation_clear' | 'evaluation_basis_change';
type Gtag = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; gtag?: Gtag } }

let enabled = false;
let currentPath: string | undefined;
const titles: Record<string, string> = Object.fromEntries(Object.entries(seoPages).map(([path, page]) => [path, page.title]));

/** 只在生产站点启用；本地、预览和未配置环境不采集。 */
export function initAnalytics(measurementId: string | undefined, production: boolean, hostname = window.location.hostname) {
  if (enabled || !production || hostname !== SITE_HOSTNAME || !/^G-[A-Z0-9]+$/.test(measurementId ?? '')) return;
  try {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = window.gtag ?? function () { window.dataLayer!.push(arguments); };
    window.gtag('js', new Date());
    const path = Object.hasOwn(titles, window.location.pathname) ? window.location.pathname : '/';
    window.gtag('set', { page_location: `${window.location.origin}${path}`, page_title: titles[path], page_referrer: document.referrer ? new URL(document.referrer).origin : '' });
    window.gtag('config', measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);
    enabled = true;
  } catch { /* 统计初始化失败不阻塞应用。 */ }
}

/** 统计真实页面切换，面板参数和说明锚点不新增 PV；StrictMode 不重复上报。 */
export function trackPage(pathname: string) {
  if (!enabled) return;
  const path = Object.hasOwn(titles, pathname) ? pathname : '/';
  if (path === currentPath) return;
  const pageLocation = `${window.location.origin}${path}`;
  let referrer = '';
  try { referrer = currentPath ? `${window.location.origin}${currentPath}` : document.referrer ? new URL(document.referrer).origin : ''; } catch { /* 无效来源不采集。 */ }
  currentPath = path;
  const params = { page_location: pageLocation, page_referrer: referrer, page_title: titles[path] };
  try {
    window.gtag?.('set', params);
    window.gtag?.('event', 'page_view', params);
  } catch { /* 统计失败不阻塞导航。 */ }
  if (path === '/evaluate') trackEvent('evaluation_open');
}

/** 统计失败不影响编辑、保存或试算。 */
export function trackEvent(name: EventName, params: EventParams = {}) {
  if (!enabled) return;
  try { window.gtag?.('event', name, params); } catch { /* 统计脚本不可用时保持业务可用。 */ }
}
