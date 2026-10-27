import type { FlowScheduleProps } from './types';
import { Button, Disclosure, FormField, HelpLink, SectionHeader } from './primitives';
import s from './ui.module.css';

/** 展示连续收支阶段，合法性和月份边界均由计划编辑器提供，喵~ */
export function FlowScheduleEditor({ model, onChange, onAdd, onRemove }: FlowScheduleProps) {
  return <section className={s.stack} aria-label={model.title}>
    <Disclosure title={model.title}>
    <p className={s.caption}>{model.description}</p>
    {model.stages.map((stage) => <section key={stage.id} className={s.compactSection} aria-label={stage.title}>
      <SectionHeader title={stage.title}>{stage.canRemove && <HelpLink danger onClick={() => onRemove(stage.id)}>删除{stage.title}</HelpLink>}</SectionHeader>
      <p className={s.caption}>{stage.period}{stage.calendar && ` · ${stage.calendar}`}</p>
      {stage.fields.map((field) => <FormField key={field.id} field={field} onChange={onChange} />)}
    </section>)}
    <p className={s.caption} aria-live="polite">{model.note}</p>
    <Button secondary disabled={!model.canAdd} onClick={onAdd}>＋ 添加下一阶段</Button>
  </Disclosure></section>;
}
