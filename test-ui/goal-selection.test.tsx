import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFinanceDocument } from '../app/hooks/useFinanceDocument';
import { goalDraft, parseGoalDraft, useGoalEditor } from '../app/hooks/useGoalEditor';
import type { EditorModel } from '../app/ui/types';
import { createDefaultGoals, metricPreset } from '../src/index';
import { fixtureDocument, memoryStorage, wrapperFor } from './fixtures';

/** 从展示模型读取字段，断言用户实际可见的选中状态，喵~ */
function selection(model: EditorModel | null, id: string) {
  return model?.sections.flatMap((section) => section.fields).find((field) => field.id === id);
}

describe('目标指标的直接选择', () => {
  it('父页显示两侧当前预设与完整达成关系，高级页保持真实选中值', () => {
    const { result } = renderHook(() => useGoalEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin('passive-vs-income'));
    expect(selection(result.current.model, 'leftPreset')).toMatchObject({ label: '要达成的指标', value: 'passive-total' });
    expect(selection(result.current.model, 'rightPreset')).toMatchObject({ label: '比较目标', value: 'active-income' });
    expect(selection(result.current.model, 'template')?.value).toBe('passive-vs-income');
    expect(result.current.model?.equation).toBe('总被动收入 ≥ 主动收入 × 1');
    expect(result.current.model?.sections.find((section) => section.id === 'ratio')?.collapsed).toBe(true);
    act(() => result.current.enterSide('left'));
    expect(selection(result.current.model, 'leftPreset')?.value).toBe('passive-total');
    expect(result.current.model?.equation).toBeUndefined();
  });

  it('选择一侧只修改该侧草稿，不替换另一侧或提前保存', () => {
    const { result } = renderHook(() => ({ editor: useGoalEditor(), api: useFinanceDocument() }), { wrapper: wrapperFor() });
    act(() => result.current.editor.begin('passive-vs-income'));
    const originalGoal = result.current.api.document.goals.find((goal) => goal.id === 'passive-vs-income');
    act(() => result.current.editor.change('leftPreset', 'investment-total'));
    const leftChanged = parseGoalDraft(result.current.editor.draft!).value!;
    expect(leftChanged.left).toEqual(metricPreset('investment-total'));
    expect(leftChanged.left).not.toEqual(originalGoal?.left);
    expect(leftChanged.right).toEqual(originalGoal?.right);
    expect(selection(result.current.editor.model, 'leftPreset')?.value).toBe('investment-total');
    act(() => result.current.editor.change('rightPreset', 'active-surplus'));
    const rightChanged = parseGoalDraft(result.current.editor.draft!).value!;
    expect(rightChanged.left).toEqual(leftChanged.left);
    expect(rightChanged.right).toEqual({ kind: 'metric', metric: metricPreset('active-surplus') });
    expect(result.current.api.document.goals.find((goal) => goal.id === 'passive-vs-income')).toEqual(originalGoal);
  });

  it.each([
    ['leftBasis', 'real', '基准月购买力口径'],
    ['leftWindow', 'annualized', '当月年化水平'],
    ['left:active-income', 'true', '主动收入'],
  ])('自定义 %s 后不误认预设，并显示实际摘要', (field, value, summary) => {
    const { result } = renderHook(() => useGoalEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin('passive-vs-income'));
    act(() => result.current.change(field, value));
    expect(selection(result.current.model, 'leftPreset')?.value).toBe('');
    expect(result.current.model?.sections.find((section) => section.id === 'left')?.note).toContain(summary);
    expect(selection(result.current.model, 'template')?.value).toBe('');
  });

  it.each([
    ['rightWithdrawal', '3'], ['rightDeduct', 'true'], ['rightReserve', 'false'], ['rightBasis', 'real'],
  ])('资本指标的 %s 参与完整预设匹配', (field, value) => {
    const { result } = renderHook(() => useGoalEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin('freedom-capital'));
    act(() => result.current.change(field, value));
    expect(selection(result.current.model, 'rightPreset')?.value).toBe('');
    expect(selection(result.current.model, 'template')?.value).toBe('');
  });

  it('模板忽略名称和标识，但检查完整配置与组成集合', () => {
    const document = fixtureDocument();
    const goal = document.goals[1]!;
    goal.id = 'renamed-goal'; goal.name = '我的目标';
    if (goal.left.kind === 'flow') goal.left.components.reverse();
    const { result } = renderHook(() => useGoalEditor(), { wrapper: wrapperFor(memoryStorage(document)) });
    act(() => result.current.begin('renamed-goal'));
    expect(selection(result.current.model, 'template')?.value).toBe('passive-vs-income');
    act(() => result.current.change('name', ''));
    expect(selection(result.current.model, 'template')?.value).toBe('passive-vs-income');
    act(() => result.current.change('ratio', '2'));
    expect(selection(result.current.model, 'template')?.value).toBe('');
    act(() => result.current.change('ratio', '1'));
    act(() => result.current.change('comparison', 'scenario'));
    expect(selection(result.current.model, 'template')?.value).toBe('');
  });

  it('金额模板保留参数化金额与购买力的回显', () => {
    const { result } = renderHook(() => useGoalEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin());
    act(() => result.current.change('template', 'amount'));
    expect(selection(result.current.model, 'template')?.value).toBe('amount');
    act(() => result.current.change('amount', '1000000'));
    act(() => result.current.change('amountBasis', 'real'));
    expect(selection(result.current.model, 'template')?.value).toBe('amount');
    expect(result.current.model?.equation).toContain('1000000 元 × 1');
    act(() => result.current.change('ratio', '2'));
    expect(selection(result.current.model, 'template')?.value).toBe('');
  });

  it('取消高级编辑恢复当前父草稿，不污染正式目标；深链接子步骤也可取消', () => {
    const { result } = renderHook(() => ({ editor: useGoalEditor(), api: useFinanceDocument() }), { wrapper: wrapperFor() });
    act(() => result.current.editor.begin('passive-vs-income'));
    act(() => result.current.editor.change('leftPreset', 'investment-total'));
    const parentDraft = { ...result.current.editor.draft };
    act(() => result.current.editor.enterSide('left'));
    act(() => result.current.editor.change('leftBasis', 'real'));
    act(() => result.current.editor.cancelSide());
    expect(result.current.editor.draft).toEqual(parentDraft);
    expect(selection(result.current.editor.model, 'leftPreset')?.value).toBe('investment-total');
    expect(result.current.api.document.goals[1]?.left).toEqual(metricPreset('passive-total'));
    act(() => result.current.editor.begin('passive-vs-income', 'left'));
    act(() => result.current.editor.change('leftPreset', 'active-income'));
    act(() => result.current.editor.cancelSide());
    expect(selection(result.current.editor.model, 'leftPreset')?.value).toBe('passive-total');
  });

  it('不兼容时指出具体差异，移除旧预测，仍允许先确认单侧口径', () => {
    const { result } = renderHook(() => useGoalEditor(), { wrapper: wrapperFor() });
    act(() => result.current.begin('passive-vs-income'));
    expect(result.current.model?.preview).toBeDefined();
    act(() => result.current.change('leftPreset', 'assets'));
    expect(result.current.model?.error).toContain('左侧为资本金额（元），右侧为年流量（元/年）');
    expect(result.current.model?.error).toContain('左侧为时点金额，右侧为未来 12 个月合计');
    expect(result.current.model?.preview).toBeUndefined();
    expect(result.current.model?.canSave).toBe(false);
    act(() => result.current.enterSide('left'));
    expect(result.current.model?.canSave).toBe(true);
    act(() => result.current.confirmSide());
    expect(result.current.model?.canSave).toBe(false);
    const draft = goalDraft(createDefaultGoals()[0]!);
    expect(parseGoalDraft({ ...draft, rightBasis: 'real' }).error).toContain('左侧为名义金额，右侧为基准月购买力');
  });
});
