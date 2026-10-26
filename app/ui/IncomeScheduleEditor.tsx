import type { IncomeScheduleProps } from './types';
import { Button, FormField, HelpLink, SectionHeader } from './primitives';
import s from './ui.module.css';

/** 展示连续收入阶段，合法性和月份边界均由计划编辑器提供，喵~ */
export function IncomeScheduleEditor({ model, onChange, onAdd, onRemove }: IncomeScheduleProps) {
  return <section className={s.stack} aria-label="收入阶段">
    <SectionHeader title="收入阶段" />
    <p className={s.caption}>从方案基准月起计算。各段金额按该阶段开始时的名义年收入填写。</p>
    {model.stages.map((stage) => <section key={stage.id} className={s.compactSection} aria-label={stage.title}>
      <SectionHeader title={stage.title}>{stage.canRemove && <HelpLink onClick={() => onRemove(stage.id)}>删除{stage.title}</HelpLink>}</SectionHeader>
      <p className={s.caption}>{stage.period}</p>
      {stage.fields.map((field) => <FormField key={field.id} field={field} onChange={onChange} />)}
    </section>)}
    <p className={s.caption} aria-live="polite">{model.note}</p>
    <Button secondary disabled={!model.canAdd} onClick={onAdd}>＋ 添加下一阶段</Button>
  </section>;
}
