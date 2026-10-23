import { compareProject, createPlan, createDefaultGoals } from '../dist/index.js';

const purchase = {
  id: 'purchase', name: '现在购买一万元物品', notes: '演示数据，不代表真实资产',
  cashFlows: [{ id: 'payment', kind: 'expense', amount: 10000, growth: { kind: 'fixed' },
    priceAnchorMonth: 0, startMonth: 0, endMonth: null, frequency: 'once', continuesAfterFreedom: true }],
};
const goals = [createDefaultGoals()[2]];
const rows = [];
for (const [inflation, incomeGrowth] of [[0, 0], [0.03, 0], [0.03, 0.03]]) {
  const plan = createPlan('2026-10', {
    initialAssets: 600000, inflationRate: inflation,
    investmentReturn: { annualRate: 0.08 },
    activeIncome: { amount: 240000, growth: { kind: 'custom', annualRate: incomeGrowth } },
    currentExpenses: { amount: 120000, growth: { kind: 'inflation' } },
  });
  const result = compareProject(plan, goals, purchase);
  rows.push({ 通胀: inflation, 工资增长: incomeGrowth,
    基准达成月: result.goals[0].baseline.firstMonth,
    消费后达成月: result.goals[0].scenario.firstMonth,
    延迟月数: result.goals[0].delayMonths });
}
console.table(rows);
