/**
 * Tailwind 設定：產生 shared/tailwind.css
 *
 * 這個站台以前是用 <script src="https://cdn.tailwindcss.com"> ——
 * 那是「在瀏覽器裡即時編譯」的 runtime，不是現成的 CSS，所以首次載入
 * 會先畫出完全沒有 Tailwind 的版面（.hidden 失效、flex/grid 垮掉），
 * 看起來像轉跳失敗。改成預先編好的靜態 CSS 就沒有這段空窗。
 *
 * 改完這兩頁的 Tailwind class 之後，一定要重跑：
 *     scripts/build-tailwind.sh
 * 否則新加的 class 不會有樣式（而且是永久沒有，不是閃一下）。
 */
module.exports = {
  // 掃全部頁面與共用 JS：目前只有兩頁用 Tailwind，但多掃不會變大
  //（Tailwind 只輸出真的出現過的 class），將來哪一頁開始用也不會漏。
  content: ['./*.html', './js/*.js', './shared/*.html'],

  // 以下這些 class 名稱是「查表查出來的」，而且表的鍵來自後端資料
  //（course.type、使用者挑的色票、API 狀態）。今天表裡的值都還是字面
  // 字串所以掃得到，但只要有人在表裡加一行而忘了重編，那一筆就會永久
  // 沒有樣式。這幾個家族很小，直接全列進來當保險。
  safelist: [
    { pattern: /^bg-(blue|green|red|purple|yellow|orange|pink|gray|amber|indigo)-(50|100|400|500|600|700)$/ },
    { pattern: /^text-(blue|green|red|purple|yellow|orange|pink|gray|amber|indigo)-(600|700)$/ },
    { pattern: /^border-(blue|green|red|purple|yellow|orange|pink|gray|amber|indigo)-(200|300)$/ },
    { pattern: /^(from|to)-(blue|green|red|purple|yellow|orange|pink|gray|indigo)-(400|500|600)$/ },
  ],

  theme: { extend: {} },
};
