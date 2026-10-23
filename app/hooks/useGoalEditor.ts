import { useMemo, useState } from 'react';
import { COMPONENT_LABELS, METRIC_PRESET_NAMES, createDefaultGoals, describeMetric, goalSchema, metricSchema, metricPreset, type Goal, type MetricSpec, type MetricPresetId } from '../../src/index';
import { basisOptions, field, inputText, readNumber, type Draft, type Errors } from '../model/forms';
import type { EditorModel, FieldModel, SectionModel } from '../ui/types';
import { useFinanceDocument } from './useFinanceDocument';
import { previewGoal } from './useFinanceResults';

const components = Object.keys(COMPONENT_LABELS) as (keyof typeof COMPONENT_LABELS)[];

/** 将指标结构展开成可编辑字段，不丢失自定义组成项，喵~ */
function metricDraft(metric: MetricSpec, side: string): Draft {
  return { [`${side}Kind`]: metric.kind, [`${side}Basis`]: metric.basis,
    [`${side}Window`]: metric.kind === 'flow' ? metric.aggregation : 'next-12-months',
    [`${side}Withdrawal`]: metric.kind === 'required-capital' ? inputText(metric.withdrawalRate, 100) : '4',
    [`${side}Deduct`]: String(metric.kind === 'required-capital' && metric.deductExternalIncome),
    [`${side}Reserve`]: String(metric.kind !== 'required-capital' || metric.includeReserve),
    ...Object.fromEntries(components.map((component) => [`${side}:${component}`, String(metric.kind === 'flow' && metric.components.includes(component))])) };
}

/** 创建目标草稿，金额阈值币值与指标统计币值分别保存，喵~ */
export function goalDraft(goal: Goal): Draft {
  return { id: goal.id, name: goal.name, rightType: goal.right.kind, ratio: String(goal.ratio), comparison: goal.comparison,
    amount: goal.right.kind === 'amount' ? String(goal.right.amount) : '', amountBasis: goal.right.kind === 'amount' ? goal.right.basis : 'nominal',
    amountUnit: goal.right.kind === 'amount' ? goal.right.unit : 'capital', ...metricDraft(goal.left, 'left'),
    ...metricDraft(goal.right.kind === 'metric' ? goal.right.metric : metricPreset('assets'), 'right') };
}

/** 解析指标草稿，具体合法性仍由财务核心 schema 检查，喵~ */
function parseMetric(draft: Draft, side: string, errors: Errors): unknown {
  const kind = draft[`${side}Kind`];
  const basis = draft[`${side}Basis`];
  if (kind === 'flow') return { kind, basis, aggregation: draft[`${side}Window`], components: components.filter((part) => draft[`${side}:${part}`] === 'true') };
  if (kind === 'required-capital') return { kind, basis, withdrawalRate: readNumber(draft, `${side}Withdrawal`, errors, false, 100), deductExternalIncome: draft[`${side}Deduct`] === 'true', includeReserve: draft[`${side}Reserve`] === 'true' };
  return { kind, basis };
}

/** 在输入不完整时也能验证单位和窗口的兼容性，喵~ */
function metricShape(metric: MetricSpec) {
  return { unit: metric.kind === 'assets' || metric.kind === 'required-capital' ? 'capital' : 'annual-flow',
    frame: metric.kind === 'flow' ? metric.aggregation : metric.kind === 'asset-growth' ? 'next-12-months' : 'point', basis: metric.basis } as const;
}

/** 按完整口径匹配指标，组成项的勾选顺序不影响预设识别，喵~ */
function sameMetric(left: MetricSpec, right: MetricSpec): boolean {
  if (left.kind !== right.kind || left.basis !== right.basis) return false;
  if (left.kind === 'flow' && right.kind === 'flow') return left.aggregation === right.aggregation
    && left.components.length === right.components.length && left.components.every((part) => right.components.includes(part));
  if (left.kind === 'required-capital' && right.kind === 'required-capital') return left.withdrawalRate === right.withdrawalRate
    && left.deductExternalIncome === right.deductExternalIncome && left.includeReserve === right.includeReserve;
  return true;
}

/** 独立读取一侧，另一侧暂时不兼容时仍能显示当前选择，喵~ */
function selectedMetric(draft: Draft, side: string): MetricSpec | null {
  const errors: Errors = {};
  const result = metricSchema.safeParse(parseMetric(draft, side, errors));
  return result.success && !Object.keys(errors).length ? result.data : null;
}

/** 完整匹配默认预设；修改币值、统计窗口或组成后显示为自定义，喵~ */
function selectedPreset(draft: Draft, side: string): MetricPresetId | '' {
  const metric = selectedMetric(draft, side);
  return metric ? (Object.keys(METRIC_PRESET_NAMES) as MetricPresetId[]).find((id) => sameMetric(metric, metricPreset(id))) ?? '' : '';
}

/** 普通选择和高级编辑使用同一份真实选中状态，喵~ */
function presetField(draft: Draft, errors: Errors, side: string, label: string): FieldModel {
  return field(draft, errors, `${side}Preset`, label, { kind: 'select', value: selectedPreset(draft, side),
    options: [{ value: '', label: '自定义指标', disabled: true }, ...Object.entries(METRIC_PRESET_NAMES).map(([value, name]) => ({ value, label: name }))] });
}

/** 展示已配置口径，不依赖完整目标通过验证，喵~ */
function metricSummary(draft: Draft, side: string): string {
  const metric = selectedMetric(draft, side);
  return metric ? describeMetric(metric) : '指标配置不完整，请打开高级设置调整。';
}

/** 名称和标识可自由修改，模板仅由实际计算配置决定，喵~ */
function selectedTemplate(draft: Draft): string {
  const left = selectedMetric(draft, 'left');
  const right = selectedMetric(draft, 'right');
  const errors: Errors = {};
  const ratio = readNumber(draft, 'ratio', errors, false);
  if (!left || Object.keys(errors).length) return '';
  if (draft.rightType === 'amount') return left.kind === 'assets' && draft.amountUnit === 'capital'
    && ratio === 1 && draft.comparison === 'scenario' ? 'amount' : '';
  if (!right) return '';
  return createDefaultGoals().find((goal) => goal.right.kind === 'metric' && sameMetric(left, goal.left)
    && sameMetric(right, goal.right.metric) && ratio === goal.ratio && draft.comparison === goal.comparison)?.id ?? '';
}

/** 将两侧的具体不兼容项呈现给用户，喵~ */
function compatibilityErrors(left: ReturnType<typeof metricShape>, right: ReturnType<typeof metricShape>): string[] {
  const units = { capital: '资本金额（元）', 'annual-flow': '年流量（元/年）' };
  const frames = { point: '时点金额', annualized: '当月年化水平', 'next-12-months': '未来 12 个月合计' };
  const bases = { nominal: '名义金额', real: '基准月购买力' };
  const errors: string[] = [];
  if (left.unit !== right.unit) errors.push(`两侧指标需要使用相同单位：左侧为${units[left.unit]}，右侧为${units[right.unit]}。`);
  if (left.frame !== right.frame) errors.push(`两侧指标需要使用相同统计窗口：左侧为${frames[left.frame]}，右侧为${frames[right.frame]}。`);
  if (left.basis !== right.basis) errors.push(`两侧指标需要使用相同统计币值：左侧为${bases[left.basis]}，右侧为${bases[right.basis]}。`);
  return errors;
}

/** 校验草稿结构及目标两侧语义，喵~ */
export function parseGoalDraft(draft: Draft): { value: Goal | null; errors: Errors; error?: string } {
  const errors: Errors = {};
  const candidate = { id: draft.id, name: draft.name, left: parseMetric(draft, 'left', errors),
    right: draft.rightType === 'amount' ? { kind: 'amount', amount: readNumber(draft, 'amount', errors, false), unit: draft.amountUnit, basis: draft.amountBasis }
      : { kind: 'metric', metric: parseMetric(draft, 'right', errors) },
    ratio: readNumber(draft, 'ratio', errors, false), comparison: draft.comparison };
  const result = goalSchema.safeParse(candidate);
  if (!result.success || Object.keys(errors).length) return { value: null, errors, error: result.success ? '请修正目标输入' : result.error.issues.map((issue) => issue.message).join('；') };
  const goal = result.data;
  const left = metricShape(goal.left);
  if (goal.right.kind === 'metric') {
    const right = metricShape(goal.right.metric);
    const mismatches = compatibilityErrors(left, right);
    if (mismatches.length) return { value: null, errors, error: mismatches.join(' ') };
  } else if (left.unit !== goal.right.unit) return { value: null, errors, error: `金额目标需要与左侧指标使用相同单位：请选择${left.unit === 'capital' ? '资本金额（元）' : '年流量（元/年）'}。` };
  return { value: goal, errors };
}

/** 生成指标编辑的受控控件数据，喵~ */
function metricFields(draft: Draft, errors: Errors, side: string): FieldModel[] {
  const fields = [presetField(draft, errors, side, '选择预设口径'),
    field(draft, errors, `${side}Kind`, '指标类型', { kind: 'select', options: [{ value: 'assets', label: '可投资资产' }, { value: 'flow', label: '收入 / 支出组成' }, { value: 'asset-growth', label: '资产总增量' }, { value: 'required-capital', label: '生活预算所需资本' }] }),
    field(draft, errors, `${side}Basis`, '统计币值', { kind: 'choice', options: basisOptions })];
  if (draft[`${side}Kind`] === 'flow') fields.push(field(draft, errors, `${side}Window`, '统计范围', { kind: 'select', options: [{ value: 'next-12-months', label: '未来 12 个月逐期合计' }, { value: 'annualized', label: '当月年化水平' }] }),
    ...components.map((component) => field(draft, errors, `${side}:${component}`, COMPONENT_LABELS[component], { kind: 'checkbox' })));
  if (draft[`${side}Kind`] === 'required-capital') fields.push(field(draft, errors, `${side}Withdrawal`, '提取率', { unit: '%' }), field(draft, errors, `${side}Deduct`, '扣除其他被动收入（税费后）', { kind: 'checkbox' }), field(draft, errors, `${side}Reserve`, '计入剩余有限义务准备金', { kind: 'checkbox' }));
  return fields;
}

/** 管理目标新增、预览、子口径编辑、复制删除和主目标选择，喵~ */
export function useGoalEditor() {
  const api = useFinanceDocument();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [parentDraft, setParentDraft] = useState<Draft | null>(null);
  const [side, setSide] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const parsed = useMemo(() => draft ? parseGoalDraft(draft) : { value: null, errors: {} }, [draft]);
  const preview = useMemo(() => {
    if (!parsed.value) return null;
    const goals = [...api.document.goals.filter((item) => item.id !== parsed.value!.id), parsed.value];
    return previewGoal({ ...api.document, goals }, parsed.value.id);
  }, [parsed.value, api.document]);
  /** 打开已有目标或创建一个独立的新目标草稿，喵~ */
  function begin(id?: string, initialSide = '') {
    const goal = api.document.goals.find((item) => item.id === id);
    const initial = goal ?? { ...createDefaultGoals()[0]!, id: crypto.randomUUID() };
    setDraft(goalDraft(initial)); setIsNew(!goal); setSide(initialSide); setParentDraft(initialSide ? goalDraft(initial) : null); setSubmitError(undefined);
  }
  /** 修改普通字段或以预设替换选中的一侧，喵~ */
  function change(id: string, value: string) {
    setDraft((previous) => {
      if (!previous) return previous;
      if (id === 'leftPreset' || id === 'rightPreset') return Object.hasOwn(METRIC_PRESET_NAMES, value)
        ? { ...previous, ...metricDraft(metricPreset(value as MetricPresetId), id === 'leftPreset' ? 'left' : 'right') } : previous;
      if (id === 'template') {
        if (value === 'amount') return { ...goalDraft({ id: previous.id!, name: '我的金额目标', left: metricPreset('assets'), right: { kind: 'amount', amount: 0, unit: 'capital', basis: 'nominal' }, ratio: 1, comparison: 'scenario' }), amount: '' };
        const template = createDefaultGoals().find((item) => item.id === value);
        return template ? goalDraft({ ...template, id: previous.id! }) : previous;
      }
      return { ...previous, [id]: value };
    }); setSubmitError(undefined);
  }
  /** 保存进入口径子步骤前的草稿，喵~ */
  function enterSide(next: string) { if (draft) setParentDraft({ ...draft }); setSide(next); }
  /** 放弃子步骤的改动，喵~ */
  function cancelSide() { if (parentDraft) setDraft(parentDraft); setSide(''); setParentDraft(null); }
  /** 确认子步骤只更新目标草稿，喵~ */
  function confirmSide() { setSide(''); setParentDraft(null); }
  /** 保存完整目标；新增第一个目标时同时设为主目标，喵~ */
  function save() {
    if (!parsed.value) return false;
    const goals = isNew ? [...api.document.goals, parsed.value] : api.document.goals.map((goal) => goal.id === parsed.value!.id ? parsed.value! : goal);
    const error = api.commit({ ...api.document, goals, preferences: { ...api.document.preferences, primaryGoalId: api.document.preferences.primaryGoalId ?? parsed.value.id } });
    setSubmitError(error ?? undefined); if (error) return false; setDraft(null); return true;
  }
  /** 复制当前草稿为待保存目标，不提前写入正式文档，喵~ */
  function duplicate() { if (draft) { setDraft({ ...draft, id: crypto.randomUUID(), name: `${draft.name}（副本）` }); setIsNew(true); } }
  /** 删除目标并原子修复主目标引用，喵~ */
  function remove() {
    if (!draft || isNew) return;
    const goals = api.document.goals.filter((goal) => goal.id !== draft.id);
    api.commit({ ...api.document, goals, preferences: { ...api.document.preferences, primaryGoalId: api.document.preferences.primaryGoalId === draft.id ? goals[0]?.id ?? null : api.document.preferences.primaryGoalId } }); setDraft(null);
  }
  /** 先保存目标编辑，再将其设为主目标，喵~ */
  function makePrimary() {
    if (!parsed.value) return false;
    const goals = isNew ? [...api.document.goals, parsed.value] : api.document.goals.map((goal) => goal.id === parsed.value!.id ? parsed.value! : goal);
    const error = api.commit({ ...api.document, goals, preferences: { ...api.document.preferences, primaryGoalId: parsed.value.id } });
    setSubmitError(error ?? undefined); if (error) return false; setDraft(null); return true;
  }
  /** 取消编辑并释放未提交的草稿，喵~ */
  function cancel() { setDraft(null); setSide(''); setParentDraft(null); }
  let model: EditorModel | null = null;
  if (draft) {
    const f = (id: string, label: string, extra = {}) => field(draft, parsed.errors, id, label, extra);
    const sections: SectionModel[] = side ? [{ id: side, fields: metricFields(draft, parsed.errors, side), help: 'total-return', note: '统计口径会参与计算；展示币值切换不会修改这里。' }] : [
      { id: 'name', fields: [f('name', '目标名称', { kind: 'text' }), f('template', '目标模板', { kind: 'select', value: selectedTemplate(draft), options: [{ value: '', label: '自定义目标', disabled: true }, ...createDefaultGoals().map((item) => ({ value: item.id, label: item.name })), { value: 'amount', label: '固定金额 / 购买力目标' }] })] },
      { id: 'left', title: '自定义左侧口径', destination: 'left', summary: '高级设置', fields: [presetField(draft, parsed.errors, 'left', '要达成的指标')], note: metricSummary(draft, 'left'), help: 'passive-income' },
      { id: 'right-kind', fields: [f('rightType', '达到或超过', { kind: 'choice', options: [{ value: 'metric', label: '另一个指标' }, { value: 'amount', label: '指定金额' }] })] },
      ...(draft.rightType === 'metric' ? [{ id: 'right', title: '自定义右侧口径', destination: 'right', summary: '高级设置', fields: [presetField(draft, parsed.errors, 'right', '比较目标')], note: metricSummary(draft, 'right'), help: 'active-surplus' }] : [{ id: 'amount', fields: [f('amount', '目标金额', { unit: draft.amountUnit === 'capital' ? '元' : '元/年' }), f('amountUnit', '金额单位', { kind: 'select', options: [{ value: 'capital', label: '资本金额' }, { value: 'annual-flow', label: '年流量' }] }), f('amountBasis', '目标金额含义', { kind: 'choice', options: [{ value: 'nominal', label: '固定名义金额' }, { value: 'real', label: '保持购买力' }] })], help: 'goal-amount-basis' }]),
      { id: 'ratio', title: '比较规则', collapsed: true, fields: [f('ratio', '比较比例', { unit: '倍' }), f('comparison', '消费评估时的比较门槛', { kind: 'select', options: [{ value: 'baseline', label: '参照当前计划同月门槛' }, { value: 'scenario', label: '跟随项目后的目标变化' }] })], help: 'comparison-baseline' },
    ];
    const sideErrors: Errors = {};
    const sideValid = side ? metricSchema.safeParse(parseMetric(draft, side, sideErrors)).success && Object.keys(sideErrors).length === 0 : false;
    const leftPreset = selectedPreset(draft, 'left');
    const rightPreset = selectedPreset(draft, 'right');
    const leftName = leftPreset ? METRIC_PRESET_NAMES[leftPreset] : '自定义左侧指标';
    const rightName = draft.rightType === 'amount' ? `${draft.amount || '待填写金额'} ${draft.amountUnit === 'capital' ? '元' : '元/年'}`
      : rightPreset ? METRIC_PRESET_NAMES[rightPreset] : '自定义右侧指标';
    model = { title: side ? '选择指标口径' : '配置目标', targetName: draft.name, sections, canSave: side ? sideValid : !!parsed.value, saveLabel: side ? '确认口径' : '保存目标',
      ...(!side ? { equation: `${leftName} ≥ ${rightName} × ${draft.ratio || '待填写比例'}` } : {}),
      ...(preview ? { preview: preview.hero, rows: preview.rows } : {}), ...(submitError || parsed.error ? { error: submitError ?? parsed.error } : {}) };
  }
  return { model, draft, side, isNew, begin, change, enterSide, cancelSide, confirmSide, save, duplicate, remove, makePrimary, cancel };
}
