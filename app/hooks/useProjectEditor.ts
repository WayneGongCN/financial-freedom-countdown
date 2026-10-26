import { useEffect, useMemo, useRef, useState } from 'react';
import { cashAmount, projectSchema, reserveSchedule, type CashFlow, type Plan, type Project } from '../../src/index';
import { field, growthDraft, growthFields, inputText, parseGrowth, readNumber, type Draft, type Errors } from '../model/forms';
import { monthAt, monthLabel, monthOffset, numberText } from '../model/format';
import type { SectionModel } from '../ui/types';
import { useFinanceDocument } from './useFinanceDocument';
import { trackEvent } from '../analytics';

export interface ProjectDraft { id: string; name: string; notes: string; flows: Draft[] }

/** 创建一笔明确收付方向的待填写现金流，喵~ */
function emptyFlow(plan: Plan, kind: CashFlow['kind'] = 'expense'): Draft {
  return { id: crypto.randomUUID(), kind, amount: '', frequency: kind === 'expense' ? 'once' : 'monthly', start: monthAt(plan.baseMonth, kind === 'expense' ? 0 : 1), end: '', anchor: 'base', continues: 'true', ...growthDraft('amount', { kind: 'fixed' }) };
}

/** 从持久化项目恢复可编辑文本，喵~ */
export function projectDraft(project: Project | null, plan: Plan): ProjectDraft {
  return project ? { id: project.id, name: project.name, notes: project.notes,
    flows: project.cashFlows.map((flow) => ({ id: flow.id, kind: flow.kind, amount: inputText(flow.amount), frequency: flow.frequency,
      start: monthAt(plan.baseMonth, flow.startMonth), end: flow.endMonth === null ? '' : monthAt(plan.baseMonth, flow.endMonth), anchor: flow.priceAnchorMonth === 0 ? 'base' : 'start', continues: String(flow.continuesAfterFreedom), ...growthDraft('amount', flow.growth) })) }
    : { id: crypto.randomUUID(), name: '我的消费评估', notes: '', flows: [emptyFlow(plan)] };
}

/** 校验多笔现金流草稿，所有月份均以保存的方案基准计算，喵~ */
export function parseProjectDraft(draft: ProjectDraft, plan: Plan): { value: Project | null; errors: Record<string, Errors>; error?: string } {
  const errors: Record<string, Errors> = {};
  const cashFlows = draft.flows.map((flow) => {
    const issue: Errors = {};
    const amount = readNumber(flow, 'amount', issue, false);
    const startMonth = monthOffset(plan.baseMonth, flow.start ?? '');
    const endMonth = flow.frequency === 'once' || !flow.end ? null : monthOffset(plan.baseMonth, flow.end);
    if (!Number.isInteger(startMonth) || startMonth < 0 || startMonth > 1200) issue.start = '发生月份必须在基准月及之后的 1200 个月内';
    if (endMonth !== null && (!Number.isInteger(endMonth) || endMonth < startMonth || endMonth > 1200)) issue.end = '结束月份不能早于开始月或超过 1200 个月';
    if (amount !== null && amount < 0) issue.amount = '金额不能为负数';
    const growth = parseGrowth(flow, 'amount', issue);
    errors[flow.id!] = issue;
    return { id: flow.id, kind: flow.kind, amount, frequency: flow.frequency, startMonth, endMonth,
      priceAnchorMonth: flow.anchor === 'start' ? startMonth : 0, growth, continuesAfterFreedom: flow.continues === 'true' };
  });
  const result = projectSchema.safeParse({ id: draft.id, name: draft.name, notes: draft.notes, cashFlows });
  const hasErrors = Object.values(errors).some((issue) => Object.keys(issue).length > 0);
  if (hasErrors || !result.success) return { value: null, errors, error: '完善项目金额与时间后显示试算结果；原计划不会改变。' };
  return { value: result.data, errors };
}

/** 管理单个试算项目，有效修改仅保存项目配置，不应用到基础计划，喵~ */
export function useProjectEditor(active = true) {
  const api = useFinanceDocument();
  const { plan, project } = api.document;
  const [draft, setDraft] = useState(() => projectDraft(project, plan));
  const [saveError, setSaveError] = useState<string | undefined>();
  const [revision, setRevision] = useState(0);
  const editedFields = useRef(new Set<string>());
  useEffect(() => { editedFields.current.clear(); setRevision(0); }, [active]);
  const lastSaved = useRef(JSON.stringify(project));
  const baseMonth = useRef(plan.baseMonth);
  /** 导入或重置方案时同步项目草稿，自身提交不覆盖正在输入的原始文本，喵~ */
  useEffect(() => {
    const serialized = JSON.stringify(project);
    if (serialized !== lastSaved.current || baseMonth.current !== plan.baseMonth) {
      lastSaved.current = serialized; baseMonth.current = plan.baseMonth; setDraft(projectDraft(project, plan));
    }
  }, [project, plan]);
  const parsed = useMemo(() => parseProjectDraft(draft, plan), [draft, plan]);
  /** 保存有效试算，输入不完整时只保留当前内存草稿，喵~ */
  function update(next: ProjectDraft) {
    setDraft(next);
    setRevision((value) => value + 1);
    const candidate = parseProjectDraft(next, plan);
    if (candidate.value) {
      lastSaved.current = JSON.stringify(candidate.value);
      const error = api.commit({ ...api.document, project: candidate.value }); setSaveError(error ?? undefined);
    }
  }
  /** 更新某笔现金流，切换周期时修正尚未手动指定的默认开始月份，喵~ */
  function change(id: string, value: string) {
    const separator = id.indexOf('.');
    const flowId = id.slice(0, separator);
    const key = id.slice(separator + 1);
    const flow = draft.flows.find((item) => item.id === flowId);
    if (!flow || !Object.hasOwn(flow, key) || key === 'id' || flow[key] === value) return;
    if (!editedFields.current.has(key)) { editedFields.current.add(key); trackEvent('evaluation_field_edit', { field_name: key }); }
    update({ ...draft, flows: draft.flows.map((flow) => {
      if (flow.id !== flowId) return flow;
      const next = { ...flow, [key]: value };
      if (key === 'frequency' && value !== 'once' && flow.start === plan.baseMonth) next.start = monthAt(plan.baseMonth, 1);
      return next;
    }) });
  }
  /** 添加独立增收或支出草稿，不将其误作投资资产转账，喵~ */
  function add(kind: CashFlow['kind']) { if (draft.flows.length < 100) { trackEvent('evaluation_add_flow', { flow_type: kind }); update({ ...draft, flows: [...draft.flows, emptyFlow(plan, kind)] }); } }
  /** 移除一笔项目现金流并重新试算，喵~ */
  function remove(id: string) { if (!draft.flows.some((flow) => flow.id === id)) return; trackEvent('evaluation_remove_flow'); update({ ...draft, flows: draft.flows.filter((flow) => flow.id !== id) }); }
  /** 清空试算项目，基础计划及目标保持原样，喵~ */
  function clear() { trackEvent('evaluation_clear'); editedFields.current.clear(); setRevision(0); lastSaved.current = 'null'; api.commit({ ...api.document, project: null }); setDraft(projectDraft(null, plan)); setSaveError(undefined); }
  const sections: SectionModel[] = draft.flows.map((flow, index) => {
    const errors = parsed.errors[flow.id!] ?? {};
    const f = (key: string, label: string, extra = {}) => ({ ...field(flow, errors, key, label, extra), id: `${flow.id}.${key}` });
    const fields = [f('amount', flow.kind === 'expense' ? '消费金额' : flow.kind === 'expense-saving' ? '节省金额' : '额外收入', { unit: '元' }),
      f('frequency', '发生频率', { kind: 'choice', options: [{ value: 'once', label: '一次性' }, { value: 'monthly', label: '每月' }, { value: 'yearly', label: '每年' }] })];
    const details = [f('kind', '现金流类型', { kind: 'select', options: [{ value: 'expense', label: '消费支出' }, { value: 'active-income', label: '主动增收' }, { value: 'passive-income', label: '外部被动增收' }, { value: 'expense-saving', label: '节省费用' }] }),
      f('start', '首次发生月份', { kind: 'month' }), ...(flow.frequency === 'once' ? [] : [f('end', '结束月份（留空为无限期）', { kind: 'month' })]),
      f('anchor', '输入金额的报价口径', { kind: 'choice', options: [{ value: 'base', label: '基准月报价' }, { value: 'start', label: '首次发生月报价' }] }),
      ...growthFields(flow, errors, 'amount').map((item) => ({ ...item, id: `${flow.id}.${item.id}` })),
      f('continues', '自由后仍持续 / 仍需支付', { kind: 'checkbox' })];
    return { id: flow.id!, title: `第 ${index + 1} 笔现金流`, fields: [...fields, ...details], help: 'growth-rules' };
  });
  const timingRows = useMemo(() => {
    if (!parsed.value) return [];
    const first = parsed.value.cashFlows[0];
    if (!first || first.startMonth === 0) return [];
    try {
      return [{ label: `首笔付款 · ${monthLabel(monthAt(plan.baseMonth, first.startMonth))}名义金额`, value: `${numberText(cashAmount(first, plan, first.startMonth))} 元` },
        { label: `第 ${Math.min(12, plan.horizonMonths)} 个月需预留（名义）`, value: `${numberText(reserveSchedule(plan, parsed.value)[Math.min(12, plan.horizonMonths)])} 元` }];
    } catch { return [{ label: '未来付款', value: '补齐增长假设后可计算' }]; }
  }, [parsed.value, plan]);
  return { draft, revision, sections, parsed, timingRows, change, add, remove, clear, canAdd: draft.flows.length < 100, error: saveError ?? parsed.error };
}
