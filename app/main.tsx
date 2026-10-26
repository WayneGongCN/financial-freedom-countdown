import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { FinanceDocumentProvider } from './hooks/useFinanceDocument';
import { FinanceApp } from './containers/FinanceApp';
import './styles.css';
import { initAnalytics } from './analytics';

initAnalytics('G-5ZPDR2VWBB', import.meta.env.PROD);

const storage = {
  /** 读取本应用存储键，权限异常由业务 Hook 处理，喵~ */
  getItem(key: string) { return window.localStorage.getItem(key); },
  /** 单键替换已经校验的文档，喵~ */
  setItem(key: string, value: string) { window.localStorage.setItem(key, value); },
  /** 只删除指定应用键，喵~ */
  removeItem(key: string) { window.localStorage.removeItem(key); },
};
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><FinanceDocumentProvider storage={storage}><FinanceApp /></FinanceDocumentProvider></BrowserRouter></StrictMode>);
