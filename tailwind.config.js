/**
 * Tailwind 主題完全由 shared/ui.css 的 CSS 變數驅動。
 *
 * 規則：色票與圓角的唯一真實來源是 src/assets/css/app.css 的 :root 區塊。
 * 這裡只是把那些變數「掛」到 Tailwind 的 utility 名稱上，因此永遠不會與設計
 * 系統脫鉤——改 app.css 一處，Tailwind 的 bg-primary 等 utility 立刻跟著改。
 *
 * 已知限制：色票用 var() 表示，因此不支援透明度修飾（bg-primary/50 不會生效）。
 * 需要半透明時請用 app.css 既有的 --ui-danger-bg 這類語意變數。
 */
export default {
  content: ['./app.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--ui-primary)',
          hover: 'var(--ui-primary-hover)',
          light: 'var(--ui-primary-light)',
          'light-hover': 'var(--ui-primary-light-hover)'
        },
        danger: { DEFAULT: 'var(--ui-danger)', bg: 'var(--ui-danger-bg)', 'bg-hover': 'var(--ui-danger-bg-hover)' },
        success: { DEFAULT: 'var(--ui-success)', hover: 'var(--ui-success-hover)' },
        warning: 'var(--ui-warning)',
        ink: { DEFAULT: 'var(--ui-text)', secondary: 'var(--ui-text-secondary)' },
        fill: { DEFAULT: 'var(--ui-fill)', hover: 'var(--ui-fill-hover)' },
        surface: { DEFAULT: 'var(--ui-surface)', hover: 'var(--ui-surface-hover)' },
        line: 'var(--ui-border)',
        disabled: 'var(--ui-disabled)'
      },
      borderRadius: {
        btn: 'var(--ui-radius-btn)',
        card: 'var(--ui-radius-card)',
        pill: 'var(--ui-radius-pill)'
      },
      fontFamily: {
        sans: ['var(--ui-font-sans)']
      }
    }
  },
  plugins: []
};
