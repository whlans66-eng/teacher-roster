// postcss-import 必須存在。
// styles.css 用 @import 依序載入 tailwind base → app.css → components → utilities；
// 少了這個外掛，CSS 規範會把所有 @import 提升到檔首，app.css 會落在 Tailwind
// preflight 之前而被重置掉（按鈕圓角、邊框會整批消失）。
export default {
  plugins: {
    'postcss-import': {},
    tailwindcss: {},
    autoprefixer: {}
  }
};
