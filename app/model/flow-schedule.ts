import type { FlowStage, Growth } from '../../src/index';
import type { FlowScheduleModel } from '../ui/types';
import { monthAt, monthLabel } from './format';
import { field, flowDraft, growthFields, parseFlow, readNumber, type Draft, type Errors } from './forms';

export type ScheduleKind = 'income' | 'expenses';
const settings = {
  income: { name: '收入', amountLabel: '税后年收入', defaultGrowth: { kind: 'fixed' }, analytics: 'incomeSchedule' },
  expenses: { name: '支出', amountLabel: '年支出', defaultGrowth: { kind: 'inflation' }, analytics: 'expenseSchedule' },
} satisfies Record<ScheduleKind, { name: string; amountLabel: string; defaultGrowth: Growth; analytics: string }>;

/** 保留首段字段标识，后续阶段使用编辑会话内的顺序标识，喵~ */
export function stagePrefix(kind: ScheduleKind, index: number): string { return index === 0 ? kind : `${kind}Stage${index}`; }

/** 将一段收支展开成字符串草稿，年月单位仅用于编辑，喵~ */
export function stageDraft(kind: ScheduleKind, stage: FlowStage | null, index: number): Draft {
  const prefix = stagePrefix(kind, index);
  const months = stage?.durationMonths ?? null;
  const years = months !== null && months % 12 === 0;
  return { ...flowDraft(prefix, stage, settings[kind].defaultGrowth),
    [`${prefix}Mode`]: months === null ? 'open' : 'finite',
    [`${prefix}Duration`]: months === null ? '' : String(years ? months / 12 : months),
    [`${prefix}Unit`]: years || months === null ? 'years' : 'months' };
}

/** 将已保存阶段还原为唯一计划草稿，不为未知收支补金额，喵~ */
export function scheduleDraft(kind: ScheduleKind, schedule: FlowStage[] | null): Draft {
  const stages = schedule ?? [null];
  return Object.assign({ [`${kind}StageCount`]: String(stages.length) }, ...stages.map((stage, index) => stageDraft(kind, stage, index)));
}

/** 解析完整月数并容忍十进制换算的浮点误差，不对实际零碎月份四舍五入，喵~ */
export function stageDuration(draft: Draft, prefix: string, errors: Errors): number | null {
  if (draft[`${prefix}Mode`] === 'open') return null;
  const key = `${prefix}Duration`;
  const value = readNumber(draft, key, errors, false);
  const months = value === null ? 0 : value * (draft[`${prefix}Unit`] === 'years' ? 12 : 1);
  const rounded = Math.round(months);
  if (rounded < 1 || rounded > 1200 || Math.abs(months - rounded) > Number.EPSILON * Math.max(1, Math.abs(months)) * 4) {
    errors[key] = '持续时间须为 1～1200 个完整月';
  }
  return rounded;
}

/** 解析阶段字段，完整计划额外要求支出末段不限期，添加阶段时仅检查局部字段，喵~ */
export function parseScheduleDraft(draft: Draft, kind: ScheduleKind, errors: Errors, complete = true): FlowStage[] | null {
  const count = Number(draft[`${kind}StageCount`]);
  const stages: FlowStage[] = [];
  for (let index = 0; index < count; index++) {
    const prefix = stagePrefix(kind, index);
    const durationMonths = stageDuration(draft, prefix, errors);
    const flow = parseFlow(draft, prefix, errors);
    if (durationMonths === null && index < count - 1) errors[`${prefix}Mode`] = '只有最后一段可以不限期';
    if (complete && kind === 'expenses' && index === count - 1 && durationMonths !== null) {
      errors[`${prefix}Mode`] = '最后一个支出阶段必须不限期，请添加后续阶段或改为不限期';
    }
    if (flow === null) {
      if (count === 1 && durationMonths === null && !(draft[prefix] ?? '').trim()) return null;
      errors[prefix] ??= `请填写本阶段${settings[kind].amountLabel}，无${settings[kind].name}请填 0`;
    } else stages.push({ ...flow, durationMonths });
  }
  return stages;
}

/** 修改原始字段并在切换年月单位时保持有效期限，喵~ */
export function changeScheduleField(draft: Draft, id: string, value: string): Draft {
  const next = { ...draft, [id]: value };
  for (const kind of ['income', 'expenses'] as const) {
    for (let index = 0; index < Number(draft[`${kind}StageCount`]); index++) {
      const prefix = stagePrefix(kind, index);
      if (id !== `${prefix}Unit`) continue;
      const errors: Errors = {};
      const months = stageDuration(draft, prefix, errors);
      if (months !== null && Object.keys(errors).length === 0) next[`${prefix}Duration`] = String(value === 'years' ? months / 12 : months);
    }
  }
  return next;
}

/** 添加金额尚未填写的不限期阶段，不推测未来收支，喵~ */
export function addScheduleStage(draft: Draft, kind: ScheduleKind): Draft {
  const count = Number(draft[`${kind}StageCount`]);
  return { ...draft, ...stageDraft(kind, null, count), [`${kind}StageCount`]: String(count + 1) };
}

/** 移除后续阶段并重新连续编号，保留首段及另一类收支草稿，喵~ */
export function removeScheduleStage(draft: Draft, kind: ScheduleKind, id: string): Draft {
  const prefixes = Array.from({ length: Number(draft[`${kind}StageCount`]) }, (_, index) => stagePrefix(kind, index));
  if (!prefixes.slice(1).includes(id)) return draft;
  const next = Object.fromEntries(Object.entries(draft).filter(([key]) => !key.startsWith(kind)));
  prefixes.filter((prefix) => prefix !== id).forEach((prefix, index) => {
    for (const suffix of ['', 'Growth', 'Rate', 'Mode', 'Duration', 'Unit']) next[`${stagePrefix(kind, index)}${suffix}`] = draft[`${prefix}${suffix}`]!;
  });
  next[`${kind}StageCount`] = String(prefixes.length - 1);
  return next;
}

/** 统一阶段埋点类别，避免传出动态阶段标识或数值，喵~ */
export function planAnalyticsField(id: string): string {
  for (const kind of ['income', 'expenses'] as const) {
    if (id.startsWith(kind) && ![kind, `${kind}Growth`, `${kind}Rate`].includes(id)) return settings[kind].analytics;
  }
  return id;
}

/** 生成共用收支编辑展示数据，局部校验控制添加，完整校验控制保存，喵~ */
export function scheduleModel(draft: Draft, kind: ScheduleKind, errors: Errors, baseMonth: string): FlowScheduleModel {
  const { name, amountLabel } = settings[kind];
  const count = Number(draft[`${kind}StageCount`]);
  const ownErrors: Errors = {};
  const parsed = parseScheduleDraft(draft, kind, ownErrors, false);
  let start: number | null = 1;
  const stages = Array.from({ length: count }, (_, index) => {
    const prefix = stagePrefix(kind, index);
    const durationErrors: Errors = {};
    const months = stageDuration(draft, prefix, durationErrors);
    if (Object.keys(durationErrors).length) start = null;
    const period = start === null ? '期限待填写' : months === null ? `第 ${start} 月起，不限期` : `第 ${start}～${start + months - 1} 月`;
    const calendar = start === null ? null : months === null ? `${monthLabel(monthAt(baseMonth, start))}起`
      : `${monthLabel(monthAt(baseMonth, start))}～${monthLabel(monthAt(baseMonth, start + months - 1))}`;
    if (start !== null && months !== null) start += months;
    return { id: prefix, title: index === 0 ? '当前阶段' : `阶段 ${index + 1}`, period, calendar, canRemove: index > 0,
      fields: [
        ...(index > 0 ? [field(draft, errors, prefix, `阶段开始时的${amountLabel}`, { unit: '元/年' })] : []),
        field(draft, errors, `${prefix}Mode`, `${name}持续期限`, { kind: 'select', options: [
          { value: 'finite', label: '指定时长' }, ...(index === count - 1 ? [{ value: 'open', label: '不限期' }] : [])] }),
        ...(draft[`${prefix}Mode`] === 'open' ? [] : [
          field(draft, errors, `${prefix}Duration`, '持续时长'),
          field(draft, errors, `${prefix}Unit`, '时间单位', { kind: 'select', options: [{ value: 'years', label: '年' }, { value: 'months', label: '月' }] })]),
        ...growthFields(draft, errors, prefix).map((item) => ({ ...item, label: item.id === `${prefix}Growth` ? `${name}增长方式` : `${name}年增长率`, hint: undefined })),
      ] };
  });
  const open = draft[`${stagePrefix(kind, count - 1)}Mode`] === 'open';
  return { title: `${name}阶段`, description: `从方案基准月起计算。各段金额按该阶段开始时的名义${amountLabel}填写，自定义增长不额外叠加通胀。`,
    stages, canAdd: !open && parsed !== null && Object.keys(ownErrors).length === 0,
    note: open ? '添加下一阶段前，请先为当前末段指定时长。'
      : kind === 'expenses' ? '最后一个支出阶段必须不限期。请添加后续生活支出；确实没有支出请填 0。'
        : start === null ? '请填写有效期限。' : `第 ${start} 月起，此后主动收入为 0。`,
  };
}
