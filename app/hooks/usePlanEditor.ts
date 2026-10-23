import { useMemo, useState } from 'react';
import { planSchema, nominalReturn, realReturn, createMetricContext, evaluateMetric, metricPreset, type Plan } from '../../src/index';
import { field, flowDraft, growthFields, inputText, parseFlow, readNumber, type Draft, type Errors } from '../model/forms';
import { growthLabel, monthLabel, numberText } from '../model/format';
import type { EditorModel, SectionModel } from '../ui/types';
import { useFinanceDocument } from './useFinanceDocument';
import { previewGoal } from './useFinanceResults';

/** 生成计划编辑草稿，不填充示例财务数值，喵~ */
export function planDraft(plan: Plan): Draft {
  return { assets: inputText(plan.initialAssets), inflation: inputText(plan.inflationRate, 100), inflationMode: plan.inflationRate === null ? 'unknown' : plan.inflationRate === 0 ? 'zero' : 'custom',
    returnKind: plan.investmentReturn?.kind ?? 'nominal', returnRate: inputText(plan.investmentReturn?.annualRate, 100), cashYield: inputText(plan.cashYield, 100),
    horizon: String(plan.horizonMonths), budgetKind: plan.retirementBudget.kind,
    ...flowDraft('income', plan.activeIncome, { kind: 'fixed' }), ...flowDraft('expenses', plan.currentExpenses, { kind: 'inflation' }),
    ...flowDraft('external', plan.externalIncome, { kind: 'fixed' }),
    ...flowDraft('budget', plan.retirementBudget.kind === 'custom' ? plan.retirementBudget.flow : plan.currentExpenses, { kind: 'inflation' }) };
}

/** 将计划草稿转换并校验为核心接口，保留可选参数的缺失状态，喵~ */
export function parsePlanDraft(draft: Draft, source: Plan): { value: Plan | null; errors: Errors } {
  const errors: Errors = {};
  const initialAssets = readNumber(draft, 'assets', errors);
  const rate = readNumber(draft, 'returnRate', errors, true, 100);
  const inflationRate = draft.inflationMode === 'unknown' ? null : draft.inflationMode === 'zero' ? 0 : readNumber(draft, 'inflation', errors, false, 100);
  const cashYield = readNumber(draft, 'cashYield', errors, true, 100);
  const horizon = readNumber(draft, 'horizon', errors, false);
  if (initialAssets !== null && initialAssets < 0) errors.assets = '资产不能为负数';
  if (rate !== null && rate <= -1) errors.returnRate = '收益率必须大于 -100%';
  if (inflationRate !== null && inflationRate <= -1) errors.inflation = '通胀率必须大于 -100%';
  if (cashYield !== null && cashYield < 0) errors.cashYield = '现金收益率不能为负数';
  if (horizon === null || !Number.isInteger(horizon) || horizon < 1 || horizon > 1200) errors.horizon = '测算期为 1～1200 个月';
  const budget = draft.budgetKind === 'custom' ? parseFlow(draft, 'budget', errors) : null;
  if (draft.budgetKind === 'custom' && budget === null) errors.budget = '请输入自由后预算';
  const candidate = { ...source, initialAssets, inflationRate, cashYield, horizonMonths: horizon,
    investmentReturn: rate === null ? null : { kind: draft.returnKind, annualRate: rate },
    activeIncome: parseFlow(draft, 'income', errors), currentExpenses: parseFlow(draft, 'expenses', errors), externalIncome: parseFlow(draft, 'external', errors),
    retirementBudget: draft.budgetKind === 'custom' ? { kind: 'custom', flow: budget } : { kind: 'current' } };
  const parsed = planSchema.safeParse(candidate);
  return { value: parsed.success && Object.keys(errors).length === 0 ? parsed.data : null, errors };
}

/** 管理计划预览、提交与子步骤草稿，取消不会修改正式方案，喵~ */
export function usePlanEditor() {
  const api = useFinanceDocument();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [parentDraft, setParentDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [initialExpense, setInitialExpense] = useState('');
  const initial = useMemo(() => parsePlanDraft({ ...planDraft(api.document.plan), expenses: initialExpense }, api.document.plan), [api.document.plan, initialExpense]);
  const initialTarget = useMemo(() => initial.value && initial.value.currentExpenses !== null
    ? evaluateMetric(createMetricContext(initial.value), metricPreset('freedom-capital')) : null, [initial.value]);
  const parsed = useMemo(() => draft ? parsePlanDraft(draft, api.document.plan) : { value: null, errors: {} }, [draft, api.document.plan]);
  const preview = useMemo(() => parsed.value ? previewGoal({ ...api.document, plan: parsed.value }, api.document.preferences.primaryGoalId ?? '') : null, [parsed.value, api.document]);
  /** 开始一次独立的计划编辑会话，喵~ */
  function begin(initialStep = '') { const initialDraft = planDraft(api.document.plan.currentExpenses === null && initialExpense && initial.value ? initial.value : api.document.plan); setDraft(initialDraft); setParentDraft(initialStep ? { ...initialDraft } : null); setStep(initialStep); setSubmitError(undefined); }
  /** 进入子步骤时保留父草稿，喵~ */
  function enterStep(next: string) { if (draft) setParentDraft({ ...draft }); setStep(next); }
  /** 放弃当前子步骤并恢复进入前的草稿，喵~ */
  function cancelStep() { if (parentDraft) setDraft(parentDraft); setParentDraft(null); setStep(''); }
  /** 确认子步骤只更新父编辑会话，喵~ */
  function confirmStep() { setParentDraft(null); setStep(''); }
  /** 修改输入时保留字符串中间态，喵~ */
  function change(id: string, value: string) { setDraft((previous) => previous ? { ...previous, [id]: value } : previous); setSubmitError(undefined); }
  /** 提交有效草稿并返回是否完成，喵~ */
  function save() {
    if (!parsed.value) return false;
    const error = api.commit({ ...api.document, plan: parsed.value });
    setSubmitError(error ?? undefined);
    if (error) return false;
    setDraft(null); return true;
  }
  /** 取消整次会话并清理子步骤，喵~ */
  function cancel() { setDraft(null); setParentDraft(null); setStep(''); }
  let model: EditorModel | null = null;
  if (draft) {
    const errors = parsed.errors;
    const f = (id: string, label: string, extra = {}) => field(draft, errors, id, label, extra);
    let sections: SectionModel[];
    let title = '我的计划';
    if (['income', 'expenses', 'external'].includes(step)) {
      title = step === 'income' ? '收入增长' : step === 'expenses' ? '支出增长' : '外部净被动收入';
      sections = [{ id: step, fields: [...(step === 'external' ? [f('external', '外部年净被动收入', { unit: '元' })] : []), ...growthFields(draft, errors, step)], help: 'growth-rules', note: '各项收入和支出的增长规则独立设置。' }];
    } else if (step === 'budget') {
      title = '自由后生活预算';
      sections = [{ id: 'budget', fields: [f('budgetKind', '自由后预算来源', { kind: 'choice', options: [{ value: 'current', label: '引用当前支出' }, { value: 'custom', label: '单独设置' }] }),
        ...(draft.budgetKind === 'custom' ? [f('budget', '自由后年支出', { unit: '元' }), ...growthFields(draft, errors, 'budget')] : [])], note: '引用时沿用当前支出的金额和增长规则。', help: 'withdrawal-rate' }];
    } else if (step === 'assumptions') {
      title = '长期测算假设';
      let equivalent = '补齐收益和通胀后显示换算';
      try { if (parsed.value) equivalent = `${draft.returnKind === 'real' ? '名义' : '实际'}年收益率 ${numberText((draft.returnKind === 'real' ? nominalReturn(parsed.value) : realReturn(parsed.value)) * 100, 4)}%`; } catch { /* 缺失假设时保留填写提示，喵~ */ }
      sections = [{ id: 'returns', help: 'return-assumptions', fields: [f('returnKind', '收益输入口径', { kind: 'choice', options: [{ value: 'nominal', label: '名义收益' }, { value: 'real', label: '实际收益' }] }), f('returnRate', '年化总收益率', { unit: '%', hint: equivalent }),
        f('inflationMode', '通胀假设', { kind: 'select', options: [{ value: 'unknown', label: '尚未设置' }, { value: 'zero', label: '不计通胀（0%）' }, { value: 'custom', label: '自定义' }] }),
        ...(draft.inflationMode === 'custom' ? [f('inflation', '年通胀率', { unit: '%' })] : []), f('cashYield', '现金收益率', { unit: '%', hint: '已包含在总收益中，不重复计入资产。' }), f('horizon', '测算期', { unit: '个月' })] }];
    } else {
      sections = [{ id: 'assets', fields: [f('assets', '当前可投资资产', { unit: '元' }), f('income', '税后年主动收入', { unit: '元' })] },
        { id: 'income-growth', title: '收入增长', fields: [], destination: 'income', summary: growthLabel(parsed.value?.activeIncome?.growth) },
        { id: 'expenses', fields: [f('expenses', '当前年支出', { unit: '元' })] },
        { id: 'expense-growth', title: '支出增长', fields: [], destination: 'expenses', summary: growthLabel(parsed.value?.currentExpenses?.growth) },
        { id: 'budget', title: '自由后年支出', fields: [], destination: 'budget', summary: draft.budgetKind === 'current' ? '引用当前支出' : '单独设置' },
        { id: 'assumptions', title: '长期假设', fields: [], destination: 'assumptions', summary: '收益、通胀与现金收益率' },
        { id: 'external', title: '外部净被动收入', fields: [], destination: 'external', summary: `${draft.external || '—'} 元/年` }];
    }
    model = { title, note: `金额基准 · ${monthLabel(api.document.plan.baseMonth)}`, sections, canSave: !!parsed.value, saveLabel: step ? '确认并返回' : '完成并保存',
      ...(preview ? { preview: preview.hero, rows: preview.rows } : {}), ...(submitError || !parsed.value ? { error: submitError ?? '请修正输入；缺失的可选参数可以留空。' } : {}) };
  }
  return { model, draft, step, parsed, begin, enterStep, cancelStep, confirmStep, change, save, cancel,
    initialField: field({ expenses: initialExpense }, initial.errors, 'expenses', '当前年支出', { unit: '元' }),
    initialTarget: initialTarget?.status === 'available' ? numberText(initialTarget.value / 10000) : '—',
    changeInitialExpense: setInitialExpense };
}
