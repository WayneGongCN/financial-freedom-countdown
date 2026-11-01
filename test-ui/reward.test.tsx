import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reward } from '../app/containers/Reward';
import { trackEvent } from '../app/analytics';

vi.mock('../app/analytics', () => ({ trackEvent: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('赞赏交互与统计', () => {
  it('切换支付码后下载对应原图，事件仅记录用户操作且不重复上报', async () => {
    const user = userEvent.setup();
    render(<StrictMode><Reward /></StrictMode>);
    expect(trackEvent).not.toHaveBeenCalled();
    const trigger = screen.getByRole('button', { name: '赞赏' });
    await user.click(trigger);
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith('reward_dialog_open', { entry_point: 'header', payment_method: 'wechat' });
    expect(screen.getByRole('img')).toHaveAttribute('alt', '微信赞赏码');
    await user.click(screen.getByRole('radio', { name: '微信' }));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('radio', { name: '支付宝' }));
    expect(trackEvent).toHaveBeenLastCalledWith('reward_method_change', { payment_method: 'alipay', previous_method: 'wechat' });
    const save = screen.getByRole('link', { name: '保存图片' });
    expect(save).toHaveAttribute('download', 'alipay-reward-code.jpg');
    expect(save.getAttribute('href')).toBe(screen.getByRole('img').getAttribute('src'));
    save.addEventListener('click', event => event.preventDefault());
    await user.click(save);
    expect(trackEvent).toHaveBeenLastCalledWith('reward_image_save', { payment_method: 'alipay' });
    await user.click(screen.getByRole('radio', { name: 'Buy Me a Coffee' }));
    expect(save).toHaveAttribute('download', 'buy-me-a-coffee-reward-code.png');
    expect(save.getAttribute('href')).toBe(screen.getByRole('img').getAttribute('src'));
    await user.click(screen.getByRole('button', { name: '关闭' }));
    expect(trackEvent).toHaveBeenLastCalledWith('reward_dialog_close', { payment_method: 'buy_me_a_coffee', close_method: 'button' });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole('radio', { name: '微信' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('link', { name: '保存图片' })).toHaveAttribute('download', 'wechat-reward-code.jpg');
  });

  it('原生 Esc 关闭事件单独记录，焦点返回入口', async () => {
    const user = userEvent.setup();
    render(<Reward />);
    const trigger = screen.getByRole('button', { name: '赞赏' });
    await user.click(trigger);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
    expect(trackEvent).toHaveBeenLastCalledWith('reward_dialog_close', { payment_method: 'wechat', close_method: 'escape' });
    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trigger).toHaveFocus();
  });
});
