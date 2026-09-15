import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 入口刻意命名為 app.html，而非 index.html：
// 舊版 index.html 仍是 GitHub Pages 線上首頁，遷移期間兩者必須並存。
// 全部頁面搬完後（Phase 6），把 app.html 改名為 index.html 即可完成切換。
const entry = fileURLToPath(new URL('./app.html', import.meta.url));

export default defineConfig({
  plugins: [react()],

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
