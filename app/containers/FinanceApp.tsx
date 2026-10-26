import { useFinanceWorkspace } from '../hooks/useFinanceWorkspace';
import { guideTopics } from '../model/guide';
import { AppLayout, BottomNav, BottomSheet, Button, Disclosure, HelpLink } from '../ui/primitives';
import { EditorPreview, EvaluationView, GoalEditorView, GuideView, OverviewView, PlanEditorView, StorageNotice } from '../ui/views';
import s from '../ui/ui.module.css';
import { PublicContent } from '../ui/SeoContent';
import { seoPages, seoPath } from '../seo';

/** 将页面、编辑业务 Hook 与纯展示组件连接起来，喵~ */
export function FinanceApp() {
  const { api, nav, plan, goal, project, transfer, results, openPlan, openGoal, changeBasis, savePlan, saveGoal, closeEditor, importFile, enterGoalSide, removeGoal, makePrimary, reset } = useFinanceWorkspace();

  return <AppLayout scrollRef={nav.scrollRef} header={<><h1>{seoPages[seoPath(nav.location.pathname) ?? '/'].heading}</h1><HelpLink href={nav.guide ? undefined : '/guide'} onClick={nav.guide ? nav.returnFromGuide : () => nav.help()}>{nav.guide ? '‹ 返回' : '口径说明 ↗'}</HelpLink></>}
    navigation={nav.guide ? null : <BottomNav active={nav.location.pathname} onSelect={nav.go} />}>
    {api.error && <div style={{ padding: '12px 24px' }}><StorageNotice message={api.error} blocked={api.blocked} onRetry={api.retrySave} onReset={reset} /></div>}
    {api.notice && <p className={s.caption} role="status" style={{ padding: '12px 24px' }}>{api.notice}</p>}
    {nav.guide ? <GuideView topics={guideTopics} active={nav.anchor} onHelp={nav.help} /> : nav.location.pathname === '/evaluate'
      ? <EvaluationView model={results.evaluation} sections={project.sections} timingRows={project.timingRows} canAdd={project.canAdd} onChange={project.change} onHelp={nav.help} onBasisChange={changeBasis}
        onAddExpense={() => project.add('expense')} onAddIncome={() => project.add('active-income')} onRemove={project.remove} onClear={project.clear} onEditPlan={openPlan} />
      : <OverviewView model={results.overview} initialField={plan.initialField} initialTarget={plan.initialTarget} onInitialExpense={plan.changeInitialExpense} onHelp={nav.help} onEditPlan={openPlan} onEditGoal={(id) => openGoal(id ?? api.document.preferences.primaryGoalId ?? undefined)} onAddGoal={() => openGoal()} onEvaluate={() => nav.go('/evaluate')} />}
    {!nav.guide && <PublicContent evaluation={nav.location.pathname === '/evaluate'} onNavigate={path => path === '/guide' ? nav.help() : nav.go(path)} />}
    <BottomSheet open={!nav.guide && nav.panel === 'plan' && !!plan.model} title={plan.model?.title ?? '我的计划'} onClose={closeEditor}
      summary={plan.model && <EditorPreview model={plan.model} />}
      footer={<Button onClick={savePlan} disabled={!plan.model?.canSave}>{plan.model?.saveLabel ?? '完成并保存'}</Button>}>
      {plan.model && <div className={s.stack}><PlanEditorView model={plan.model} targetField={plan.targetField} active={!nav.guide && nav.panel === 'plan'} onChange={plan.change} onHelp={nav.help} />
        <Disclosure title="本地数据与备份"><p className={s.caption}>只保存于当前浏览器。导出文件包含你的财务数据，请妥善保管。</p><Button secondary onClick={transfer.download}>导出正式方案</Button><label className={s.caption}>导入 JSON 备份<input className={s.file} type="file" accept="application/json,.json" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>{transfer.message && <p className={s.caption} role="status">{transfer.message}</p>}</Disclosure>
      </div>}
    </BottomSheet>
    <BottomSheet open={!nav.guide && nav.panel === 'goal' && !!goal.model} title={goal.model?.title ?? '配置目标'} onClose={closeEditor} {...(goal.side ? { onBack: closeEditor } : {})}
      summary={goal.model && <EditorPreview model={goal.model} />}
      footer={<Button onClick={saveGoal} disabled={!goal.model?.canSave}>{goal.model?.saveLabel ?? '保存目标'}</Button>}>
      {goal.model && <div className={s.stack}><GoalEditorView model={goal.model} onChange={goal.change} onHelp={nav.help} onStep={enterGoalSide} />
        {!goal.side && <><Button secondary disabled={!goal.model.canSave} onClick={makePrimary}>保存并设为主目标</Button><Button secondary onClick={goal.duplicate}>复制为新目标</Button>{!goal.isNew && <HelpLink onClick={removeGoal}>删除目标</HelpLink>}</>}
      </div>}
    </BottomSheet>
  </AppLayout>;
}
