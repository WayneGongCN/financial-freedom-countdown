import type { AnnualFlow, Growth } from '../../src/index';
import type { FieldModel, Option } from '../ui/types';

export type Draft = Record<string, string>;
export type Errors = Record<string, string>;
export const growthOptions: Option[] = [{ value: 'fixed', label: '固定名义金额' }, { value: 'inflation', label: '随通胀' }, { value: 'custom', label: '自定义增长' }];
export const basisOptions: Option[] = [{ value: 'nominal', label: '名义金额' }, { value: 'real', label: '基准月购买力' }];

/** 保留未知输入为空字符串，不将其转换为零，喵~ */
export function inputText(value: number | null | undefined, scale = 1): string {
  return value === null || value === undefined ? '' : String(Number((value * scale).toPrecision(14)));
}

/** 解析严格十进制输入并返回字段错误，喵~ */
export function readNumber(draft: Draft, id: string, errors: Errors, optional = true, scale = 1): number | null {
  const text = (draft[id] ?? '').trim().replaceAll(',', '');
  if (text === '' && optional) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text))) { errors[id] = '请输入有效数字'; return null; }
  return Number(text) / scale;
}

/** 将增长规则展开为编辑草稿，喵~ */
export function growthDraft(prefix: string, growth: Growth): Draft {
  return { [`${prefix}Growth`]: growth.kind, [`${prefix}Rate`]: growth.kind === 'custom' ? inputText(growth.annualRate, 100) : '' };
}

/** 将独立年额及增长规则转为原始表单文本，喵~ */
export function flowDraft(prefix: string, flow: AnnualFlow | null, fallback: Growth): Draft {
  return { [prefix]: inputText(flow?.amount), ...growthDraft(prefix, flow?.growth ?? fallback) };
}

/** 按互斥增长类型解析，不将随通胀保存成固定百分比，喵~ */
export function parseGrowth(draft: Draft, prefix: string, errors: Errors): Growth {
  const kind = draft[`${prefix}Growth`];
  if (kind === 'custom') {
    const rate = readNumber(draft, `${prefix}Rate`, errors, false, 100);
    if (rate !== null && rate <= -1) errors[`${prefix}Rate`] = '增长率必须大于 -100%';
    return { kind: 'custom', annualRate: rate ?? 0 };
  }
  return { kind: kind === 'inflation' ? 'inflation' : 'fixed' };
}

/** 为年额字段解析独立增长规则，喵~ */
export function parseFlow(draft: Draft, prefix: string, errors: Errors): AnnualFlow | null {
  const amount = readNumber(draft, prefix, errors);
  if (amount === null) return null;
  if (amount < 0) errors[prefix] = '金额不能为负数';
  return { amount, growth: parseGrowth(draft, prefix, errors) };
}

/** 生成只包含展示数据的字段定义，喵~ */
export function field(draft: Draft, errors: Errors, id: string, label: string, extra: Partial<FieldModel> = {}): FieldModel {
  return { id, label, value: draft[id] ?? '', kind: 'number', ...extra, ...(errors[id] ? { error: errors[id] } : {}) };
}

/** 为多个编辑场景复用增长规则控件，喵~ */
export function growthFields(draft: Draft, errors: Errors, prefix: string): FieldModel[] {
  const fields = [field(draft, errors, `${prefix}Growth`, '增长规则', { kind: 'select', options: growthOptions })];
  if (draft[`${prefix}Growth`] === 'custom') fields.push(field(draft, errors, `${prefix}Rate`, '自定义名义年增长率', { unit: '%', hint: '独立增长率，不额外叠加通胀。' }));
  return fields;
}
