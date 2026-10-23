import type { Action, ChangeProps, EditorModel, EvaluationModel, FieldModel, HelpProps, OverviewModel, RowModel, SectionModel } from './types';
import { Button, ChoiceGroup, Disclosure, FormField, HelpLink, HeroValue, KeyValueRow, MetricValue, Notice, ProgressBar, SectionHeader } from './primitives';
import s from './ui.module.css';

interface BasisProps {
  /**
   * 请求切换金额显示单位，组件不改写目标，喵~
   * @param value 显示口径标识，喵~
   */
  onBasisChange: (value: string) => void;
}
const basisOptions = [{ value: 'nominal', label: '名义金额' }, { value: 'real', label: '基准月购买力' }];

/** 呈现总览及局部缺失状态，所有数值均由业务层提供，喵~ */
export function OverviewView({ model, initialField, initialTarget, onInitialExpense, onBasisChange, onHelp, onEditPlan, onEditGoal, onAddGoal, onEvaluate }: HelpProps & BasisProps & {
  model: OverviewModel;
  initialField: FieldModel;
  initialTarget: string;
  /**
   * 更新首次测算的年支出草稿，喵~
   * @param value 原始年支出输入，喵~
   */
  onInitialExpense: (value: string) => void;
  /** 打开计划编辑面板，喵~ */
  onEditPlan: Action;
  /**
   * 打开指定目标，喵~
   * @param id 目标标识，省略时打开主目标，喵~
   */
  onEditGoal: (id?: string) => void;
  /** 开始添加目标，喵~ */
  onAddGoal: Action;
  /** 打开消费评估，喵~ */
  onEvaluate: Action;
}) {
  if (model.empty) return <div className={s.content}><h2 className={s.title}>离自由，还有多远？</h2><FormField field={initialField} onChange={(_id, value) => onInitialExpense(value)} /><HeroValue label="按当前生活预算所需资本" value={initialTarget} unit="万元" /><SectionHeader title="年支出 / 4%"><HelpLink onClick={() => onHelp('withdrawal-rate')}>4% 法则 ↗</HelpLink></SectionHeader><p className={s.caption}>先按当前生活预算估算，提取率和目标口径均可调整。</p><hr className={s.divider} /><h3 className={s.sectionTitle}>再补充一点信息，看看还需要多久</h3><Button onClick={onEditPlan}>填写我的计划</Button><p className={s.caption}>数据保存在当前浏览器，无需注册。</p><Notice><HeroValue label="预计还需" value="—" /><p className={s.caption}>填写当前资产、收入与长期假设后预测时间。</p></Notice></div>;
  return <div className={s.content}>
    <div className={s.group}><ChoiceGroup label="金额显示口径" value={model.basis} options={basisOptions} onSelect={onBasisChange} /><p className={s.caption}>{model.basisLabel}</p></div>
    <SectionHeader title={<button className={s.sectionTitle} onClick={() => model.noGoals ? onAddGoal() : onEditGoal()}>{model.title}</button>}><HelpLink onClick={() => onHelp(model.titleHelp)}>{model.titleHelp === 'withdrawal-rate' ? '4% 法则 ↗' : '口径说明 ↗'}</HelpLink></SectionHeader>
    <HeroValue {...model.hero} />
    <div className={s.progressGroup}><KeyValueRow label={model.target} value={model.coverage} />{model.progress !== null && <ProgressBar value={model.progress} label="主目标完成进度" />}</div>
    <div className={s.balances}>{model.balances.map((balance) => <MetricValue key={balance.label} {...balance} />)}</div>
    {model.projected && <Notice><p className={s.caption}>{model.projected.title}</p><p className={s.subvalue}>{model.projected.value}</p><p className={s.caption}>{model.projected.note}</p></Notice>}
    <button className={s.assumptions} onClick={onEditPlan}>{model.assumptions.map((line) => <span key={line} className={s.caption}>{line}</span>)}</button>
    <SectionHeader title="里程碑"><HelpLink onClick={onAddGoal}>＋ 添加</HelpLink></SectionHeader>
    {model.milestones.map((milestone) => <button key={milestone.id} className={s.milestone} onClick={() => onEditGoal(milestone.id)}><span className={s.milestoneHead}><strong>{milestone.title}</strong><span>{milestone.value}</span></span><span className={s.caption}>{milestone.rule}</span><span className={s.divider} /></button>)}
    {model.noGoals && <Button onClick={onAddGoal}>添加第一个目标</Button>}
    <Button onClick={onEvaluate}>评估一笔消费</Button><p className={s.caption}>按当前假设测算</p>
  </div>;
}

interface SectionProps extends ChangeProps, HelpProps {
  sections: SectionModel[];
  /**
   * 请求进入指定子编辑步骤，喵~
   * @param destination 子步骤标识，喵~
   */
  onStep: (destination: string) => void;
}

/** 复用编辑器的字段布局，跳转目标由容器解释，喵~ */
export function EditorSections({ sections, onChange, onHelp, onStep }: SectionProps) {
  return <>{sections.map((section) => <section key={section.id} className={s.stack}>{section.title && (section.destination ? <button className={s.assumptions} onClick={() => onStep(section.destination!)}><KeyValueRow label={section.title} value={`${section.summary ?? ''} ›`} /></button>
    : <SectionHeader title={section.title} />)}{section.fields.map((field) => <FormField key={field.id} field={field} onChange={onChange} />)}
    {section.note && <p className={s.caption}>{section.note}</p>}{section.help && <HelpLink onClick={() => onHelp(section.help!)}>说明 ↗</HelpLink>}</section>)}</>;
}

/** 展示计划编辑草稿及明确标识的预览，喵~ */
export function PlanEditorView({ model, ...actions }: Omit<SectionProps, 'sections'> & { model: EditorModel }) {
  return <div className={s.stack}>{model.note && <p className={s.caption}>{model.note}</p>}<EditorSections sections={model.sections} {...actions} />{model.error && <Notice alert><p className={s.error}>{model.error}</p></Notice>}{model.preview && <Notice><HeroValue {...model.preview} />{model.rows?.map((row) => <KeyValueRow key={row.label} {...row} />)}<p className={s.caption}>预览尚未保存，取消不会修改当前计划。</p></Notice>}</div>;
}

/** 目标视图复用编辑布局但保持独立的业务容器入口，喵~ */
export function GoalEditorView(props: Omit<SectionProps, 'sections'> & { model: EditorModel }) { return <PlanEditorView {...props} />; }

/** 展示项目输入、共同月份归因与前后预测，喵~ */
export function EvaluationView({ model, sections, timingRows, canAdd, onChange, onHelp, onBasisChange, onAddExpense, onAddIncome, onRemove, onClear, onEditPlan }: ChangeProps & HelpProps & BasisProps & {
  model: EvaluationModel; sections: SectionModel[]; timingRows: RowModel[]; canAdd: boolean;
  /** 添加支出现金流，喵~ */
  onAddExpense: Action;
  /** 添加增收现金流，喵~ */
  onAddIncome: Action;
  /**
   * 请求移除当前试算中的一笔现金流，喵~
   * @param id 现金流标识，喵~
   */
  onRemove: (id: string) => void;
  /** 重置当前试算输入，喵~ */
  onClear: Action;
  /** 打开基准计划编辑器，喵~ */
  onEditPlan: Action;
}) {
  return <div className={s.content}><h2 className={s.title}>这笔消费，值得吗？</h2>
    {sections.map((section, index) => <section key={section.id} className={s.stack}>{index > 0 && <SectionHeader title={section.title ?? ''}><HelpLink onClick={() => onRemove(section.id)}>移除</HelpLink></SectionHeader>}
      {section.fields.slice(0, 2).map((field) => <FormField key={field.id} field={field} onChange={onChange} />)}
      <Disclosure title="时间、增长与收益设置"><p className={s.caption}>每笔现金流独立设置，金额按实际发生月份计入。</p>{section.fields.slice(2).map((field) => <FormField key={field.id} field={field} onChange={onChange} />)}<HelpLink onClick={() => onHelp('growth-rules')}>报价与增长规则 ↗</HelpLink></Disclosure>
    </section>)}
    <div className={s.row}><HelpLink onClick={onAddIncome}>{canAdd ? '＋ 添加额外收入' : '已达到现金流上限'}</HelpLink><HelpLink onClick={onAddExpense}>＋ 添加支出</HelpLink></div>
    <hr className={s.divider} />
    {model.error && <Notice alert><p className={s.caption}>{model.error}</p></Notice>}
    {timingRows.map((row) => <KeyValueRow key={row.label} {...row} />)}
    <HeroValue {...model.hero} />{model.rows.map((row) => <KeyValueRow key={row.label} {...row} />)}
    <p className={s.caption}>当前金额按方案基准月计价。试算不会改变你的基础计划。</p>
    <Disclosure title="金额影响"><div className={s.group}><ChoiceGroup label="评估金额显示口径" value={model.basis} options={basisOptions} onSelect={onBasisChange} /><p className={s.caption}>{model.basisLabel}</p></div>
      {model.impactRows.map((row) => <KeyValueRow key={row.label} {...row} />)}{model.impactHero && <HeroValue {...model.impactHero} />}<HelpLink onClick={() => onHelp('impact-decomposition')}>金额影响说明 ↗</HelpLink></Disclosure>
    <SectionHeader title="对照：当前计划"><HelpLink onClick={() => onHelp('comparison-baseline')}>说明 ↗</HelpLink></SectionHeader><p className={s.caption}>{model.comparisonNote}</p>
    <Button secondary onClick={onEditPlan}>调整当前计划</Button><HelpLink onClick={onClear}>重新试算</HelpLink>
  </div>;
}

export interface GuideTopic { id: string; title: string; paragraphs: string[] }
/** 渲染具有稳定锚点的口径说明正文，喵~ */
export function GuideView({ topics, active, onHelp }: HelpProps & { topics: GuideTopic[]; active: string }) {
  return <div className={s.content}><p className={s.caption}>{active ? '已定位到对应口径；返回后可继续原来的编辑。' : '了解每个数字的含义，再选择适合你的口径。'}</p>
    <nav className={s.guideIndex} aria-label="口径目录">{topics.map((topic) => <a key={topic.id} href={`/guide#${topic.id}`} onClick={(event) => { event.preventDefault(); onHelp(topic.id); }}>{topic.title} ↗</a>)}</nav>
    {topics.map((topic) => <section key={topic.id} id={topic.id} tabIndex={-1} className={s.guideSection}><h2>{topic.title}</h2>{topic.paragraphs.map((text) => <p key={text}>{text}</p>)}</section>)}
  </div>;
}

/** 显示存储状态及恢复操作，不接触存储本身，喵~ */
export function StorageNotice({ message, blocked, onRetry, onReset }: { message: string; blocked: boolean;
  /** 请求重试当前会话的保存，喵~ */
  onRetry: Action;
  /** 请求由用户确认重新开始，喵~ */
  onReset: Action;
}) {
  return <Notice alert><p className={s.caption}>{message}</p>{blocked ? <HelpLink onClick={onReset}>重新开始</HelpLink> : <HelpLink onClick={onRetry}>重试保存</HelpLink>}</Notice>;
}
