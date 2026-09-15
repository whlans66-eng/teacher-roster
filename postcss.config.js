/**
 * postcss-import 必須存在。
 * styles.css 用 @import 依序載入 tailwind base → app.css → components → utilities；
 * 少了這個外掛，CSS 規範會把所有 @import 提升到檔首，app.css 會落在 Tailwind
 * preflight 之前而被重置掉（按鈕圓角、邊框會整批消失）。
 */
import postcssImport from 'postcss-import';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

/**
 * Phosphor 的 @font-face 一次列出 woff2 / woff / ttf / svg 四種格式，
 * 光 svg 一個檔就 3MB。實際上沒有任何瀏覽器會去抓後三種——woff2 排在第一順位，
 * 而所有現代瀏覽器都支援它（Chrome 36+ / Firefox 39+ / Safari 10+ / Edge 14+，
 * 2016 年起）。唯一抓不到 woff2 的是 IE11，而 React 18 本來就不支援 IE11。
 *
 * 這個外掛把非 woff2 的來源從 src 清單裡拿掉，讓 Vite 不再把那些檔案
 * 複製進 dist/。效果：部署目錄少掉約 4MB。
 */
function phosphorWoff2Only() {
  return {
    postcssPlugin: 'phosphor-woff2-only',
    AtRule: {
      'font-face': (rule) => {
        rule.walkDecls('src', (decl) => {
          const woff2Sources = decl.value
            .split(',')
            .map((part) => part.trim())
            .filter((part) => /format\(['"]?woff2['"]?\)/.test(part));

          // 找不到 woff2 就原樣保留，不要把字體整個弄壞
          if (woff2Sources.length) decl.value = woff2Sources.join(',\n    ');
        });
      }
    }
  };
}
phosphorWoff2Only.postcss = true;

export default {
  plugins: [postcssImport(), tailwindcss(), phosphorWoff2Only(), autoprefixer()]
};
