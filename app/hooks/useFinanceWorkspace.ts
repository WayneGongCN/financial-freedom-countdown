import { useEffect } from 'react';
import { useFinanceDocument } from './useFinanceDocument';
import { useFinanceNavigation } from './useFinanceNavigation';
import { useFinanceResults } from './useFinanceResults';
import { usePlanEditor } from './usePlanEditor';
import { useGoalEditor } from './useGoalEditor';
import { useProjectEditor } from './useProjectEditor';
import { useDataTransfer } from './useDataTransfer';

/** 协调编辑会话与导航，向页面容器提供完整交互接口，喵~ */
export function useFinanceWorkspace() {
  const api = useFinanceDocument();
  const nav = useFinanceNavigation();
  const plan = usePlanEditor();
  const goal = useGoalEditor();
  const project = useProjectEditor();
  const transfer = useDataTransfer();
  const results = useFinanceResults(api.document, project.parsed.value, project.error);

  /** 同步刷新、浏览器后退和深链接进入编辑器的生命周期，喵~ */
  useEffect(() => {
    if (nav.guide) return;
    if (nav.panel === 'plan') {
      if (!plan.draft) plan.begin();
    } else if (plan.draft) plan.cancel();
    if (nav.panel === 'goal') {
      if (!goal.draft) { goal.begin(nav.goalId, nav.step); }
      else if (!nav.step && goal.side) goal.cancelSide();
      else if (nav.step && nav.step !== goal.side) goal.enterSide(nav.step);
    } else if (goal.draft) goal.cancel();
    // 编辑器回调由本次路由同步使用；草稿变动不重新初始化会话，喵~
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.guide, nav.panel, nav.step, nav.goalId]);

  /** 打开计划面板并初始化独立草稿，喵~ */
  function openPlan() { plan.begin(); nav.openPanel('plan'); }
  /** 打开目标编辑或新增面板，喵~ */
  function openGoal(id?: string) { goal.begin(id); nav.openPanel('goal', id); }
  /** 显示偏好只更新文档偏好字段，喵~ */
  function changeBasis(value: string) { api.commit({ ...api.document, preferences: { ...api.document.preferences, displayBasis: value === 'real' ? 'real' : 'nominal' } }); }
  /** 正式提交整个计划并关闭编辑器，喵~ */
  function savePlan() { if (plan.save()) nav.closePanel(); }
  /** 确认目标口径子步骤或保存完整目标，喵~ */
  function saveGoal() { if (goal.side) { goal.confirmSide(); nav.backStep(); } else if (goal.save()) nav.closePanel(); }
  /** 取消当前子步骤或整次编辑，喵~ */
  function closeEditor() {
    if (nav.panel === 'plan') plan.cancel();
    if (nav.panel === 'goal') { if (goal.side) { goal.cancelSide(); nav.backStep(); return; } goal.cancel(); }
    nav.closePanel();
  }
  /** 完成导入后取消旧文档的编辑会话，喵~ */
  async function importFile(file: File | undefined) { if (await transfer.upload(file)) { plan.cancel(); goal.cancel(); nav.closePanel(); } }

  /** 进入目标指标子步骤时同步草稿与路由，喵~ */
  function enterGoalSide(side: string) { nav.enterStep(side); }
  /** 用户确认后删除目标并关闭面板，喵~ */
  function removeGoal() { if (window.confirm('删除这个目标？')) { goal.remove(); nav.closePanel(); } }
  /** 保存当前目标并切换主目标，喵~ */
  function makePrimary() { if (goal.makePrimary()) nav.closePanel(); }
  /** 重置文档时清除所有旧编辑会话，喵~ */
  function reset() { if (transfer.reset()) { plan.cancel(); goal.cancel(); nav.closePanel(); } }
  return { api, nav, plan, goal, project, transfer, results, openPlan, openGoal, changeBasis, savePlan, saveGoal, closeEditor, importFile, enterGoalSide, removeGoal, makePrimary, reset };
}
