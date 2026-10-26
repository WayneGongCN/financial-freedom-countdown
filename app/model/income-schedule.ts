import type { IncomeStage, Plan } from '../../src/index';
import type { IncomeScheduleModel } from '../ui/types';
import { field, flowDraft, growthFields, parseFlow, readNumber, type Draft, type Errors } from './forms';

/** 保留首段原有字段标识，后续阶段使用编辑会话内的顺序标识，喵~ */
export function incomePrefix(index: number): string { return index === 0 ? 'income' : `incomeStage${index}`; }

/** 将一段收入展开成字符串草稿，年月单位仅用于编辑，喵~ */
export function incomeStageDraft(stage: IncomeStage | null, index: number): Draft {
  const prefix = incomePrefix(index);
  const months = stage?.durationMonths ?? null;
  const years = months !== null && months % 12 === 0;
  return { ...flowDraft(prefix, stage, { kind: 'fixed' }),
    [`${prefix}Mode`]: months === null ? 'open' : 'finite',
    [`${prefix}Duration`]: months === null ? '' : String(years ? months / 12 : months),
    [`${prefix}Unit`]: years || months === null ? 'years' : 'months' };
}

/** 将已保存阶段还原为唯一计划草稿，不为未知收入补金额，喵~ */
export function incomeDraft(plan: Plan): Draft {
  const stages = plan.activeIncome ?? [null];
  return Object.assign({ incomeStageCount: String(stages.length) }, ...stages.map(incomeStageDraft));
}

/** 解析完整月数并容忍十进制换算的浮点误差，不对实际零碎月份四舍五入，喵~ */
export function incomeDuration(draft: Draft, index: number, errors: Errors): number | null {
  const prefix = incomePrefix(index);
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

/** 解析全部收入阶段，仅单段不限期的空金额允许表示未知，喵~ */
export function parseIncomeDraft(draft: Draft, errors: Errors): IncomeStage[] | null {
  const count = Number(draft.incomeStageCount);
  const stages: IncomeStage[] = [];
  for (let index = 0; index < count; index++) {
    const prefix = incomePrefix(index);
    const durationMonths = incomeDuration(draft, index, errors);
    const flow = parseFlow(draft, prefix, errors);
    if (durationMonths === null && index < count - 1) errors[`${prefix}Mode`] = '只有最后一段可以不限期';
    if (flow === null) {
      if (count === 1 && durationMonths === null && !(draft[prefix] ?? '').trim()) return null;
      errors[prefix] ??= '请填写本阶段年收入，无收入请填 0';
    } else stages.push({ ...flow, durationMonths });
  }
  return stages;
}

/** 统一收入阶段埋点类别，避免传出动态阶段标识或数值，喵~ */
export function planAnalyticsField(id: string): string {
  return id.startsWith('income') && !['income', 'incomeGrowth', 'incomeRate'].includes(id) ? 'incomeSchedule' : id;
}

/** 生成专用收入编辑展示数据，月份边界和合法性不由视图计算，喵~ */
export function incomeScheduleModel(draft: Draft, errors: Errors): IncomeScheduleModel {
  const count = Number(draft.incomeStageCount);
  const ownErrors: Errors = {};
  const parsed = parseIncomeDraft(draft, ownErrors);
  let start: number | null = 1;
  const stages = Array.from({ length: count }, (_, index) => {
    const prefix = incomePrefix(index);
    const durationErrors: Errors = {};
    const months = incomeDuration(draft, index, durationErrors);
    if (Object.keys(durationErrors).length) start = null;
    const period = start === null ? '期限待填写' : months === null ? `第 ${start} 月起，不限期` : `第 ${start}～${start + months - 1} 月`;
    if (start !== null && months !== null) start += months;
    return { id: prefix, title: index === 0 ? '当前阶段' : `阶段 ${index + 1}`, period, canRemove: index > 0,
      fields: [
        ...(index > 0 ? [field(draft, errors, prefix, '阶段开始时的税后年收入', { unit: '元/年' })] : []),
        field(draft, errors, `${prefix}Mode`, '收入持续期限', { kind: 'select', options: [
          { value: 'finite', label: '指定时长' }, ...(index === count - 1 ? [{ value: 'open', label: '不限期' }] : [])] }),
        ...(draft[`${prefix}Mode`] === 'open' ? [] : [
          field(draft, errors, `${prefix}Duration`, '持续时长'),
          field(draft, errors, `${prefix}Unit`, '时间单位', { kind: 'select', options: [{ value: 'years', label: '年' }, { value: 'months', label: '月' }] })]),
        ...growthFields(draft, errors, prefix).map((item) => ({ ...item, label: item.id === `${prefix}Growth` ? '收入增长方式' : '收入年增长率', hint: undefined })),
      ] };
  });
  const open = draft[`${incomePrefix(count - 1)}Mode`] === 'open';
  return { stages, canAdd: !open && parsed !== null && Object.keys(ownErrors).length === 0,
    note: open ? '添加下一阶段前，请先为当前末段指定时长。' : start === null ? '请填写有效期限。' : `第 ${start} 月起，此后主动收入为 0。`,
  };
}
