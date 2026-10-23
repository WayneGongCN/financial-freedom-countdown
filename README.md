# 财富自由倒计时

React H5 应用与独立 TypeScript 财务计算核心：根据收入、支出、资产、收益和通胀假设，计算可配置里程碑，并评估消费或增收项目对资产和达成时间的影响。

包含总览、消费与增收评估、口径说明，以及计划和目标编辑面板。一个浏览器保存一个计划、多个目标和一个包含多条现金流的试算项目。没有服务端、HTTP API、账户系统或远程数据采集；字体由本地构建资源提供。示例和测试均为合成数据，首次使用不会预填示例资产或收益。

## 运行

使用 Node.js 22.16+ 和 pnpm 11.10.0，在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
# 在另一个终端验证
pnpm check
pnpm exec playwright install chromium webkit
pnpm test:e2e
pnpm demo
```

| 命令 | 用途 |
| --- | --- |
| `pnpm typecheck` | 严格 TypeScript 检查，包括测试 |
| `pnpm test` | 执行财务核心用例 |
| `pnpm test:coverage` | 用例和 V8 覆盖率检查 |
| `pnpm build` | 生成 `dist/` 中的 ESM、类型声明和 sourcemap |
| `pnpm check` | 核心和 Web 类型检查、导入边界与 Hook lint、核心覆盖率、Hook 测试、两套构建 |
| `pnpm dev` | 启动 Vite 开发页面（终端显示本地地址） |
| `pnpm build:web` | Web 产物输出到 `web-dist/`，不覆盖核心 `dist/` |
| `pnpm preview` | 预览已构建的 Web 页面 |
| `pnpm test:ui` | 编辑草稿、缓存和存储等 Hook 行为测试 |
| `pnpm test:e2e` | Chromium / WebKit 浏览器交互与响应式验证 |
| `pnpm demo` | 构建并运行三组通胀对照案例 |

覆盖率最低要求：语句、行和函数 95%，分支 90%。核心运行时只依赖 Zod，不依赖 DOM、Node 文件系统或前端框架。存储由调用方注入。

## React 应用与接入约定

应用使用 React、React Router、TypeScript、Vite 和 CSS Modules。设计变量集中在 `app/styles.css`，共享样式在 `app/ui/ui.module.css`；布局以 390 × 844 为基准，宽屏居中、最大宽度 480px。Noto Sans SC 由 npm 字体包构建为本地静态文件。

| 层 / 文件 | 职责与约束 |
| --- | --- |
| `src/` | 框架无关的财务公式、接口和持久化协议，不依赖 React |
| `app/hooks/useFinanceDocument.tsx` | Context / reducer 管理唯一正式文档、导入、提交、保存错误与重试 |
| `app/hooks/usePlanEditor.ts` | 计划单页字符串草稿、单位解析、校验、预览和统一保存 |
| `app/hooks/useGoalEditor.ts` | 模板、指标组成、窗口和币值兼容检查、复制、删除与主目标 |
| `app/hooks/useProjectEditor.ts` | 现金流草稿、日期和报价锚点、有效项目自动保存 |
| `app/hooks/useFinanceResults.ts` | 复用核心推演，分别缓存财务结果与展示 ViewModel |
| `app/hooks/useFinanceNavigation.ts` | 页面、面板步骤、说明锚点与来源滚动恢复 |
| `app/hooks/useFinanceWorkspace.ts` | 协调路由与编辑会话，提供页面交互回调 |
| `app/hooks/useDataTransfer.ts` | 文件导入导出和覆盖确认 |
| `app/model/` | 表单解析、格式化与说明文本，无财务公式副本 |
| `app/containers/` | 调用业务 Hook、传递 props、连接展示组件 |
| `app/ui/` | 纯展示组件与通用焦点交互，只接受展示数据和回调 |

展示层不能导入财务核心、业务 Hook、路由或直接操作存储，ESLint 限制这些导入，并检查 Hook 使用规则。颜色、提前/延后、缺失状态、合法性和金额口径由 Hook 返回的 ViewModel 决定；UI 不自行推算。回调参数及提交语义记录在组件 props 接口中。

- 路由为 `/`、`/evaluate`、`/guide#说明标识`；编辑面板使用 `panel`，目标编辑另外使用 `goal` 和高级指标的 `step` 查询参数，URL 不包含金额。旧计划子步骤链接会替换为同一个计划主面板链接。`vercel.json` 已为 `/evaluate` 和 `/guide` 配置 `index.html` 回退，刷新子页面时仍可加载应用。
- 初始空白计划以创建月份作为基准，默认不计通胀（0%）并显示名义金额。首页只输入年支出即可预览默认可编辑的 4% 目标，继续填写时带入草稿；资产、收入和未知收益仍明确保留空值。已有存档和导入备份的未知通胀保持原值。
- 总览同时展示年收入、年化总收益率和年支出，均进入同一个计划编辑面板。编辑首屏集中提供收入、收益率、支出和通胀的精确输入与同步滑块；收入、支出按年额调整。金额默认滑动范围为 0～100 万元/年、步长 1,000 元，收益率为 −20%～30%、通胀为 −5%～10%，百分比步长均为 0.1 个百分点；手输超范围数值会扩展区间，拖动期间范围稳定。收益率统一填写未扣通胀的预期年化总收益率。通胀填 0% 表示不计，留空表示未设置；空白仍表示未知，拖动后才生成输入值。
- 计划的资产、各项收入和支出增长、其他被动收入、自由后预算、预测期限全部平铺在“我的计划”同一个面板，四个核心滑块在前；自定义自由后预算在同页按选择展开。整次编辑共享一份草稿，点击“完成并保存”统一提交，不再进入计划子页。目标的高级指标设置仍保留子页，确认只改变目标父草稿，保存目标后才提交。
- 标题下固定展示当前目标、未保存提示与草稿预计达成时间，表单独立滚动。计划预测主目标，目标编辑预测当前目标，每次只计算正在查看的目标；无效输入隐藏旧预测并显示原因。取消、浏览器返回和 Esc 不隐式保存。说明页往返保留草稿，刷新只恢复已提交数据。
- 目标编辑首页直接选择“要达成的指标”和“比较目标”，展示“左侧 ≥ 右侧 × 比例”及不兼容原因。预设准确回显，自定义指标显示组成摘要；组成项、统计窗口和币值等通过高级设置调整。
- 评估输入即时试算，仅有效项目保存；无效输入显示错误并隐藏旧评估结果。项目不会写入基础资产或支出。支持一次性、未来、每月/每年、有限期付款，以及增收、外部收入和费用节省。
- 通胀为 0% 或未知时，总览和消费评估隐藏币值切换并统一按名义金额展示；非零通胀（包括负通胀）时允许切换。显示币值切换不改变目标定义或达成月份；当前门槛和达成月门槛分别读取核心目标结果。金额归因展示核心指定的同一参考月及其币值，缺失结果不当作零。
- 原始存储读取失败时暂停写入并保留原值；保存失败保留内存数据，可重试。有效备份导入前确认覆盖，刷新不保留未确认编辑草稿。
- 面板使用原生 `dialog` 实现模态焦点约束、Esc 关闭和焦点恢复；面板内容独立滚动，底部操作区适配动态视口及安全区。

## 部署到 Vercel

`vercel.json` 指定 Vite、Web 类型检查和构建命令，产物目录为 `web-dist/`。安装命令固定使用 `pnpm@11.10.0` 并校验锁文件，避免平台默认包管理器版本改变依赖。只发布静态前端，无服务端环境变量；`.vercel/` 关联信息、构建产物及财务备份不应提交。路由回退遵循 [Vercel Vite 文档](https://vercel.com/docs/frameworks/frontend/vite)。

```sh
pnpm dlx vercel@65.1.0 login
pnpm dlx vercel@65.1.0 --prod
```

部署后检查首页、直接访问 `/evaluate`、`/guide` 与刷新恢复。每个域名有独立的浏览器存储，本地预览数据不会自动传到线上；需要时使用应用内 JSON 导入导出。

设置 `PLAYWRIGHT_BASE_URL` 后，`pnpm test:e2e` 会直接验证指定部署，不启动本地开发服务器。测试使用隔离浏览器上下文和合成数据，不读取或修改用户浏览器里的计划。

## 设计与验收范围

视觉依据为 [Figma V2](https://www.figma.com/design/Sp9k9k4MdOuPoK2H2GkwqQ?node-id=17-187)。总览使用已获取的高保真上下文；其余页面复用同一设计 token 和已读取结构实现交互。Figma 连接器额度不足，尚未完成其余所有画板的逐屏高保真核对，不将功能测试视作这部分视觉验收。

浏览器用例覆盖完整填写、说明往返、购买力目标、消费与增收、未来付款、后退/取消，以及 320、375、390、430 和桌面宽度。自动化使用模拟视口；实体手机软键盘和设备安全区仍需真机验收。

## 快速使用

构建后可在仓库根目录通过 Node 执行以下 ESM 示例；前端接入时也使用 `src/index.ts` 的同一套导出接口。

```js
import {
  createPlan, createDefaultGoals, calculateMilestones, compareProject,
} from './dist/index.js';

const plan = createPlan('2026-10', {
  initialAssets: 600000,
  inflationRate: 0.03,
  investmentReturn: { annualRate: 0.08 },
  activeIncome: { amount: 240000, growth: { kind: 'inflation' } },
  currentExpenses: { amount: 120000, growth: { kind: 'inflation' } },
});

const goals = createDefaultGoals();
const milestones = calculateMilestones(plan, goals);

const project = {
  id: 'purchase', name: '购买一万元物品', notes: '',
  cashFlows: [{
    id: 'payment', kind: 'expense', amount: 10000,
    growth: { kind: 'fixed' }, priceAnchorMonth: 0,
    startMonth: 0, endMonth: null, frequency: 'once',
    continuesAfterFreedom: true,
  }],
};

const comparison = compareProject(plan, goals, project, {
  primaryGoalId: 'freedom-capital',
});
console.log(milestones.goals);
console.log(comparison.goals, comparison.impact);
```

`createPlan` 不为资产、通胀、投资收益、主动收入和生活支出猜测数值；未填为 `null`。其他年被动收入（税费后）默认明确为 0，退休预算默认跟随生活支出，最多向后预测默认 1,200 个月，即 100 年。工资和支出的增长方式必须分别填写。`createDocument` 创建应用新方案时明确设置 0% 通胀与名义金额展示；这不改变 `createPlan` 的未知值语义，也不会补写旧存档或导入备份的通胀。

## 文件和接口

| 文件 | 职责 / 主要导出 |
| --- | --- |
| `src/schema.ts` | Zod 严格对象校验及 `Plan`、`CashFlow`、`Project`、`MetricSpec`、`Goal`、`FinanceDocument` 类型 |
| `src/math.ts` | 收益率转换、价格指数、金额增长和币值转换 |
| `src/cash-flows.ts` | 项目收付时间、周期年化金额、剩余义务准备金、退休预算 |
| `src/projection.ts` | `simulatePlan`：月度名义资产账本 |
| `src/metrics.ts` | `createMetricContext`、`evaluateMetric`、`describeMetric`、`displayMetric` |
| `src/goals.ts` | `evaluateGoal`、`forecastGoal`、`calculateMilestones` |
| `src/comparison.ts` | `compareProject`：相同规则下的前后对比 |
| `src/presets.ts` | `metricPreset`、`createDefaultGoals`、`createPlan`、`createDocument` |
| `src/persistence.ts` | JSON 导入导出、`StorageAdapter` 和本地保存函数 |
| `src/index.ts` | 统一导出入口 |
| `examples/demo.mjs` | 可执行的通胀对照示例 |

数据接口使用判别联合，调用方根据 `kind` / `status` 分支处理；无需根据中文名称判断业务行为。公开计算入口校验输入结构，非法结构抛出 Zod 错误；业务缺失、资金不足等通过结果状态返回。基础数学和现金流辅助函数供已校验的数据使用。

## 基础计划与时间约定

| 字段 | 规则 |
| --- | --- |
| `baseMonth` | `YYYY-MM`，第 0 月，也是“今天购买力”的固定基准；重新打开方案不会改变它 |
| `currency` | MVP 仅支持 `CNY`，所有金额使用元 |
| `initialAssets` | 当前可投资资产；应排除未纳入模型的自住房、专用储备等 |
| `investmentReturn` | `{ annualRate }`，填写未扣通胀的有效年化总收益率 |
| `activeIncome` | 主动年收入与独立增长规则 |
| `currentExpenses` | 当前年支出与独立增长规则 |
| `externalIncome` | 其他年被动收入（税费后）与独立增长规则；来自资产池之外，例如未计入资产池的房产净租金、养老金，已计入资产池总收益的收入不重复填写 |
| `retirementBudget` | 跟随当前支出 `current`，或采用独立的 `custom` 年预算 |
| `horizonMonths` | 最多向后预测：首次达成时间的搜索上限，1～1,200 个月；超期只表示期内未达成 |

所有比例使用小数，例如 8% 写作 `0.08`。增长率、通胀率和总收益率必须大于 -100%；允许通缩和负收益。金额输入非负，现金流方向由业务类型决定。`null` 表示未知，0 表示用户明确填写零，两者不能互换。

第 0 月只处理立即发生的项目款项，不结算一整月工资和投资收益。第 1 月起先计算期初资产的投资损益，再加入月末净现金流。基础年收入/支出按当月增长后的年额除以 12；项目按真实指定月份收付，年度付款不会摊到每个月。

引擎额外推演 12 个月，以计算最后一个候选月的未来一年指标。`rows` 因此可超过 `horizonMonths`；发生错误或资金不足时提前结束。

## 通胀与收益如何进入计算

设第 m 月价格指数为 Bₘ，名义资产为 Aₘ，名义有效年化总收益率为 r，年通胀率为 π：

```text
Bₘ = (1 + π)^(m / 12)
月总收益率 = (1 + r)^(1 / 12) - 1
实际年收益率 = (1 + r) / (1 + π) - 1
A₀ = 初始资产 + 第 0 月项目净现金流
Aₘ = Aₘ₋₁ × (1 + 月总收益率) + 第 m 月名义净现金流
第 m 月资产的基准月购买力 = Aₘ / Bₘ
```

引擎始终以名义金额记账，直接使用输入的未扣通胀收益率。通胀影响随物价增长的金额与购买力换算，不改变已填写的收益率，也不会在资产账本中再扣一遍通胀。

每项基础流量和项目金额各自选择增长方式：

| `growth` | 金额路径 |
| --- | --- |
| `{ kind: 'fixed' }` | 名义金额固定，不随物价变化 |
| `{ kind: 'inflation' }` | 随计划通胀变化，维持相同购买力 |
| `{ kind: 'custom', annualRate: g }` | 按独立名义年增长率 g 变化，不能再叠加通胀 |

基础年额 X 在第 m 月变为 `X × (1 + g)^(m/12)`。工资不默认跟随通胀；外部收入也不默认跟随工资或生活支出。

投资总收益统一由期初可投资资产与月总收益率计算，包含资产价值涨跌，可能为负。总被动收入 = 投资总收益 + 资产池外被动收入；已计入资产池总收益的收入不能再作为外部收入重复录入。其他年被动收入填写当前已在收取的税费后净租金、养老金等，按各自增长规则推算后除以 12 进入月结余，同时参与总被动收入。资本门槛默认不抵扣这项收入，仅当目标的 `deductExternalIncome=true` 时抵扣；未来尚未开始的收入应在增收评估中明确开始月份。用户应输入统一税费口径的净额，本版本没有独立税费引擎。

## 指标与预设

指标定义包括组成项、统计时间和币值。名称仅用于显示；预设返回独立普通对象，用户可修改或复制后形成另一个目标。

| 指标 | 含义 |
| --- | --- |
| `assets` | 候选月末可投资资产 |
| `asset-growth` | 未来 12 个月末资产减候选月资产；实际口径分别折算两个时点 |
| `flow` / `annualized` | 候选月正在生效的年化水平；不含一次性项目款项 |
| `flow` / `next-12-months` | 候选月之后 12 个月的实际收付与收益逐期合计 |
| `required-capital` | 候选月长期年支出缺口 ÷ 提取率，加可选剩余义务准备金 |

流量可选组成项：主动收入、外部被动收入、投资总收益、支出、持有本金购买力调整。支出项自动以负数计入，其余项保留其计算所得符号。组成项不能重复。

实际口径的未来一年流量按**每笔发生月份**折算购买力。只将名义全年合计除以候选月价格指数，是金额显示转换，不等于重新选择实际统计口径。

实际资产增量还包括已有本金的购买力变化；不能仅把名义投资损益折算后称为实际资产增量。逐月恒等式为：

```text
实际资产增量 = 净现金流 / Bₘ + 投资总损益 / Bₘ
             + Aₘ₋₁ × (1 / Bₘ - 1 / Bₘ₋₁)
```

最后一项对应 `inflation-adjustment`，仅能用于实际口径的未来一年统计。指标值可能为负。

预设提供：可投资资产、投资总收益、总被动收入、主动收入、主动收入结余、外部净投入、资产增量、支出覆盖资本目标。两个默认被动收入目标均使用总被动收入，与主动收入结余或主动收入比较。

例如，将总被动收入与外部净投入比较：

```js
const goal = {
  id: 'custom-milestone', name: '总被动收入覆盖外部净投入',
  left: {
    kind: 'flow', basis: 'nominal', aggregation: 'next-12-months',
    components: ['investment-total', 'external-income'],
  },
  right: {
    kind: 'metric',
    metric: {
      kind: 'flow', basis: 'nominal', aggregation: 'next-12-months',
      components: ['active-income', 'external-income', 'expenses'],
    },
  },
  ratio: 1, comparison: 'baseline',
};
```

MVP 支持上述组件组合，不提供任意表达式、脚本执行或通用公式编辑器。

## 目标规则与达成时间

目标比较 `left >= right × ratio`。右侧可以是另一个指标，也可以是明确单位的固定金额：

- `basis: 'nominal'` 的固定金额：未来始终要求同一名义数额。
- `basis: 'real'` 的固定金额：未来要求相当于基准月该数额的购买力，名义门槛随 Bₘ 增长。
- 指标型目标：每个候选月份重算，生活支出上涨时支出覆盖资本目标相应变化。

资本目标计算为：

```text
Tₘ = max(自由后常态年支出ₘ - 可抵扣外部年被动收入ₘ, 0) / 提取率
     + 剩余有限义务准备金ₘ
```

默认提取率 4%，默认不扣除外部被动收入，默认包含剩余准备金；均为可编辑配置。4% 在这里是一个资本门槛参数，不能把该门槛或恒定收益推演视为退休资金安全保证。

两侧指标必须有相同单位、统计窗口和统计币值，避免用资本余额直接比较年收入。固定金额阈值会按自身币值定义转换；显示设置 `displayBasis` 不改变目标规则。`displayMetric` 只变换已计算结果的金额表达，不重新判断是否达成。

`comparison: 'baseline'` 取无项目路径同一个候选月的右侧指标，并非冻结第 0 月金额；`scenario` 取项目路径自身的右侧指标。默认收入类里程碑参照基准计划，避免增加消费、压低储蓄门槛后看起来反而“更自由”；支出覆盖目标默认跟随项目后的生活预算。

返回首次满足条件的整月 `firstMonth`，0 表示当前达成。`coverage` 为未截断的覆盖比例，可能超过 1；非正门槛不生成除零进度。两侧同源或纯投资收益比例的比较返回 `condition-only`，避免生成与资本积累无关的倒计时。

| 预测状态 | 含义 |
| --- | --- |
| `reached` | 找到首次达成月 |
| `not-reached` | 指定测算期内未达成；不等同于永远不可能 |
| `incomplete` | 所需输入或有效推演缺失 |
| `blocked` | 所需路径/统计窗口内存在资金不足、无效现金流或溢出 |
| `not-applicable` | 如用于比较的收入或储蓄门槛不为正 |
| `condition-only` | 可展示当前条件，不能提供有意义的资本积累倒计时 |
| `invalid` | 单位、窗口、预算等规则不兼容 |

只缺少资产或收益时，仍可独立计算已填写的收入和预算指标；已有资产也可独立展示。调用方应展示可用部分和缺失字段，不把未知值渲染成 0。

## 消费、增收与项目现金流

一个 `Project` 包含多条现金流，例如购置设备费用、后续维护费、设备产生的收入。最多 100 条，金额均非负，通过 `kind` 指定 `expense`、`active-income`、`passive-income`、`expense-saving`。

| 配置 | 行为 |
| --- | --- |
| `frequency` | 一次性、每月或每年；年度付款从开始月起每隔 12 个月发生 |
| `startMonth` | 首次发生月，0 可用于现在立即付款 |
| `endMonth` | 含结束月；周期现金流的 `null` 表示无限期，一次性仍只发生一次 |
| `priceAnchorMonth` | 0 表示报价按基准月币值；等于开始月表示报价按首次发生月币值 |
| `growth` | 固定合同金额、跟随通胀或独立增长 |
| `continuesAfterFreedom` | 计算资本门槛时，是否仍承担这项支出/采用该项外部收入 |

项目金额为 `amount × (1 + g)^((发生月 - 价格锚点月)/12)`：

- 现在花 1 万：第 0 月一次性支出。
- 两年后固定合同支付 1 万：第 24 月，`fixed`。
- 两年后购买相当于现在 1 万元的物品：第 24 月，锚点 0，`inflation`。
- 两年后第一次付款报价为 1 万，以后逐年涨价：锚点 24，开始月 24，周期付款及对应增长规则。

`continuesAfterFreedom` 影响退休目标的计算，不会在当前积累模拟中自动终止现金流。收益项目通过增收/节省现金流建模；普通资产池投资转账不应再记成消费，否则会重复扣减资产。MVP 不含独立资产仓位、出售估值或借贷模型。

自由后仍存在的无限期支出进入常态预算；已知但尚未开始的无限期支出也按候选月价格计入，属于提前覆盖未来生活水平的保守规则。无限期节省和外部收入在生效后才采用。主动收入和有限期收入不用于永久抵减生活资本目标。

有限期支出采用**零名义收益准备金**：将候选月之后尚未支付的名义付款逐笔相加，金额各自按增长规则计算。已支付项不重复计入；有限期支出不再除以 4% 当作永久开支。准备金在候选月转换为购买力时，整体除以 Bₘ，而不是把未来付款各自折算后直接当作当前足额储备。该规则相当于计划达成时划出专用现金；积累阶段仍使用统一资产池收益率。

节省费用不能超过对应当月支出或自由后预算。资金不足时停止预测，不会自动融资或让负资产继续按投资收益率增长。

## 前后对比及归因

`compareProject` 对两条路径使用同一份宏观假设、收益假设和目标定义，仅叠加项目现金流。分别搜索达成月份，`delayMonths = 项目后 - 基准`；负数为提前。任一侧未取得有效日期时返回 `null`，不以无限大或 0 代替。

金额归因必须使用同一个 `referenceMonth`，不能拿两条路径各自不同达成日期的资产相减。默认选主目标的基准达成月；没有该日期时采用第 120 月与测算上限的较小值。调用方可显式覆盖。

| 字段 | 正数的含义 |
| --- | --- |
| `immediateAssetReduction` | 第 0 月资产减少 |
| `netPrincipalDifferenceNominal` | 截至比较月，累计名义净投入减少 |
| `investmentReturnDifferenceNominal` | 名义资产差额减累计投入差额，即少获得的投资损益 |
| `assetDifferenceNominal` | 比较月的名义资产减少 |
| `netPrincipalDifferenceReal` | 每期净投入差额按各自发生月折算后的合计 |
| `investmentReturnDifferenceReal` | 比较月实际资产差额减上述实际净投入差额 |
| `assetDifferenceReal` | 比较月资产差额按基准月购买力表达 |
| `targetChangeAtReference` | 同一月份项目路径的目标门槛提高，沿用目标指标的币值 |
| `gapChangeAtReference` | 同一月份距离目标的缺口增加 |

归因值带符号：收益为负时，“少获得的损益”可能为负，表示消费后少承担损失。实际投资差额包含被占用本金的购买力变化，不能简单把名义复利差额除以价格指数来代替。累计名义投入是跨期账面金额合计，应明确标注；不能把它称为同一时点购买力。

两条路径若在参考月不可用，返回不可用原因。缺少通胀但名义路径可算时，名义影响仍返回，实际影响为 `null`。

## 可复现案例

当前资产 60 万元、年收入 24 万元、年支出 12 万元、名义年化总收益率 8%、提取率 4%、现在额外消费 1 万元；生活支出跟随通胀，外部收入为 0。年收入按表中假设独立增长。消费为一次性，不改变常态支出目标。

| 通胀 | 收入增长 | 不消费达成月 | 消费后达成月 | 延后 |
| --- | --- | --- | --- | --- |
| 0% | 0% | 117（9 年 9 月） | 118 | 1 月 |
| 3% | 0% | 185（15 年 5 月） | 186 | 1 月 |
| 3% | 3% | 145（12 年 1 月） | 146 | 1 月 |

初始资本门槛为 300 万元。通胀 3% 时，候选月名义门槛为 `300 万 × 1.03^(m/12)`，购买力门槛仍为基准月 300 万元；8% 名义收益对应约 4.8544% 实际年收益。三个案例的延迟整月数相同，不表示成本相同或通胀没有影响，整月首次命中有离散性。

运行 `pnpm demo` 可复现表格；测试同时验证固定合同付款、未来购买力消费、有限准备金和不同统计口径。

## 本地保存

`FinanceDocument` 保存 `schemaVersion`（当前为 `3`）、`modelVersion`（当前为 `3.0.0`）、`plan`、`goals`、单个可编辑 `project` 以及 `preferences`。偏好包含显示币值和主目标 ID。保存金额原值、价格锚点和增长规则，不保存格式化文本或计算缓存。

```js
import {
  createDocument, saveDocument, loadDocument,
  exportDocument, importAndSaveDocument,
} from './dist/index.js';

const document = createDocument('2026-10');
saveDocument(localStorage, document);
const restored = loadDocument(localStorage);
const backupJson = exportDocument(restored ?? document);
importAndSaveDocument(localStorage, backupJson);
```

此示例的 `localStorage` 由浏览器应用提供，模型模块不读取全局浏览器对象。也可注入实现 `getItem`、`setItem`、`removeItem` 的适配器。写入前完整校验；适配器必须保证单键替换失败时保留旧值。配额、权限、JSON 格式和版本错误交给调用方提示，不能吞掉或自动清空旧方案。

默认只使用 `financial-freedom-countdown.v1` 键；清除方案不会清除其他应用的数据。v1、v2 旧版方案读取或导入时升级为当前总收益模型，收益率一次换算为未扣通胀的年化收益率；保存前保留原存档。未知数据版本或模型版本拒绝导入。应用已提供导入覆盖确认、JSON 下载、保存失败重试及输入校验。入口在计划面板底部的“本地数据与备份”。

计算与展示顺序：编辑并校验计划/目标/项目 → 调用计算接口 → 根据状态展示结果 → 仅在显示层转换币值和格式化 → 保存配置。修改显示币值无需重建目标；修改工资增长、报价锚点或统计组成项则必须重新计算。进度条可在显示时限制在 0～100%，同时保留原始覆盖率数值。

## 测试范围与边界

| 用例文件 | 主要验证 |
| --- | --- |
| `test/model.test.ts` | 收益转换、月度时序、增长、一次/周期付款、准备金、缺失与资金不足 |
| `test/metrics-goals.test.ts` | 组件、统计窗口、币值、目标、部分数据、边界状态 |
| `test/comparison.test.ts` | 三组通胀案例、前后时间、收益归因和目标变化 |
| `test/persistence-validation.test.ts` | 非法结构、版本、导入导出、存储错误、不可变输入 |
| `test-ui/editors.test.tsx` | 草稿隔离、目标高级子步骤、目标兼容性、主目标删除、存储错误、显示缓存 |
| `e2e/app.spec.ts` | 双浏览器交互、路由、刷新恢复、响应式布局 |
| `test/invariants.test.ts` | 零通胀、收益低于通胀、实际/名义路径及资产增量恒等式 |

模型采用恒定年化假设和确定性月度推演，输出是假设下的首次达标时间。尚未模拟退休后的完整提款过程、收益顺序风险、随机市场波动、税制、杠杆、债务账户、多币种及多资产配置。不同增长率的退休支出与外部收入可导致退休后缺口继续变化；当前资本目标采用候选月年化缺口，不能证明整个退休期间始终足够。

使用 JavaScript 双精度数值，计算过程不逐月四舍五入；仅在 UI 输出时格式化。不用于精确分币清算。运行时拒绝非有限数和不支持的定义，并对推演溢出返回明确状态。年月粒度不提供日内/月内现金先后顺序，边界日期可能因此相差一个月。
