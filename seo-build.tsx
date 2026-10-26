import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Plugin } from 'vite';
import { guideTopics } from './app/model/guide';
import { GuideContent, PublicContent } from './app/ui/SeoContent';
import { SITE_ORIGIN, seoMeta, seoPages, seoPath, structuredData, type SeoPath } from './app/seo';

/** 渲染公开页面外壳，个人计划仍由客户端挂载，喵~ */
function StaticPage({ path }: { path: SeoPath }) {
  return <React.Fragment><div className="static-page"><header><h1>{seoPages[path].heading}</h1></header><main>
    {path === '/guide' ? <div className="seo-content"><p>了解每个数字的含义，再选择适合你的口径。</p><GuideContent topics={guideTopics} /><a href="/">返回财务自由计算器 ↗</a></div> : <PublicContent evaluation={path === '/evaluate'} />}
    <noscript><p className="seo-content">计算器需要启用 JavaScript；你仍可阅读功能与计算口径说明。</p></noscript>
  </main></div></React.Fragment>;
}

/** 输出每页独立的 HTML 正文和元信息，喵~ */
function renderPage(html: string, path: SeoPath, indexable: boolean) {
  const head = renderToStaticMarkup(<React.Fragment><title>{seoPages[path].title}</title>
    {seoMeta(path).map((attrs, index) => <meta key={index} {...attrs} />)}
    <meta name="robots" content={indexable ? 'index,follow' : 'noindex,follow'} />
    <link rel="canonical" href={`${SITE_ORIGIN}${path}`} />
    <script id="page-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(path)).replaceAll('<', '\\u003c') }} />
  </React.Fragment>);
  return html.replace(/<!--seo-head-->[\s\S]*?<!--\/seo-head-->/, `<!--seo-head-->${head}<!--/seo-head-->`)
    .replace(/<!--seo-body-->[\s\S]*?<!--\/seo-body-->/, `<!--seo-body-->${renderToStaticMarkup(<StaticPage path={path} />)}<!--/seo-body-->`);
}

/** 构建三个静态入口并让开发服务器按真实路径返回相同内容，喵~ */
export function seoPlugin(): Plugin {
  const indexable = process.env.VERCEL_ENV !== 'preview';
  return {
    name: 'finance-static-seo', enforce: 'post',
    /** 开发请求和首页构建共用公开 HTML 模板，喵~ */
    transformIndexHtml(html, context) { return renderPage(html, seoPath(context.originalUrl?.split('?')[0] ?? context.path) ?? '/', indexable); },
    /** 从已处理资源引用的首页派生子页面与抓取清单，喵~ */
    generateBundle(_, bundle) {
      const entry = bundle['index.html'];
      if (!entry || entry.type !== 'asset') throw new Error('缺少 Web HTML 入口');
      for (const path of ['/evaluate', '/guide'] as const) this.emitFile({ type: 'asset', fileName: `${path.slice(1)}.html`, source: renderPage(String(entry.source), path, indexable) });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n` });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(seoPages).map(path => `<url><loc>${SITE_ORIGIN}${path}</loc></url>`).join('')}</urlset>\n` });
    },
  };
}
