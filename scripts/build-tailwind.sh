#!/usr/bin/env bash
#
# 產生 shared/tailwind.css，並把版本號蓋進引用它的頁面。
#
# 為什麼需要版本號：這份 CSS 一旦被瀏覽器快取成舊版，頁面會整個沒樣式
#（不是閃一下，是一直壞著）。檔名後面帶一個內容雜湊，內容變了網址就變，
# 舊快取自然失效。
#
# 用法：  scripts/build-tailwind.sh
# 前置：  npm install   （只需要做一次）
#
set -euo pipefail
cd "$(dirname "$0")/.."

CLI=node_modules/.bin/tailwindcss
if [ ! -x "$CLI" ]; then
  echo "找不到 $CLI，請先執行： npm install" >&2
  exit 1
fi

"$CLI" --config tailwind.config.js \
       --input  shared/tailwind.src.css \
       --output shared/tailwind.css \
       --minify

VER=$(sha256sum shared/tailwind.css | cut -c1-8)

# 把每一頁的 ?v=... 換成新的雜湊
for f in *.html; do
  if grep -q 'shared/tailwind\.css' "$f"; then
    sed -i -E "s#(shared/tailwind\.css)(\?v=[0-9a-f]+)?#\1?v=${VER}#g" "$f"
    echo "  已更新版本號：$f"
  fi
done

echo
echo "shared/tailwind.css  $(wc -c < shared/tailwind.css) bytes  v=${VER}"
