import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trackPage } from '../analytics';
import { updatePageSeo } from '../seo';

/** 管理页面和面板路由，并在口径说明往返时恢复来源位置，喵~ */
export function useFinanceNavigation() {
  const location = useLocation();
  /** 路由切换后统一更新公开元信息和页面统计，喵~ */
  useEffect(() => { updatePageSeo(location.pathname); trackPage(location.pathname); }, [location.pathname]);
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLElement | null>(null);
  const positions = useRef<Record<string, number>>({});
  const params = new URLSearchParams(location.search);
  const panel = params.get('panel');
  const requestedStep = params.get('step') ?? '';
  const step = panel === 'goal' && ['left', 'right'].includes(requestedStep) ? requestedStep : '';
  const goalId = params.get('goal') ?? undefined;
  const guide = location.pathname === '/guide';
  const anchor = location.hash.slice(1);
  /** 旧计划子页直接替换为完整计划，保留来源、其他参数和当前草稿，喵~ */
  useEffect(() => {
    if (panel !== 'plan') return;
    const query = new URLSearchParams(location.search);
    if (!query.has('step')) return;
    query.delete('step');
    navigate({ pathname: location.pathname, search: query.toString(), hash: location.hash }, { replace: true, state: location.state });
  }, [panel, location.pathname, location.search, location.hash, location.state, navigate]);
  /** 保存来源滚动位置但不把金额或草稿写入 URL，喵~ */
  function remember() { positions.current[location.pathname] = scrollRef.current?.scrollTop ?? 0; }
  /** 请求主页面导航，喵~ */
  function go(page: string) { remember(); navigate(page); }
  /** 将编辑器状态表达为非敏感查询参数，喵~ */
  function openPanel(kind: 'plan' | 'goal', id?: string) {
    remember();
    const query = new URLSearchParams({ panel: kind }); if (id) query.set('goal', id);
    navigate({ pathname: location.pathname === '/evaluate' ? '/evaluate' : '/', search: query.toString() }, { state: { panelParent: true } });
  }
  /** 关闭面板时清除编辑路由，喵~ */
  function closePanel() { if (location.state?.panelParent) navigate(-1); else navigate({ pathname: location.pathname, search: '' }, { replace: true }); }
  /** 只有目标指标使用子步骤，浏览器后退可返回目标编辑器，喵~ */
  function enterStep(next: string) {
    if (panel !== 'goal' || !['left', 'right'].includes(next)) return;
    const query = new URLSearchParams(location.search); query.set('step', next);
    navigate({ search: query.toString() }, { state: { ...location.state, stepParent: true } });
  }
  /** 确认或取消目标指标子步骤后返回目标编辑器，喵~ */
  function backStep() {
    if (panel !== 'goal' || !step) return;
    if (location.state?.stepParent) { navigate(-1); return; }
    const query = new URLSearchParams(location.search); query.delete('step');
    navigate({ search: query.toString() }, { replace: true });
  }
  /** 打开说明时记录来源路由，已有说明页保持原返回位置，喵~ */
  function help(topic = '') {
    remember();
    navigate(`/guide${topic ? `#${topic}` : ''}`, { replace: guide, state: guide ? location.state : { returnTo: `${location.pathname}${location.search}`, returnScroll: scrollRef.current?.scrollTop ?? 0 } });
  }
  /** 返回说明来源，直接访问说明时回总览，喵~ */
  function returnFromGuide() {
    const state = location.state as { returnTo?: string; returnScroll?: number } | null;
    if (state?.returnTo) navigate(-1); else navigate('/', { replace: true });
  }
  /** DOM 提交后定位说明锚点或恢复页面滚动，喵~ */
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (guide && anchor) {
      const topic = document.getElementById(anchor);
      topic?.scrollIntoView({ block: 'start' }); topic?.focus({ preventScroll: true });
    } else element.scrollTop = (location.state as { restoreScroll?: number } | null)?.restoreScroll ?? positions.current[location.pathname] ?? 0;
  }, [guide, anchor, location.pathname, location.state]);
  return { location, panel, step, goalId, guide, anchor, scrollRef, go, openPanel, closePanel, enterStep, backStep, help, returnFromGuide };
}
