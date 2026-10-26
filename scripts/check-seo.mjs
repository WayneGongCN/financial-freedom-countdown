import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const origin = 'https://freedom-countdown.waynegong.com';
const expected = [
  ['/', 'index.html', '财富自由倒计时｜财务自由计算器', '估算财富自由'],
  ['/evaluate', 'evaluate.html', '消费与增收影响评估｜财富自由倒计时', '评估一笔消费或增收'],
  ['/guide', 'guide.html', '4% 法则与计算口径说明｜财富自由倒计时', '有限期支出的剩余准备金'],
];
const descriptions = new Set();
for (const [path, file, title, text] of expected) {
  const html = await readFile(new URL(`../web-dist/${file}`, import.meta.url), 'utf8');
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.title, title);
  assert.equal(doc.querySelectorAll('title').length, 1);
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelectorAll('meta[name="description"]').length, 1);
  descriptions.add(doc.querySelector('meta[name="description"]').content);
  assert.equal(doc.querySelector('link[rel="canonical"]').href, origin + path);
  assert.equal(doc.querySelector('meta[property="og:url"]').content, origin + path);
  assert.equal(doc.querySelector('meta[property="og:image"]').content, `${origin}/social-card.png`);
  assert.equal(doc.querySelector('meta[name="robots"]').content, process.env.VERCEL_ENV === 'preview' ? 'noindex,follow' : 'index,follow');
  assert.ok(doc.querySelector('meta[name="google-site-verification"]').content);
  assert.ok(doc.querySelector('meta[name="msvalidate.01"]').content);
  assert.ok(doc.querySelector('main').textContent.includes(text));
  assert.ok(doc.querySelectorAll('a[href]').length >= 3);
  assert.equal(doc.querySelectorAll('#page-schema').length, 1);
  const schema = JSON.parse(doc.querySelector('#page-schema').textContent);
  assert.equal(schema['@graph'][1].url, origin + path);
  assert.ok(doc.querySelector('script[type="module"][src^="/assets/"]'));
}
assert.equal(descriptions.size, 3);
const sitemap = new JSDOM(await readFile(new URL('../web-dist/sitemap.xml', import.meta.url), 'utf8'), { contentType: 'text/xml' }).window.document;
assert.deepEqual([...sitemap.querySelectorAll('loc')].map(node => node.textContent), expected.map(([path]) => origin + path));
assert.match(await readFile(new URL('../web-dist/robots.txt', import.meta.url), 'utf8'), /Sitemap: https:\/\/freedom-countdown\.waynegong\.com\/sitemap\.xml/);
const png = await readFile(new URL('../web-dist/social-card.png', import.meta.url));
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
assert.match(await readFile(new URL('../web-dist/favicon.svg', import.meta.url), 'utf8'), /<svg/);
console.log('SEO: three static pages, unique metadata, verification, sitemap and image checks passed.');
