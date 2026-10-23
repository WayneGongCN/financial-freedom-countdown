export type Tone = 'neutral' | 'positive' | 'negative';
export type Action = () => void;
export type Change = (id: string, value: string) => void;
export interface Option { value: string; label: string; disabled?: boolean }
export interface FieldModel {
  id: string; label: string; value: string; unit?: string; hint?: string; error?: string;
  kind?: 'text' | 'number' | 'month' | 'select' | 'choice' | 'checkbox';
  options?: Option[]; disabled?: boolean;
  slider?: { min: number; max: number; step: number };
}
export interface RowModel { label: string; value: string; tone?: Tone }
export interface HeroModel { label: string; value: string; unit?: string; tone?: Tone; note?: string }
export interface MilestoneModel { id: string; title: string; value: string; rule: string }
export interface SectionModel {
  id: string; title?: string; fields: FieldModel[]; help?: string; note?: string;
  destination?: string; summary?: string;
  collapsed?: boolean;
}
export interface EditorModel {
  title: string; note?: string; sections: SectionModel[]; error?: string;
  preview?: HeroModel; rows?: RowModel[]; targetName?: string; equation?: string; canSave: boolean; saveLabel?: string;
}
export interface OverviewModel {
  empty: boolean; noGoals: boolean; basis: string; basisLabel: string; canChangeBasis: boolean; title: string; titleHelp: string;
  hero: HeroModel; target: string; coverage: string; progress: number | null;
  coreMetrics: { label: string; value: string; unit: string }[];
  balances: { label: string; value: string; unit: string; tone: Tone }[];
  projected: { title: string; value: string; note: string } | null;
  assumptions: string[]; milestones: MilestoneModel[]; statusNote: string | null;
}
export interface EvaluationModel {
  hero: HeroModel; rows: RowModel[]; impactRows: RowModel[]; impactHero: HeroModel | null;
  comparisonNote: string; basis: string; basisLabel: string; canChangeBasis: boolean; error?: string;
}

export interface ChangeProps {
  /**
   * 将受控输入的原始字符串交给业务层，组件不转换单位或校验规则，喵~
   * @param id 字段标识，喵~
   * @param value 用户输入或选项值，喵~
   */
  onChange: Change;
}
export interface HelpProps {
  /**
   * 请求打开指定说明，组件不决定路由或记录业务草稿，喵~
   * @param topic 说明段落标识，喵~
   */
  onHelp: (topic: string) => void;
}
