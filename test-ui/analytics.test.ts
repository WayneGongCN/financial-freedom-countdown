import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  delete window.gtag; delete window.dataLayer;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
});

describe('GA transport', () => {
  it('never loads GA on local, preview, development or unconfigured builds', async () => {
    const { initAnalytics, trackPage, trackEvent } = await import('../app/analytics');
    initAnalytics('G-TEST123', true, 'localhost');
    initAnalytics('G-TEST123', true, 'preview.vercel.app');
    initAnalytics('G-TEST123', false, 'freedom-countdown.waynegong.com');
    initAnalytics(undefined, true, 'freedom-countdown.waynegong.com');
    trackPage('/'); trackEvent('plan_save');
    expect(window.dataLayer).toBeUndefined();
    expect(document.querySelector('script')).toBeNull();
  });
  it('initializes once, queues events, deduplicates routes and strips queries and hashes', async () => {
    const { initAnalytics, trackPage, trackEvent } = await import('../app/analytics');
    window.history.replaceState({}, '', '/?goal=private-name#private-text');
    initAnalytics('G-TEST123', true, 'freedom-countdown.waynegong.com');
    initAnalytics('G-TEST123', true, 'freedom-countdown.waynegong.com');
    trackPage('/'); trackPage('/'); trackPage('/evaluate'); trackPage('/evaluate'); trackPage('/');
    trackEvent('plan_field_edit', { field_name: 'assets' });
    const commands = window.dataLayer!.map((args) => Array.from(args as unknown[]));
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(commands.filter(([command]) => command === 'config')).toHaveLength(1);
    expect(commands.find(([command]) => command === 'config')?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false });
    expect(commands.filter(([, name]) => name === 'page_view')).toHaveLength(3);
    expect(commands.filter(([, name]) => name === 'evaluation_open')).toHaveLength(1);
    expect(JSON.stringify(commands)).not.toMatch(/private-name|private-text/);
    expect(commands.filter(([, name]) => name === 'page_view')[2]?.[2]).toMatchObject({ page_referrer: `${window.location.origin}/evaluate` });
    window.history.replaceState({}, '', '/');
  });
  it('a failing analytics client never interrupts the app', async () => {
    const { initAnalytics, trackPage, trackEvent } = await import('../app/analytics');
    initAnalytics('G-TEST123', true, 'freedom-countdown.waynegong.com');
    window.gtag = () => { throw new Error('blocked'); };
    expect(() => trackPage('/evaluate')).not.toThrow();
    expect(() => trackEvent('evaluation_clear')).not.toThrow();
  });
});
