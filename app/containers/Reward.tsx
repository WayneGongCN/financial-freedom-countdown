import { useState } from 'react';
import { createPortal } from 'react-dom';
import { trackEvent } from '../analytics';
import { BottomSheet, ChoiceGroup } from '../ui/primitives';
import wechatCode from '../assets/wechat-reward-code.jpg';
import alipayCode from '../assets/alipay-reward-code.jpg';
import coffeeCode from '../assets/buy-me-a-coffee-reward-code.png';
import s from '../ui/ui.module.css';

const methods = {
  wechat: { label: '微信', image: wechatCode, filename: 'wechat-reward-code.jpg', alt: '微信赞赏码', hint: '用微信扫一扫，或保存图片后从相册识别。' },
  alipay: { label: '支付宝', image: alipayCode, filename: 'alipay-reward-code.jpg', alt: '支付宝收款码', hint: '用支付宝扫一扫，或保存图片后从相册识别。' },
  buy_me_a_coffee: { label: 'Buy Me a Coffee', image: coffeeCode, filename: 'buy-me-a-coffee-reward-code.png', alt: 'Buy Me a Coffee 赞赏码', hint: '扫描二维码，前往 Buy Me a Coffee。' },
} as const;
type Method = keyof typeof methods;
const options = Object.entries(methods).map(([value, { label }]) => ({ value, label }));

/** 管理赞赏入口、支付码选择及使用行为；下载仅表示发起保存，不推断付款或相册结果，喵~ */
export function Reward() {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>('wechat');
  const code = methods[method];
  /** 每次打开默认展示微信，仅按用户点击记录一次入口事件，喵~ */
  function show() {
    setMethod('wechat'); setOpen(true);
    trackEvent('reward_dialog_open', { entry_point: 'header', payment_method: 'wechat' });
  }
  /** 记录用户主动关闭的方式，原生弹层负责恢复入口焦点，喵~ */
  function close(reason: 'button' | 'escape' | 'backdrop') {
    setOpen(false);
    trackEvent('reward_dialog_close', { payment_method: method, close_method: reason });
  }
  /** 仅在切换到不同支付方式时上报，重复点击当前选项不重复计数，喵~ */
  function select(value: string) {
    if (!Object.hasOwn(methods, value) || value === method) return;
    const next = value as Method;
    setMethod(next);
    trackEvent('reward_method_change', { payment_method: next, previous_method: method });
  }
  return <>
    <button type="button" className={s.rewardTrigger} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
      赞赏
    </button>
    {createPortal(<BottomSheet open={open} title="感谢支持" closeLabel="关闭" closeOnBackdrop className={s.rewardDialog} onClose={close}
      footer={<a className={`${s.button} ${s.secondary} ${s.rewardSave}`} href={code.image} download={code.filename} onClick={() => trackEvent('reward_image_save', { payment_method: method })}>保存图片</a>}>
      {open && <div className={s.rewardContent}>
        <p className={s.body}>如果这个小工具帮你把未来看得更清楚，欢迎随心赞赏，支持它继续维护和改进。</p>
        <ChoiceGroup label="赞赏方式" value={method} options={options} onSelect={select} />
        <img className={s.rewardImage} src={code.image} alt={code.alt} width="216" height="216" />
        <p className={`${s.caption} ${s.rewardHint}`} aria-live="polite">{code.hint}<br />如未下载，可长按图片保存。</p>
        <p className={s.rewardThanks}>金额随心，感谢每一份支持。</p>
      </div>}
    </BottomSheet>, document.body)}
  </>;
}
