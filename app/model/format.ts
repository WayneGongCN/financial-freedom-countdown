import type { Basis, GoalForecast, Growth, MetricResult, Plan } from '../../src/index';
import { displayMetric } from '../../src/index';
import type { HeroModel } from '../ui/types';

/** 格式化有限金额，未知值保留为空缺，喵~ */
export function numberText(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value);
}

/** 将相对月份转为不受时区偏移影响的年月，喵~ */
export function monthAt(baseMonth: string, offset: number): string {
  const [year, month] = baseMonth.split('-').map(Number);
  const total = year! * 12 + month! - 1 + offset;
  return `${Math.floor(total / 12)}-${String(total % 12 + 1).padStart(2, '0')}`;
}

/** 将明确年月转换为相对于方案基准的月份，喵~ */
export function monthOffset(baseMonth: string, value: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return NaN;
  const [year, month] = value.split('-').map(Number);
  const [baseYear, baseIndex] = baseMonth.split('-').map(Number);
  return (year! - baseYear!) * 12 + month! - baseIndex!;
}

/** 生成固定购买力基准的中文标签，喵~ */
export function monthLabel(month: string): string {
  const [year, index] = month.split('-');
  return `${year} 年 ${Number(index)} 月`;
}

/** 显示预测状态，零月份与没有预测日期分别处理，喵~ */
export function forecastHero(forecast: GoalForecast | undefined): HeroModel {
  if (!forecast) return { label: '预计还需', value: '—', note: '添加目标，开始规划你的自由时间。' };
  if (forecast.firstMonth !== null) {
    const months = forecast.firstMonth;
    if (months === 0) return { label: '当前状态', value: '已达成', tone: 'positive', note: '按当前假设测算' };
    return months >= 12 ? { label: '预计还需', value: String(Math.floor(months / 12)), unit: `年 ${months % 12} 个月` }
      : { label: '预计还需', value: String(months), unit: '个月' };
  }
  const labels: Record<GoalForecast['status'], string> = {
    reached: '已达成', 'not-reached': '测算期内尚未达到', incomplete: '补充信息后可预测', blocked: '当前计划存在资金缺口或无效假设',
    'not-applicable': '当前比较条件不适用', 'condition-only': '此规则仅展示条件', invalid: '请调整目标口径',
  };
  return { label: '预计还需', value: '—', note: `${labels[forecast.status]}${forecast.reason ? ` · ${forecast.reason}` : ''}` };
}

/** 生成列表中的紧凑倒计时文案，喵~ */
export function forecastText(forecast: GoalForecast): string {
  const hero = forecastHero(forecast);
  return hero.value === '—' ? ({ incomplete: '待补充', blocked: '无法推演', 'not-reached': '尚未达到', 'not-applicable': '不适用', 'condition-only': '条件比较', invalid: '口径不兼容', reached: '已达成' })[forecast.status]
    : `${hero.value}${hero.unit ? ` ${hero.unit}` : ''}`;
}

/** 仅换算已确定指标的显示金额，缺少换算参数时不冒充其他币值，喵~ */
export function shownMetric(result: MetricResult, plan: Plan, basis: Basis): number | null {
  if (result.status !== 'available') return null;
  try { const value = displayMetric(result, plan, basis).value; return Number.isFinite(value) ? value : null; } catch { return null; }
}

/** 描述独立增长规则，保持随通胀与固定百分比的区别，喵~ */
export function growthLabel(growth: Growth | undefined): string {
  if (!growth) return '未填写';
  return growth.kind === 'fixed' ? '固定名义金额' : growth.kind === 'inflation' ? '随通胀' : `每年 ${numberText(growth.annualRate * 100)}%`;
}
