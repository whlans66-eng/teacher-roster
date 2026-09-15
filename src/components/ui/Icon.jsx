/**
 * Icon.jsx — Phosphor 圖示元件
 *
 * 取代舊版八個頁面裡直接寫死的 <i class="ph ph-xxx"></i>（teacher-management.html、
 * maritime-courses.html、course-management.html 等共約 134 個不同圖示名稱）。
 * 圖示字體由 src/styles.css 從 npm 的 @phosphor-icons/web 載入，不走 CDN。
 *
 * 名稱直接沿用 Phosphor 官方名稱（"trash"、"magnifying-glass"…），
 * 因此舊頁面的 class="ph ph-trash" 對應到 <Icon name="trash" />，不需要任何對照表。
 *
 * 尺寸：預設不輸出 font-size，交給父層的 CSS 規則決定
 * （app.css 已經定義 .btn i = 18px、.btn-sm i = 16px、.btn-lg i = 20px、.tag i = 12px）。
 * 只有呼叫端明確傳 size 時才會寫 inline font-size，避免蓋掉設計系統的尺寸契約。
 */

/** Phosphor 提供的字重對應的 class 前綴 */
const WEIGHT_CLASS = {
  regular: 'ph',
  bold: 'ph-bold',
  fill: 'ph-fill'
};

/**
 * 目前 src/styles.css 實際載入的字重。
 *
 * 只載 regular，因為每個字重會帶進約 4MB 的字體檔，而全站沒有一處用到
 * 其他字重。要啟用 bold 或 fill，先在 styles.css 加回對應的 @import，
 * 再把名稱加進這個集合——兩邊必須同步，否則指定的字重會無聲失效。
 */
const LOADED_WEIGHTS = new Set(['regular']);

export function Icon({ name, weight = 'regular', className = '', size, style, ...rest }) {
  // 名稱是必填；缺了就不渲染，免得畫面上留下一個看不出來源的空方塊
  if (!name) return null;

  // 字重沒載入時退回 regular。若靜靜套上 ph-bold，字體檔不存在，
  // 畫面上只會出現一個看不出原因的空白方塊，非常難查。
  const effectiveWeight = LOADED_WEIGHTS.has(weight) ? weight : 'regular';
  if (import.meta.env.DEV && weight !== effectiveWeight) {
    console.warn(
      `[Icon] 字重 "${weight}" 尚未載入，已退回 regular。` +
        '請先在 src/styles.css 加上對應的 @phosphor-icons/web 匯入。'
    );
  }

  const prefix = WEIGHT_CLASS[effectiveWeight] || WEIGHT_CLASS.regular;
  const classes = [prefix, `ph-${name}`, className].filter(Boolean).join(' ');

  // 數字一律視為 px；字串（'1.5rem'、'2em'）原樣輸出
  const fontSize = size == null ? null : typeof size === 'number' ? `${size}px` : size;
  const mergedStyle = fontSize ? { fontSize, ...style } : style;

  return <i className={classes} style={mergedStyle} aria-hidden="true" {...rest} />;
}

export default Icon;
