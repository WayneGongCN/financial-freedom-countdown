import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Action, ChangeProps, FieldModel, HeroModel, Option, RowModel, Tone } from './types';
import s from './ui.module.css';
import { followAppLink } from './SeoContent';

interface ClickProps {
  /** 点击后通知容器执行对应动作，喵~ */
  onClick: Action;
}

/** 显示主次按钮并使用原生按钮语义，喵~ */
export function Button({ children, onClick, secondary = false, disabled = false }: ClickProps & { children: ReactNode; secondary?: boolean; disabled?: boolean }) {
  return <button type="button" className={`${s.button} ${secondary ? s.secondary : ''}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

/** 显示具有足够触控区域的辅助入口，喵~ */
export function HelpLink({ children = '口径说明 ↗', onClick, href, danger = false }: ClickProps & { children?: ReactNode; href?: string; danger?: boolean }) {
  if (href) return <a className={`${s.link} ${danger ? s.negative : ''}`} href={href} onClick={event => followAppLink(event, onClick)}>{children}</a>;
  return <button type="button" className={`${s.link} ${danger ? s.negative : ''}`} onClick={onClick}>{children}</button>;
}

/** 只渲染传入选项，键盘切换不包含任何业务判断，喵~ */
export function ChoiceGroup({ label, value, options, onSelect }: { label: string; value: string; options: Option[];
  /**
   * 通知调用方选中值，喵~
   * @param value 选项标识，喵~
   */
  onSelect: (value: string) => void;
}) {
  return <div role="radiogroup" aria-label={label} className={s.choices}>{options.map((option, index) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} disabled={option.disabled} className={s.choice}
    onClick={() => onSelect(option.value)} onKeyDown={(event) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      const next = options[(index + direction + options.length) % options.length]!;
      if (!next.disabled) {
        onSelect(next.value);
        const controls = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
        controls?.[(index + direction + options.length) % options.length]?.focus();
      }
    }}>{option.label}</button>)}</div>;
}

/** 绑定输入标签和错误信息，原样上报字符串草稿，喵~ */
export function TextField({ field, onChange }: ChangeProps & { field: FieldModel }) {
  const generated = useId();
  const id = `${generated}-${field.id}`;
  return <div className={s.field}><label className={s.fieldBox} htmlFor={id}><span className={s.fieldLabel} id={`${id}-label`}>{field.label}</span><span className={s.inputLine}>
    <input id={id} value={field.value} type={field.kind === 'month' ? 'month' : 'text'} inputMode={field.kind === 'number' ? 'decimal' : undefined} placeholder="未填写" disabled={field.disabled}
      aria-labelledby={`${id}-label`} aria-invalid={!!field.error} aria-describedby={field.error || field.hint ? `${id}-description` : undefined} onChange={(event) => onChange(field.id, event.target.value)} />
    {field.unit && <span className={s.unit}>{field.unit}</span>}</span></label>
    {(field.error || field.hint) && <p id={`${id}-description`} className={field.error ? s.error : s.caption}>{field.error ?? field.hint}</p>}</div>;
}

/** 读取滑块可展示的有限十进制数，空白和输入中间态继续保留在文本框中，喵~ */
function sliderNumber(value: string): number | null {
  const text = value.trim().replaceAll(',', '');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) && Number.isFinite(Number(text)) ? Number(text) : null;
}

/** 将精确输入与滑块绑定到同一草稿，手输扩展区间且拖动时不收缩范围，喵~ */
export function SliderField({ field, onChange }: ChangeProps & { field: FieldModel & { slider: NonNullable<FieldModel['slider']> } }) {
  const id = useId();
  const [range, setRange] = useState(field.slider);
  const numeric = sliderNumber(field.value);
  const valid = numeric !== null && !field.error;
  if (valid && (numeric < range.min || numeric > range.max)) {
    setRange({ ...range, min: Math.min(range.min, numeric), max: Math.max(range.max, numeric) });
  }
  const value = valid ? Math.max(range.min, Math.min(range.max, numeric)) : Math.max(range.min, Math.min(range.max, 0));
  return <div className={s.sliderField}>
    <TextField field={field} onChange={onChange} />
    <input id={id} className={s.slider} type="range" min={range.min} max={range.max} step={range.step} value={value}
      aria-label={`${field.label}滑块`} aria-valuetext={valid ? `${field.value}${field.unit ?? ''}` : '未填写有效数值，拖动以设置'}
      disabled={field.disabled} onChange={(event) => onChange(field.id, event.target.value)} />
  </div>;
}

/** 将已准备好的字段按控件类别呈现，不解析字段业务含义，喵~ */
export function FormField({ field, onChange }: ChangeProps & { field: FieldModel }) {
  const id = useId();
  if (field.slider) return <SliderField field={{ ...field, slider: field.slider }} onChange={onChange} />;
  if (field.kind === 'choice') return <div className={s.group}><span className={s.fieldLabel}>{field.label}</span><ChoiceGroup label={field.label} value={field.value} options={field.options ?? []} onSelect={(value) => onChange(field.id, value)} />{(field.error || field.hint) && <p className={field.error ? s.error : s.caption}>{field.error ?? field.hint}</p>}</div>;
  if (field.kind === 'checkbox') return <label className={s.checkbox}><input type="checkbox" checked={field.value === 'true'} disabled={field.disabled} onChange={(event) => onChange(field.id, String(event.target.checked))} />{field.label}</label>;
  if (field.kind === 'select') return <div className={s.field}><label className={s.fieldLabel} htmlFor={id}>{field.label}</label><select id={id} value={field.value} disabled={field.disabled} className={s.select} onChange={(event) => onChange(field.id, event.target.value)}>{field.options?.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select>{(field.error || field.hint) && <p className={field.error ? s.error : s.caption}>{field.error ?? field.hint}</p>}</div>;
  return <TextField field={field} onChange={onChange} />;
}

/** 展示已格式化的主结果与语义颜色，喵~ */
export function HeroValue({ label, value, unit, tone = 'neutral', note }: HeroModel) {
  return <div className={s.hero}><p className={s.heroLabel}>{label}</p><div className={s.number}><strong className={`${s.heroValue} ${s[tone]}`}>{value}</strong>{unit && <span className={s.heroUnit}>{unit}</span>}</div>{note && <p className={s.caption}>{note}</p>}</div>;
}

/** 展示紧凑的关键金额，颜色由调用方指定，喵~ */
export function MetricValue({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: Tone }) {
  return <div className={s.metric}><span className={s.heroLabel}>{label}</span><div className={s.number}><strong className={`${s.metricValue} ${s[tone]}`}>{value}</strong><span className={s.unit}>{unit}</span></div></div>;
}

/** 显示标签与已格式化的值，喵~ */
export function KeyValueRow({ label, value, tone = 'neutral' }: RowModel) {
  return <div className={s.row}><span>{label}</span><span className={s[tone]}>{value}</span></div>;
}

/** 显示容器提供的标准化进度，喵~ */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className={s.track} role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className={s.fill} style={{ width: `${value}%` }} /></div>;
}

/** 提供通用信息卡片，喵~ */
export function Notice({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return <div className={s.notice} role={alert ? 'alert' : undefined}>{children}</div>;
}

/** 用原生披露控件管理纯展示展开状态，喵~ */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return <details className={s.disclosure} open={defaultOpen || undefined}><summary><span>{title}</span><svg className={s.disclosureIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary><div className={s.stack}>{children}</div></details>;
}

/** 组合分区标题与可选操作，喵~ */
export function SectionHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <div className={s.section}><h2>{title}</h2>{children}</div>;
}

/** 建立独立滚动区域与固定导航，不读取路由，喵~ */
export function AppLayout({ children, header, navigation, scrollRef }: { children: ReactNode; header: ReactNode; navigation: ReactNode; scrollRef: RefObject<HTMLElement | null> }) {
  return <div className={s.shell} onClickCapture={(event) => {
    // 统一触屏浏览器的按钮焦点行为，保证弹层能够恢复触发元素，喵~
    if (event.target instanceof Element) event.target.closest<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }}><header className={s.header}>{header}</header><main ref={scrollRef} className={s.scroll} id="main-content">{children}</main>{navigation}</div>;
}

/** 根据传入选中项显示导航，喵~ */
export function BottomNav({ active, onSelect }: { active: string;
  /**
   * 请求切换主页面，喵~
   * @param page 页面标识，喵~
   */
  onSelect: (page: string) => void;
}) {
  return <nav className={s.nav} aria-label="主导航">{[{ id: '/', label: '总览' }, { id: '/evaluate', label: '评估' }].map((item) => <a key={item.id} href={item.id} aria-current={active === item.id ? 'page' : undefined} onClick={event => followAppLink(event, () => onSelect(item.id))}>{item.label}</a>)}</nav>;
}

/** 使用原生模态对话框提供焦点约束和关闭后的焦点恢复，喵~ */
export function BottomSheet({ open, title, children, footer, summary, onClose, onBack }: { open: boolean; title: string; children: ReactNode; footer?: ReactNode; summary?: ReactNode;
  /** 请求取消当前面板，组件不提交业务数据，喵~ */
  onClose: Action;
  /** 请求返回上一级面板，喵~ */
  onBack?: Action;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const label = useId();
  /** 同步模态显示并恢复触发元素的焦点，喵~ */
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, [open]);
  return <dialog ref={dialog} className={s.dialog} aria-labelledby={label} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary, [tabindex="0"]')]
      .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className={s.dialogHeader}>{onBack && <HelpLink onClick={onBack}>‹ 返回</HelpLink>}<h2 id={label}>{title}</h2><HelpLink onClick={onClose}>取消</HelpLink></header>
    {summary && <div className={s.dialogSummary}>{summary}</div>}
    <div className={s.dialogContent}>{children}</div>{footer && <footer className={s.dialogFooter}>{footer}</footer>}
  </dialog>;
}
