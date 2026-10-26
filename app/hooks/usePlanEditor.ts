import { useMemo, useRef, useState } from 'react';
import { trackEvent } from '../analytics';
import { planSchema, createMetricContext, evaluateMetric, metricPreset, type Plan } from '../../src/index';
import { field, flowDraft, growthFields, inputText, parseFlow, readNumber, type Draft, type Errors } from '../model/forms';
import { monthLabel, numberText } from '../model/format';
import type { EditorModel, PlanFieldId, SectionModel } from '../ui/types';
import { useFinanceDocument } from './useFinanceDocument';
import { previewGoal } from './useFinanceResults';
import { incomeDraft, incomeDuration, incomePrefix, incomeScheduleModel, incomeStageDraft, parseIncomeDraft, planAnalyticsField } from '../model/income-schedule';

/** 生成计划编辑草稿，不填充示例财务数值，喵~ */
export function planDraft(plan: Plan): Draft {
  return { assets: inputText(plan.initialAssets), inflation: inputText(plan.inflationRate, 100),
    returnRate: inputText(plan.investmentReturn?.annualRate, 100),
    horizon: String(plan.horizonMonths), budgetKind: plan.retirementBudget.kind,
    ...incomeDraft(plan), ...flowDraft('expenses', plan.currentExpenses, { kind: 'inflation' }),
    ...flowDraft('external', plan.externalIncome, { kind: 'fixed' }),
    ...flowDraft('budget', plan.retirementBudget.kind === 'custom' ? plan.retirementBudget.flow : plan.currentExpenses, { kind: 'inflation' }) };
}

/** 将计划草稿转换并校验为核心接口，保留可选参数的缺失状态，喵~ */
export function parsePlanDraft(draft: Draft, source: Plan): { value: Plan | null; errors: Errors } {
  const errors: Errors = {};
  const initialAssets = readNumber(draft, 'assets', errors);
  const rate = readNumber(draft, 'returnRate', errors, true, 100);
  const inflationRate = readNumber(draft, 'inflation', errors, true, 100);
  const horizon = readNumber(draft, 'horizon', errors, false);
  if (initialAssets !== null && initialAssets < 0) errors.assets = '资产不能为负数';
  if (rate !== null && rate <= -1) errors.returnRate = '收益率必须大于 -100%';
  if (inflationRate !== null && inflationRate <= -1) errors.inflation = '通胀率必须大于 -100%';
  if (horizon === null || !Number.isInteger(horizon) || horizon < 1 || horizon > 1200) errors.horizon = '最多向后预测 1～1200 个月';
  const budget = draft.budgetKind === 'custom' ? parseFlow(draft, 'budget', errors) : null;
  if (draft.budgetKind === 'custom' && budget === null) errors.budget = '请输入自由后预算';
  const candidate = { ...source, initialAssets, inflationRate, horizonMonths: horizon,
    investmentReturn: rate === null ? null : { annualRate: rate },
    activeIncome: parseIncomeDraft(draft, errors), currentExpenses: parseFlow(draft, 'expenses', errors), externalIncome: parseFlow(draft, 'external', errors),
    retirementBudget: draft.budgetKind === 'custom' ? { kind: 'custom', flow: budget } : { kind: 'current' } };
  const parsed = planSchema.safeParse(candidate);
  return { value: parsed.success && Object.keys(errors).length === 0 ? parsed.data : null, errors };
}

/** 管理同一页面的计划草稿、预览与提交，取消不会修改正式方案，喵~ */
export function usePlanEditor() {
  const api = useFinanceDocument();
  const editedFields = useRef(new Set<string>());
  const initialEdited = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [targetField, setTargetField] = useState<PlanFieldId | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [initialExpense, setInitialExpense] = useState('');
  const initial = useMemo(() => parsePlanDraft({ ...planDraft(api.document.plan), expenses: initialExpense }, api.document.plan), [api.document.plan, initialExpense]);
  const initialTarget = useMemo(() => initial.value && initial.value.currentExpenses !== null
    ? evaluateMetric(createMetricContext(initial.value), metricPreset('freedom-capital')) : null, [initial.value]);
  const parsed = useMemo(() => draft ? parsePlanDraft(draft, api.document.plan) : { value: null, errors: {} }, [draft, api.document.plan]);
  const preview = useMemo(() => parsed.value ? previewGoal({ ...api.document, plan: parsed.value }, api.document.preferences.primaryGoalId ?? '') : null, [parsed.value, api.document]);
  const incomeSchedule = draft ? incomeScheduleModel(draft, parsed.errors) : null;
  /** 开始一次独立的计划编辑会话，喵~ */
  function begin(fieldId?: PlanFieldId) { editedFields.current.clear(); setDraft(planDraft(api.document.plan.currentExpenses === null && initialExpense && initial.value ? initial.value : api.document.plan)); setTargetField(fieldId); setSubmitError(undefined); }
  /** 每次编辑会话按固定业务字段记录一次，喵~ */
  function trackEdit(id: string) {
    const name = planAnalyticsField(id);
    if (!editedFields.current.has(name)) {
      editedFields.current.add(name); trackEvent('plan_field_edit', { field_name: name, entry_point: 'plan' });
    }
  }
  /** 修改输入时保留字符串中间态，切换年月单位保持有效期限，喵~ */
  function change(id: string, value: string) {
    if (!draft || !Object.hasOwn(draft, id) || draft[id] === value) return;
    trackEdit(id);
    setDraft((previous) => {
      if (!previous) return previous;
      const next = { ...previous, [id]: value };
      if (id.startsWith('income') && id.endsWith('Unit')) {
        const index = Array.from({ length: Number(previous.incomeStageCount) }, (_, i) => i).find((i) => `${incomePrefix(i)}Unit` === id)!;
        const errors: Errors = {};
        const months = incomeDuration(previous, index, errors);
        if (months !== null && Object.keys(errors).length === 0) next[`${incomePrefix(index)}Duration`] = String(value === 'years' ? months / 12 : months);
      }
      return next;
    });
    setSubmitError(undefined);
  }
  /** 添加需要用户填写金额的新阶段，不推测未来收入，喵~ */
  function addIncomeStage() {
    if (!draft || !incomeSchedule?.canAdd) return;
    const count = Number(draft.incomeStageCount);
    trackEdit('incomeSchedule');
    setDraft({ ...draft, ...incomeStageDraft(null, count), incomeStageCount: String(count + 1) }); setSubmitError(undefined);
  }
  /** 移除后续阶段并重新连续编号，首段金额始终保留，喵~ */
  function removeIncomeStage(id: string) {
    if (!draft) return;
    const prefixes = Array.from({ length: Number(draft.incomeStageCount) }, (_, index) => incomePrefix(index));
    if (!prefixes.slice(1).includes(id)) return;
    const next = Object.fromEntries(Object.entries(draft).filter(([key]) => !key.startsWith('income')));
    prefixes.filter((prefix) => prefix !== id).forEach((prefix, index) => {
      for (const suffix of ['', 'Growth', 'Rate', 'Mode', 'Duration', 'Unit']) next[`${incomePrefix(index)}${suffix}`] = draft[`${prefix}${suffix}`]!;
    });
    next.incomeStageCount = String(prefixes.length - 1);
    trackEdit('incomeSchedule'); setDraft(next); setSubmitError(undefined);
  }
  /** 提交有效草稿并返回是否完成，喵~ */
  function save() {
    if (!parsed.value) return false;
    const error = api.commit({ ...api.document, plan: parsed.value });
    setSubmitError(error ?? undefined);
    if (error) return false;
    const before = planDraft(api.document.plan);
    const after = planDraft(parsed.value);
    const changed = [...new Set([...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]
      && !(after.budgetKind === 'current' && ['budget', 'budgetGrowth', 'budgetRate'].includes(key))).map(planAnalyticsField))];
    changed.forEach((key) => trackEvent('plan_field_save', { field_name: key }));
    trackEvent('plan_save', { changed_fields: changed.length });
    setDraft(null); setTargetField(undefined); return true;
  }
  /** 取消整次会话并放弃尚未保存的所有配置，喵~ */
  function cancel() { setDraft(null); setTargetField(undefined); }
  let model: EditorModel | null = null;
  if (draft) {
    const errors = parsed.errors;
    const f = (id: string, label: string, extra = {}) => field(draft, errors, id, label, extra);
    const growth = (prefix: string, name: string) => growthFields(draft, errors, prefix).map((item) => ({ ...item,
      label: item.id === `${prefix}Growth` ? `${name}增长方式` : `${name}年增长率` }));
    const compactGrowth = (prefix: string, name: string) => growth(prefix, name).map((item) => ({ ...item, hint: undefined }));
    const amountSlider = { min: 0, max: 1000000, step: 1000 };
    const horizon = readNumber(draft, 'horizon', {}, false);
    const horizonHint = `${horizon !== null && Number.isInteger(horizon) && horizon >= 1 && horizon <= 1200 ? `相当于 ${numberText(horizon / 12)} 年。` : ''}查找首次达成目标的时间上限；超期表示期内未达成。`;
    const sections: SectionModel[] = [{ id: 'core-controls', fields: [f('assets', '当前可投资资产', { unit: '元', slider: { min: 0, max: 10000000, step: 10000 } }),
        f('income', '税后年主动收入', { unit: '元/年', slider: amountSlider }),
        f('expenses', '当前年支出', { unit: '元/年', slider: amountSlider }),
        f('returnRate', '年化总收益率', { unit: '%', hint: '默认 5%；填写未扣通胀的预期年化总收益率。', slider: { min: -20, max: 30, step: 0.1 } }),
        f('inflation', '年通胀率', { unit: '%', hint: '默认 2%；0% 表示不计通胀；留空表示未设置。', slider: { min: -5, max: 10, step: 0.1 } })] },
        { id: 'expense-growth', title: '支出增长', layout: 'growth', fields: compactGrowth('expenses', '支出'),
          note: '自定义增长是独立的名义年增长率，不额外叠加通胀。' },
        { id: 'external', title: '其他被动收入', layout: 'compact', fields: [f('external', '其他年被动收入（税费后）', { unit: '元/年', hint: '当前持续收取的资产池外税后收入，例如未计入资产池的房产净租金、养老金。资产池内投资收益已计入总收益，不重复填写。' }), ...growth('external', '其他被动收入')],
          note: '每月按当月年额 ÷ 12 计入结余和资产，并纳入总被动收入。资本目标仅在勾选抵扣其他被动收入时减少门槛。' },
        { id: 'budget', title: '自由后生活预算', layout: 'compact', fields: [f('budgetKind', '自由后预算来源', { kind: 'select', options: [{ value: 'current', label: '引用当前支出' }, { value: 'custom', label: '单独设置' }] }),
          ...(draft.budgetKind === 'custom' ? [f('budget', '自由后年支出', { unit: '元/年' }), ...growth('budget', '自由后预算')] : [])],
          note: '引用时沿用当前支出的金额和增长规则。' },
        { id: 'horizon', title: '预测期限', layout: 'compact', fields: [f('horizon', '最多向后预测', { unit: '个月', hint: horizonHint })] },
        { id: 'amount-basis', layout: 'compact', fields: [], note: `金额基准 · ${monthLabel(api.document.plan.baseMonth)}` }];
    model = { title: '我的计划', sections, canSave: !!parsed.value, saveLabel: '完成并保存',
      targetName: preview?.targetName ?? api.document.goals.find((goal) => goal.id === api.document.preferences.primaryGoalId)?.name,
      ...(preview ? { preview: preview.hero, rows: preview.rows, notices: preview.notices } : {}), ...(submitError || !parsed.value ? { error: submitError ?? '请修正输入；缺失的可选参数可以留空。' } : {}) };
  }
  return { model, draft, parsed, targetField, incomeSchedule,
    /** 添加后续收入阶段，前段必须已有有效有限期限，喵~ */
    addIncomeStage,
    /**
     * 移除指定后续收入阶段，修改只保留在当前草稿，喵~
     * @param id 当前编辑会话的阶段标识，喵~
     */
    removeIncomeStage,
    /**
     * 初始化独立计划草稿并记录本次卡片定位目标，喵~
     * @param fieldId 需要短暂高亮的字段，省略时从表单顶部开始，喵~
     */
    begin, change, save, cancel,
    initialField: field({ expenses: initialExpense }, initial.errors, 'expenses', '当前年支出', { unit: '元' }),
    initialTarget: initialTarget?.status === 'available' ? numberText(initialTarget.value / 10000) : '—',
    changeInitialExpense(value: string) {
      if (value !== initialExpense && !initialEdited.current) { initialEdited.current = true; trackEvent('plan_field_edit', { field_name: 'expenses', entry_point: 'onboarding' }); }
      setInitialExpense(value);
    } };
}
