import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { compareProject, createDefaultGoals, createPlan, type Project } from '../src/index';
import { CarCase } from '../app/ui/CarCase';

it('公开买车案例的达标月份与资产路径可由财务模型复算', () => {
  const plan = createPlan('2026-11', {
    initialAssets: 600000, inflationRate: 0.02, investmentReturn: { annualRate: 0.05 },
    activeIncome: [{ amount: 240000, growth: { kind: 'inflation' }, durationMonths: null }],
    currentExpenses: [{ amount: 120000, growth: { kind: 'inflation' }, durationMonths: null }],
  });
  const purchase: Project = {
    id: 'car', name: '公开买车案例', notes: '',
    cashFlows: [{ id: 'price', kind: 'expense', amount: 150000, growth: { kind: 'fixed' },
      priceAnchorMonth: 0, startMonth: 0, endMonth: null, frequency: 'once', continuesAfterFreedom: true }],
  };
  const ownership: Project = {
    ...purchase, cashFlows: [...purchase.cashFlows, { id: 'running', kind: 'expense', amount: 1000,
      growth: { kind: 'inflation' }, priceAnchorMonth: 0, startMonth: 1, endMonth: null,
      frequency: 'monthly', continuesAfterFreedom: true }],
  };
  const goal = createDefaultGoals()[2]!;
  const priceOnly = compareProject(plan, [goal], purchase);
  const withRunningCost = compareProject(plan, [goal], ownership);
  const { container } = render(<CarCase />);
  const results = [...container.querySelectorAll('#car-case-results tbody tr')];
  const forecasts = [priceOnly.goals[0]!.baseline, priceOnly.goals[0]!.scenario, withRunningCost.goals[0]!.scenario];
  forecasts.forEach((forecast, index) => {
    expect(forecast.status).toBe('reached');
    const months = forecast.firstMonth!;
    const text = months % 12 === 0 ? `${months / 12} 年` : `${Math.floor(months / 12)} 年 ${months % 12} 个月`;
    expect(results[index]!.querySelector('td')!.textContent).toBe(text);
  });
  expect(results[1]!.lastElementChild!.textContent).toBe(`${priceOnly.goals[0]!.delayMonths} 个月`);
  expect(results[2]!.lastElementChild!.textContent).toBe(`${withRunningCost.goals[0]!.delayMonths} 个月`);
  const paths = [priceOnly.baseline, priceOnly.scenario, withRunningCost.scenario];
  const pathRows = [...container.querySelectorAll('#car-case-paths tbody tr')];
  [0, 60, 120, 170].forEach((month, index) => {
    const amounts = paths.map(path => (path.rows[month]!.assets / path.rows[month]!.priceIndex! / 10000).toFixed(2));
    expect([...pathRows[index]!.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(amounts);
  });
});
