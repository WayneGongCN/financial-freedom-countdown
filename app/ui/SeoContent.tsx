import React, { type MouseEvent } from 'react';

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
  const links = [{ href: '/', label: '财务自由计算器' }, { href: '/evaluate', label: '消费与增收影响评估' }, { href: '/guide', label: '4% 法则与计算口径' }];
  return <React.Fragment><section className="seo-content" aria-label="工具使用说明">
    <h2>{evaluation ? '评估一笔消费或增收，对自由时间的影响' : '用自己的计划，估算财富自由还需要多久'}</h2>
    <p>{evaluation ? '把消费、额外收入或费用节省放进同一个试算项目，比较基础计划与加入项目后的资产路径和目标达成时间。' : '根据当前可投资资产、主动收入、生活支出、年化总收益率和通胀假设，查看目标资本、积累进度与预计达成月份。'}</p>
    <h3>如何使用</h3>
    <ol>{(evaluation ? ['先填写基础计划，确定需要比较的财富自由目标。', '添加一次性、每月、每年或未来的消费与收入，设置时间和增长方式。', '查看预计提前或延后的月份，以及本金、投资损益和购买力影响。试算不会改变基础计划。'] : ['填写年支出，按默认可调整的 4% 提取率预览目标资本。', '补充资产、收入、投资收益与通胀假设，计算预计还需时间。', '调整目标或评估一笔消费，比较不同选择对计划的影响。']).map(text => <li key={text}>{text}</li>)}</ol>
    <p>测算使用你填写的恒定假设，不模拟市场随机波动。4% 是可调整的目标参数，不代表保证收益或保证安全的提取比例。</p>
    <p>无需注册，财务方案仅保存在当前浏览器，可通过计划面板导出备份。正式站点统计页面访问与功能使用，不发送财务金额、收益率数值或个人方案内容。</p>
    <nav aria-label="相关工具与说明">{links.map(link => <a key={link.href} href={link.href} onClick={event => followAppLink(event, onNavigate ? () => onNavigate(link.href) : undefined)}>{link.label} ↗</a>)}</nav>
  </section></React.Fragment>;
}

export interface GuideTopic { id: string; title: string; paragraphs: string[] }

/** 复用同一份口径目录和正文，静态输出不依赖浏览器状态，喵~ */
export function GuideContent({ topics, onHelp }: { topics: GuideTopic[];
  /**
   * 请求定位说明主题，省略时使用原生锚点，喵~
   * @param topic 主题标识，喵~
   */
  onHelp?: (topic: string) => void;
}) {
  return <React.Fragment><nav className="guide-index" aria-label="口径目录">{topics.map(topic => <a key={topic.id} href={`/guide#${topic.id}`} onClick={event => followAppLink(event, onHelp ? () => onHelp(topic.id) : undefined)}>{topic.title} ↗</a>)}</nav>
    {topics.map(topic => <section key={topic.id} id={topic.id} tabIndex={-1} className="guide-section"><h2>{topic.title}</h2>{topic.paragraphs.map(text => <p key={text}>{text}</p>)}</section>)}
  </React.Fragment>;
}
