import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 入口刻意命名為 app.html，而非 index.html：
// 舊版 index.html 仍是 GitHub Pages 線上首頁，遷移期間兩者必須並存。
// 全部頁面搬完後（Phase 6），把 app.html 改名為 index.html 即可完成切換。
const entry = fileURLToPath(new URL('./app.html', import.meta.url));

/**
 * 清掉沒有人引用的字體檔。
 *
 * postcss.config.js 的 phosphorWoff2Only 外掛已經把 @font-face 的 src 收斂成
 * 只剩 woff2，但 Vite 解析 url() 並登記資產的時機早於 PostCSS 外掛執行，
 * 所以 woff / ttf / svg 還是會被複製進 dist——輸出的 CSS 根本沒有引用它們，
 * 純粹是部署目錄裡的 4MB 死檔。
 *
 * 這個鉤子在打包收尾時掃過所有產出內容，把「檔名沒有出現在任何 CSS/JS 裡」
 * 的字體資產刪掉。判斷依據是實際引用而不是副檔名白名單，所以之後若有人
 * 真的改回引用 woff，它會自動被保留。
 */
function dropUnreferencedFonts() {
  const FONT_PATTERN = /\.(woff2?|ttf|eot|otf|svg)$/i;

  return {
    name: 'drop-unreferenced-fonts',
    generateBundle(_options, bundle) {
      const fontFiles = Object.keys(bundle).filter((name) => FONT_PATTERN.test(name));
      if (!fontFiles.length) return;

      // 把所有非字體產出的內容串起來，當成「引用表」
      const referenceText = Object.entries(bundle)
        .filter(([name]) => !FONT_PATTERN.test(name))
        .map(([, chunk]) => (chunk.type === 'asset' ? String(chunk.source) : chunk.code))
        .join('\n');

      for (const name of fontFiles) {
        const basename = name.split('/').pop();
        if (!referenceText.includes(basename)) delete bundle[name];
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), dropUnreferencedFonts()],

  // 相對路徑：內網可能部署在子目錄（例如 https://intranet/maritrain/），
  // 用 './' 讓產出的資產路徑不綁定任何 origin 或絕對路徑。
  base: './',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: { input: entry }
  },

  server: {
    port: 5173,
    open: '/app.html'
  }
});
