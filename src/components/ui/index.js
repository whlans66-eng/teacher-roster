/**
 * index.js — UI kit 統一出口
 *
 * 全站唯一會寫出 .btn / .tag / .input 這些 app.css class 字串的地方就是這個資料夾。
 * 其他所有頁面與元件一律 import { Button, Tag, Input } from '../components/ui/index.js'，
 * 設計系統要改時只動這裡與 src/assets/css/app.css 兩處。
 *
 * 取代舊版 shared/ui.css + 八個 HTML 頁面各自複製貼上的 markup 片段。
 */

export { default as Icon } from './Icon.jsx';
export { default as Button } from './Button.jsx';
export { default as Card } from './Card.jsx';
export { default as Modal } from './Modal.jsx';
export { default as Input } from './Input.jsx';
export { default as Tag } from './Tag.jsx';
export { default as SearchBar } from './SearchBar.jsx';
export { default as EmptyState } from './EmptyState.jsx';
export { default as StatTile } from './StatTile.jsx';
