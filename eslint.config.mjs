import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'web-dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'node_modules/**'] },
  { files: ['app/**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks }, rules: {
      'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error',
    } },
  { files: ['app/ui/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/src/**', '**/hooks/**', '**/containers/**', '**/model/**', 'react-router*'], message: '纯展示层只能依赖展示类型和 UI 组件。业务与导航由容器通过 props 提供。' }] }],
    'no-restricted-globals': ['error', { name: 'localStorage', message: '存储只能在业务 Hook 中访问。' }, { name: 'fetch', message: '展示组件不得发起业务请求。' }] } },
];
