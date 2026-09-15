/**
 * ESLint 設定（eslint 8 的 .eslintrc 格式）
 *
 * package.json 早就宣告了 eslint 與兩個 React 外掛，卻一直沒有設定檔，
 * 所以 `npm run lint` 從來沒有真的跑起來過。這份設定補上那個缺口。
 *
 * 除了 React 的標準規則之外，最下面那組 no-restricted 規則是把
 * MIGRATION.md 的架構規則變成機器可檢查的形式——靠人工 code review
 * 守規則，遲早會漏。
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  settings: { react: { version: '18.3' } },
  ignorePatterns: ['dist/', 'node_modules/', 'archived/', 'backend/', '*.gs', 'js/', 'shared/'],
  rules: {
    // 新版 JSX transform 不需要把 React 匯入作用域
    'react/react-in-jsx-scope': 'off',
    // 本專案用純 JS，不跑 prop-types
    'react/prop-types': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],

    // ── 架構規則（見 MIGRATION.md 第三節）────────────────────────────
    'no-restricted-globals': [
      'error',
      { name: 'alert', message: '請改用 useToast().alert()' },
      { name: 'confirm', message: '請改用 useToast().confirm()' },
      { name: 'prompt', message: '請改用 useToast().prompt()' }
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'lucide-react', message: '本專案的圖示系統是 Phosphor，請用 components/ui/Icon.jsx' }
        ],
        patterns: [
          { group: ['**/gasAdapter.js'], message: 'gasAdapter 只能由 apiClient.js 匯入' }
        ]
      }
    ],
    'react/no-danger': 'error'
  },
  overrides: [
    {
      // apiClient 是唯一允許碰 fetch 與 gasAdapter 的檔案
      files: ['src/services/apiClient.js', 'src/services/gasAdapter.js'],
      rules: { 'no-restricted-imports': 'off' }
    }
  ]
};
