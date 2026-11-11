import React, { type MouseEvent } from 'react';
import { CarCase } from './CarCase';

/** 仅拦截普通左键站内导航，保留新标签页和浏览器默认操作，喵~ */
export function followAppLink(event: MouseEvent<HTMLAnchorElement>, navigate?: () => void) {
  if (!navigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); navigate();
}

/** 显示静态与交互页面共用的工具说明，喵~ */
export function PublicContent({ evaluation = false, onNavigate }: { evaluation?: boolean;
  /**
   * 请求应用内跳转；静态页面省略时保留原生链接，喵~
   * @param path 公开页面路径，喵~
   */
  onNavigate?: (path: string) => void;
}) {
  const links = [{ href: '/', label: '财务自由计算器' }, { href: '/evaluate', label: '消费与增收影响评估' }, { href: '/guide', label: '4% 法则与计算口径' }, { href: '/evaluate#car-case', label: '买车影响财务自由的计算案例' }];
  return <React.Fragment><section className="seo-content" aria-label="工具使用说明">
    <h2>{evaluation ? '评估一笔消费或增收，对自由时间的影响' : '财务自由计算器能算出什么？'}</h2>
    <p>{evaluation ? '把消费、额外收入或费用节省放进同一个试算项目，比较基础计划与加入项目后的资产路径和目标达成时间。' : '这是一款免费的 FIRE 计算器。FIRE 指财务独立、提前退休。根据当前可投资资产、税后主动收入、生活支出、年化总收益率和通胀假设，你可以查看目标资本、积累进度与预计达成月份。'}</p>
    <h3>如何使用</h3>
    <ol>{(evaluation ? ['先填写基础计划，确定需要比较的财富自由目标。', '添加一次性、每月、每年或未来的消费与收入，设置时间和增长方式。', '查看预计提前或延后的月份，以及本金、投资损益和购买力影响。试算不会改变基础计划。'] : ['填写年支出，按默认可调整的 4% 提取率预览目标资本。', '补充资产、收入、投资收益与通胀假设，计算预计还需时间。', '调整目标或评估一笔消费，比较不同选择对计划的影响。']).map(text => <li key={text}>{text}</li>)}</ol>
    {!evaluation && <p>如果每年花 12 万元，按 4% 提取率估算，目标资本约为 300 万元。再填入当前资产和收入，就能结合收益率和通胀假设估算还需多久。</p>}
    {!evaluation && <React.Fragment>
      <h3>目标资产和达成时间有什么区别？</h3>
      <p>年支出决定需要覆盖的生活预算，提取率决定目标资本的倍数。达成时间还取决于当前可投资资产、每月结余、投资收益和通胀。储蓄更多、减少长期支出或改变目标口径，都会影响预计月份。</p>
      <p>工资和支出可以分阶段填写，例如工作一段时间后休息，或房贷结束后降低预算。计算器按月推演这些变化，并按方案基准月购买力展示目标与进度。</p>
      <h3>收益率和通胀怎么填？</h3>
      <p>年化总收益率填写未扣通胀的长期假设，通胀单独填写。新方案以 5% 收益率、2% 通胀作为可编辑的起点。两者对应约 2.94% 实际年收益率，实际投资结果会波动。</p>
    </React.Fragment>}
    <p>测算使用你填写的恒定假设，不模拟市场随机波动。4% 是可调整的目标参数，不代表保证收益或保证安全的提取比例。</p>
    <p>无需注册，财务方案仅保存在当前浏览器，可通过计划面板导出备份。正式站点统计页面访问与功能使用，不发送财务金额、收益率数值或个人方案内容。</p>
    <nav aria-label="相关工具与说明">{links.map(link => <a key={link.href} href={link.href} onClick={event => followAppLink(event, onNavigate ? () => onNavigate(link.href) : undefined)}>{link.label} ↗</a>)}</nav>
    {evaluation && <CarCase />}
  </section></React.Fragment>;
}

export interface GuideTopic { id: string; title: string; paragraphs: string[] }

/** 将目标公式和研究来源放在口径说明之前，静态与交互页面共用。 */
export function GuideIntro() {
  return <section className="guide-section" aria-label="财富自由目标计算">
    <h2>从生活预算估算目标资本</h2>
    <p>可以先用自由后常态年支出除以提取率，估算需要准备的可投资资产。按 4% 计算，目标资本等于年支出的 25 倍。例如每月花 1 万元，年支出 12 万元，对应目标约 300 万元。</p>
    <p>这个目标随生活预算和提取率变化。将养老金等外部净收入、有限期支出准备金纳入目标时，还需要按下文的具体口径调整。</p>
    <table className="seo-table">
      <caption>按 4% 提取率估算目标资本</caption>
      <thead><tr><th scope="col">月支出</th><th scope="col">年支出</th><th scope="col">目标资本</th></tr></thead>
      <tbody>
        <tr><td>5,000 元</td><td>6 万元</td><td>150 万元</td></tr>
        <tr><td>10,000 元</td><td>12 万元</td><td>300 万元</td></tr>
        <tr><td>15,000 元</td><td>18 万元</td><td>450 万元</td></tr>
      </tbody>
    </table>
    <h3>提取率改变，目标会差多少？</h3>
    <p>如果自由后年支出为 12 万元，按 3%、3.5%、4% 计算的目标分别约为 400 万元、343 万元和 300 万元。这里是同一预算下的参数对照，实际选择还要结合投资组合、退休期限和支出弹性。</p>
    <h3>4% 法则的来源和适用条件</h3>
    <p>William P. Bengen 在 1994 年发表于 Journal of Financial Planning 的研究，使用美国股票、国债和通胀历史数据，考察退休首年按初始资产一定比例提款、以后按通胀调整提款金额时，组合能够维持多久。其中讨论了至少 30 年退休期下的提款策略。4% 的历史研究需要结合资产配置与退休期限理解。</p>
    <p>本站将提取率用作可调整的资本门槛，并用恒定收益和通胀假设计算积累时间。退休后资金能否持续覆盖支出，还受收益顺序、税费、市场和寿命等因素影响。</p>
    <p>Financial Planning Association 提供了 Bengen 原文的 2004 年重刊版。<a href="https://www.financialplanningassociation.org/sites/default/files/2021-04/MAR04%20Determining%20Withdrawal%20Rates%20Using%20Historical%20Data.pdf">Determining Withdrawal Rates Using Historical Data</a></p>
    <h3>多久才能达到目标？</h3>
    <p>确定目标后，还需要填写当前可投资资产、税后收入、生活支出和长期收益假设。工具逐月计算期初资产回报和月末结余，再检查是否达到当月目标。未来生活预算随通胀或支出阶段变化时，目标也会跟着变化。</p>
    <p><a href="/">返回财务自由计算器</a>，填写自己的计划。也可以查看<a href="/evaluate#car-case">买车与长期养车费的完整案例</a>，比较一次性支出和持续支出的影响。</p>
    <p className="content-byline">作者 <a href="https://github.com/WayneGongCN">waynegong</a> · 本站开发者 · 内容更新于 2026 年 11 月 11 日</p>
  </section>;
}

/** 复用同一份口径目录和正文，静态输出不依赖浏览器状态，喵~ */
export function GuideContent({ topics, onHelp }: { topics: GuideTopic[];
  /**
   * 请求定位说明主题，省略时使用原生锚点，喵~
   * @param topic 主题标识，喵~
   */
  onHelp?: (topic: string) => void;
}) {
  return <React.Fragment><GuideIntro /><nav className="guide-index" aria-label="口径目录">{topics.map(topic => <a key={topic.id} href={`/guide#${topic.id}`} onClick={event => followAppLink(event, onHelp ? () => onHelp(topic.id) : undefined)}>{topic.title} ↗</a>)}</nav>
    {topics.map(topic => <section key={topic.id} id={topic.id} tabIndex={-1} className="guide-section"><h2>{topic.title}</h2>{topic.paragraphs.map(text => <p key={text}>{text}</p>)}</section>)}
  </React.Fragment>;
}
