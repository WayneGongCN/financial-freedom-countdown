import type { ComponentProps, ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useFinanceNavigation } from '../app/hooks/useFinanceNavigation';
import { useFinanceWorkspace } from '../app/hooks/useFinanceWorkspace';
import { fixtureDocument, memoryStorage, wrapperFor } from './fixtures';

/** 为真实导航和草稿生命周期提供独立路由及合成存档，喵~ */
function navigationWrapper(entries: ComponentProps<typeof MemoryRouter>['initialEntries'] = ['/'], storage = memoryStorage()) {
  const DocumentProvider = wrapperFor(storage);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={entries}><DocumentProvider>{children}</DocumentProvider></MemoryRouter>;
  };
}

describe('完整计划路由与草稿生命周期', () => {
  it.each(['income', 'expenses', 'external', 'budget', 'assumptions', 'left', 'unknown', ''])('旧计划 step=%s 替换为父面板并保留来源信息，不增加历史', (step) => {
    const source = { panelParent: true, source: 'receipt' };
    const { result } = renderHook(() => ({ nav: useFinanceNavigation(), navigate: useNavigate() }), {
      wrapper: navigationWrapper(['/evaluate', {
        pathname: '/evaluate', search: `?panel=plan&step=${step}&from=receipt`, hash: '#keep', state: source,
      }]),
    });
    expect(result.current.nav.step).toBe('');
    expect(result.current.nav.location).toMatchObject({ pathname: '/evaluate', search: '?panel=plan&from=receipt', hash: '#keep', state: source });
    act(() => result.current.nav.enterStep('left'));
    act(() => result.current.nav.backStep());
    expect(result.current.nav.location.search).toBe('?panel=plan&from=receipt');
    act(() => result.current.navigate(-1));
    expect(result.current.nav.location).toMatchObject({ pathname: '/evaluate', search: '' });
    act(() => result.current.navigate(1));
    expect(result.current.nav.location.search).toBe('?panel=plan&from=receipt');
  });

  it.each(['left', 'right'])('目标 %s 子步骤与深链接返回继续有效', (side) => {
    const search = `?panel=goal&goal=passive-vs-income&step=${side}`;
    const { result } = renderHook(() => useFinanceNavigation(), { wrapper: navigationWrapper([`/${search}`]) });
    expect(result.current.step).toBe(side);
    expect(result.current.location.search).toBe(search);
    act(() => result.current.backStep());
    expect(result.current.step).toBe('');
    expect(result.current.location.search).toBe('?panel=goal&goal=passive-vs-income');
    act(() => result.current.enterStep('income'));
    expect(result.current.step).toBe('');
  });

  it('非目标页面不解释孤立的指标子步骤', () => {
    const { result } = renderHook(() => useFinanceNavigation(), { wrapper: navigationWrapper(['/?step=left']) });
    expect(result.current.step).toBe('');
    expect(result.current.location.search).toBe('?step=left');
  });

  it.each(['plan', 'goal'] as const)('打开与关闭 %s 面板时保留底页滚动位置', (kind) => {
    const { result } = renderHook(() => useFinanceNavigation(), { wrapper: navigationWrapper() });
    const scroll = document.createElement('main');
    result.current.scrollRef.current = scroll;
    scroll.scrollTop = 240;
    act(() => result.current.openPanel(kind));
    expect(scroll.scrollTop).toBe(240);
    act(() => result.current.closePanel());
    expect(scroll.scrollTop).toBe(240);
  });

  it('打开计划后浏览器后退一次关闭整面板并丢弃未提交草稿', () => {
    const { result } = renderHook(() => ({ workspace: useFinanceWorkspace(), navigate: useNavigate() }), { wrapper: navigationWrapper() });
    act(() => result.current.workspace.openPlan());
    act(() => result.current.workspace.plan.change('income', '360000'));
    expect(result.current.workspace.nav.location.search).toBe('?panel=plan');
    expect(result.current.workspace.plan.draft?.income).toBe('360000');
    expect(result.current.workspace.api.document.plan.activeIncome?.[0]?.amount).toBe(240000);
    act(() => result.current.navigate(-1));
    expect(result.current.workspace.nav.panel).toBeNull();
    expect(result.current.workspace.plan.draft).toBeNull();
    expect(result.current.workspace.api.document.plan.activeIncome?.[0]?.amount).toBe(240000);
    act(() => result.current.navigate(1));
    expect(result.current.workspace.plan.draft?.income).toBe('240000');
    act(() => result.current.workspace.closeEditor());
    expect(result.current.workspace.nav.panel).toBeNull();
    expect(result.current.workspace.plan.draft).toBeNull();
  });

  it('旧计划深链接及后续参数归一不重置已输入草稿，取消仍回来源页面', () => {
    const { result } = renderHook(() => ({ workspace: useFinanceWorkspace(), navigate: useNavigate() }), {
      wrapper: navigationWrapper(['/evaluate?panel=plan&step=income&from=receipt']),
    });
    expect(result.current.workspace.nav.location.search).toBe('?panel=plan&from=receipt');
    act(() => result.current.workspace.plan.change('income', '360000'));
    const draft = result.current.workspace.plan.draft;
    act(() => result.current.navigate({ search: '?panel=plan&step=assumptions&from=receipt' }, { replace: true }));
    expect(result.current.workspace.nav.location.search).toBe('?panel=plan&from=receipt');
    expect(result.current.workspace.plan.draft).toBe(draft);
    expect(result.current.workspace.plan.draft?.income).toBe('360000');
    act(() => result.current.workspace.closeEditor());
    expect(result.current.workspace.nav.location).toMatchObject({ pathname: '/evaluate', search: '' });
    expect(result.current.workspace.plan.draft).toBeNull();
    expect(result.current.workspace.api.document.plan.activeIncome?.[0]?.amount).toBe(240000);
  });

  it('计划直接保存整份草稿并关闭，不产生任何确认子步骤', async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useFinanceWorkspace(), { wrapper: navigationWrapper(['/'], storage) });
    act(() => result.current.openPlan());
    act(() => { result.current.plan.change('income', '360000'); result.current.plan.change('returnRate', '10'); });
    act(() => result.current.savePlan());
    expect(result.current.nav.panel).toBeNull();
    expect(result.current.plan.draft).toBeNull();
    expect(result.current.api.document.plan).toMatchObject({ activeIncome: [{ amount: 360000, durationMonths: null }], investmentReturn: { annualRate: 0.1 } });
    await waitFor(() => expect(result.current.api.savedRevision).toBe(result.current.api.revision));
  });

  it('从计划往返说明及说明锚点不丢草稿，返回后一次后退仍关闭整面板', () => {
    const { result } = renderHook(() => ({ workspace: useFinanceWorkspace(), navigate: useNavigate() }), {
      wrapper: navigationWrapper(['/evaluate']),
    });
    act(() => result.current.workspace.openPlan());
    act(() => result.current.workspace.plan.change('expenses', '180000'));
    const draft = result.current.workspace.plan.draft;
    act(() => result.current.workspace.nav.help('growth-rules'));
    expect(result.current.workspace.nav.guide).toBe(true);
    expect(result.current.workspace.plan.draft).toBe(draft);
    act(() => result.current.workspace.nav.help('return-assumptions'));
    act(() => result.current.workspace.nav.returnFromGuide());
    expect(result.current.workspace.nav.location).toMatchObject({ pathname: '/evaluate', search: '?panel=plan' });
    expect(result.current.workspace.plan.draft).toBe(draft);
    expect(result.current.workspace.plan.draft?.expenses).toBe('180000');
    act(() => result.current.navigate(-1));
    expect(result.current.workspace.plan.draft).toBeNull();
    expect(result.current.workspace.api.document.plan.currentExpenses?.[0]?.amount).toBe(120000);
  });

  it('目标高级步骤往返说明继续保留改动，取消恢复父目标草稿', () => {
    const { result } = renderHook(() => useFinanceWorkspace(), { wrapper: navigationWrapper() });
    act(() => result.current.openGoal('passive-vs-income'));
    act(() => result.current.goal.change('name', '我的目标草稿'));
    act(() => result.current.enterGoalSide('left'));
    act(() => result.current.goal.change('leftBasis', 'real'));
    act(() => result.current.nav.help('goal-amount-basis'));
    expect(result.current.goal.draft?.leftBasis).toBe('real');
    act(() => result.current.nav.returnFromGuide());
    expect(result.current.nav.step).toBe('left');
    expect(result.current.goal.draft?.leftBasis).toBe('real');
    act(() => result.current.closeEditor());
    expect(result.current.nav.step).toBe('');
    expect(result.current.goal.draft).toMatchObject({ name: '我的目标草稿', leftBasis: 'nominal' });
    act(() => result.current.closeEditor());
    expect(result.current.goal.draft).toBeNull();
    expect(result.current.api.document.goals).toEqual(fixtureDocument().goals);
  });
});
