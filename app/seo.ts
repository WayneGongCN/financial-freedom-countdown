export const SITE_ORIGIN = 'https://freedom-countdown.waynegong.com';
export const SITE_HOSTNAME = new URL(SITE_ORIGIN).hostname;
export const seoPages = {
  '/': { title: '财富自由倒计时｜财务自由计算器', heading: '财富自由倒计时', description: '免费财务自由计算器：根据当前资产、收入、支出、投资收益与通胀假设，估算财富自由目标、积累进度和预计达成时间。支持调整提取率与目标口径，并评估消费或增收对计划的影响。无需注册，财务方案仅保存在当前浏览器。' },
  '/evaluate': { title: '消费与增收影响评估｜财富自由倒计时', heading: '消费与增收影响评估', description: '一笔消费会让财富自由推迟多久？增加收入或节省费用又能提前多少？根据你的基础计划，比较一次性、每月、每年及未来现金流对资产和达成时间的影响，区分本金、投资损益与购买力变化。试算独立保存，不改变基础计划。' },
  '/guide': { title: '4% 法则与计算口径说明｜财富自由倒计时', heading: '口径说明', description: '了解财富自由倒计时的计算方法：4% 提取率、总被动收入、年化总收益率、通胀与购买力、现金流增长及有限期支出准备金。逐项解释目标定义和消费评估口径，帮助你理解测算结果、调整假设，并识别恒定收益模型的适用边界。' },
} as const;
export type SeoPath = keyof typeof seoPages;

/** 将已知路由映射到公开页面，未知路径不冒充首页，喵~ */
export function seoPath(pathname: string): SeoPath | undefined {
  return Object.hasOwn(seoPages, pathname) ? pathname as SeoPath : undefined;
}

/** 生成只描述公开功能的结构化数据，永不读取个人方案，喵~ */
export function structuredData(path: SeoPath) {
  const page = seoPages[path];
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebApplication', '@id': `${SITE_ORIGIN}/#app`, name: '财富自由倒计时', url: `${SITE_ORIGIN}/`, applicationCategory: 'FinanceApplication', operatingSystem: 'Web', inLanguage: 'zh-CN', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' }, description: seoPages['/'].description },
    { '@type': 'WebPage', '@id': `${SITE_ORIGIN}${path}`, url: `${SITE_ORIGIN}${path}`, name: page.title, description: page.description, inLanguage: 'zh-CN', about: { '@id': `${SITE_ORIGIN}/#app` } },
  ] };
}

/** 从同一份配置生成构建和客户端共用的元信息，喵~ */
export function seoMeta(path: SeoPath) {
  const page = seoPages[path];
  return [
    { name: 'description', content: page.description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: '财富自由倒计时' },
    { property: 'og:locale', content: 'zh_CN' },
    { property: 'og:title', content: page.title },
    { property: 'og:description', content: page.description },
    { property: 'og:url', content: `${SITE_ORIGIN}${path}` },
    { property: 'og:image', content: `${SITE_ORIGIN}/social-card.png` },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: '财富自由倒计时：看清目标，评估每一步' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: page.title },
    { name: 'twitter:description', content: page.description },
    { name: 'twitter:image', content: `${SITE_ORIGIN}/social-card.png` },
  ];
}

/** SPA 导航时同步页面元信息，保留构建时的预览索引策略，喵~ */
export function updatePageSeo(pathname: string) {
  const path = seoPath(pathname);
  if (!path) return;
  document.title = seoPages[path].title;
  for (const attrs of seoMeta(path)) {
    const key = attrs.name ? 'name' : 'property';
    let element = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${attrs[key]}"]`);
    if (!element) { element = document.createElement('meta'); document.head.appendChild(element); }
    element.setAttribute(key, attrs[key]!);
    element.content = attrs.content;
  }
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
  canonical.href = `${SITE_ORIGIN}${path}`;
  let schema = document.getElementById('page-schema');
  if (!schema) { schema = document.createElement('script'); schema.setAttribute('type', 'application/ld+json'); schema.id = 'page-schema'; document.head.appendChild(schema); }
  schema.textContent = JSON.stringify(structuredData(path));
}
