import { useState } from 'react';
import { useFinanceDocument } from './useFinanceDocument';

/** 管理用户主动执行的本地备份操作，不向第三方传输数据，喵~ */
export function useDataTransfer() {
  const api = useFinanceDocument();
  const [message, setMessage] = useState('');
  /** 下载当前正式方案，浏览器负责保存位置，喵~ */
  function download() {
    const url = URL.createObjectURL(new Blob([api.exportBackup()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = '财富自由倒计时.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('已生成当前正式方案的备份。');
  }
  /** 在确认后读取用户选择的备份，失败不覆盖旧方案，喵~ */
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMessage('备份不能超过 2 MB。'); return; }
    if (!window.confirm('导入将替换当前正式方案，未保存草稿将取消。继续导入？')) return;
    try { const error = api.importBackup(await file.text()); setMessage(error ?? '导入成功。'); return !error; }
    catch { setMessage('无法读取此文件，原方案未改变。'); return false; }
  }
  /** 只有用户确认后才替换损坏或旧方案，喵~ */
  function reset() { if (window.confirm('重新开始将替换本浏览器已保存的方案。请先导出需要保留的数据。')) { api.reset(); return true; } return false; }
  return { message, download, upload, reset };
}
