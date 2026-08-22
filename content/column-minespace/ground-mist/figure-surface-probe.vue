<template>
  <figure-frame
    title="誰擋得住射線，誰擋不住"
    caption="射線從天空一路往下找，空氣直接穿過，草跟落葉這類可通行的方塊也照樣穿過，撞上真正擋路的東西才停下來，回傳那個面的高度。水面是特例，就算列在可通行清單裡，射線照樣在那裡停下，霧才不會鑽進水裡。半磚只有半格高，停下的位置也只到一半，不算整格高的地面。"
  >
    <svg
      viewBox="0 0 620 340"
      role="img"
      aria-label="地形剖面圖，三道射線分別往下找陸地、水面與半磚的地面高度，可通行的方塊用虛線框標示會被跳過，水面與半磚用實線框標示會讓射線停下"
    >
      <!-- 欄位標題 -->
      <text x="120" y="26" text-anchor="middle" fill="currentColor" font-size="14" font-weight="600">陸地</text>
      <text x="300" y="26" text-anchor="middle" fill="currentColor" font-size="14" font-weight="600">水面</text>
      <text x="480" y="26" text-anchor="middle" fill="currentColor" font-size="14" font-weight="600">半磚</text>

      <!--
        三欄地形

        每一格 50px 高，row0 到 row4 由上到下依序是 40、90、140、190、240，
        row4 的底邊在 290。半磚只填滿 row3 下半格（215～240），
        215 剛好是 190 + 50 / 2，精確一半
      -->

      <!-- 陸地欄：空氣、空氣、葉子（可通行）、石頭（命中） -->
      <g>
        <rect x="60" y="140" width="120" height="50" fill="#bfe3a0" opacity="0.55" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4" />
        <rect x="60" y="190" width="120" height="100" fill="#8a8578" stroke="#5f5b52" stroke-width="1.5" />
        <text x="168" y="169" text-anchor="end" fill="#3f5c2a" font-size="12">葉子</text>
        <text x="120" y="219" text-anchor="middle" fill="#f4f1ea" font-size="12">石頭</text>
      </g>

      <!-- 水面欄：空氣三格、水面（命中，即使可通行也不放行） -->
      <g>
        <rect x="240" y="190" width="120" height="100" fill="#a8cbe8" opacity="0.6" stroke="#3d7fd6" stroke-width="2" />
        <text x="300" y="219" text-anchor="middle" fill="#1f4e79" font-size="12">水面</text>
      </g>

      <!-- 半磚欄：空氣三格、半磚（只佔下半格，命中位置比整格低） -->
      <g>
        <!-- 整格的虛線提示，讓讀者看得出這一格「本來」有多高 -->
        <rect x="420" y="190" width="120" height="50" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity="0.35" />
        <rect x="420" y="215" width="120" height="25" fill="#8a8578" stroke="#5f5b52" stroke-width="1.5" />
        <rect x="420" y="240" width="120" height="50" fill="#8a8578" stroke="#5f5b52" stroke-width="1.5" />
        <text x="480" y="231" text-anchor="middle" fill="#f4f1ea" font-size="11">半磚</text>
      </g>

      <!-- 格線：三欄共用的水平分隔，方便對齊高度 -->
      <g stroke="currentColor" stroke-width="1" opacity="0.15">
        <line x1="50" y1="90" x2="550" y2="90" />
        <line x1="50" y1="140" x2="550" y2="140" />
        <line x1="50" y1="190" x2="550" y2="190" />
        <line x1="50" y1="240" x2="550" y2="240" />
      </g>

      <!-- 三道射線：從天空往下，實線段是走過的路，圓點是命中的位置 -->
      <g stroke="#3d7fd6" stroke-width="2.2">
        <line x1="120" y1="42" x2="120" y2="190" stroke-dasharray="5 4" />
        <line x1="300" y1="42" x2="300" y2="190" stroke-dasharray="5 4" />
        <line x1="480" y1="42" x2="480" y2="215" stroke-dasharray="5 4" />
      </g>
      <g fill="#3d7fd6">
        <circle cx="120" cy="190" r="6" />
        <circle cx="300" cy="190" r="6" />
        <circle cx="480" cy="215" r="6" />
      </g>

      <!-- 命中的那個面，加粗標出來 -->
      <g stroke="#3d7fd6" stroke-width="4" stroke-linecap="round">
        <line x1="60" y1="190" x2="180" y2="190" />
        <line x1="240" y1="190" x2="360" y2="190" />
        <line x1="420" y1="215" x2="540" y2="215" />
      </g>

      <!-- 每一欄的關鍵註記 -->
      <text x="120" y="305" text-anchor="middle" fill="currentColor" font-size="12" opacity="0.75">命中石頭頂面</text>
      <text x="300" y="305" text-anchor="middle" fill="currentColor" font-size="12" opacity="0.75">水面直接命中</text>
      <text x="480" y="305" text-anchor="middle" fill="currentColor" font-size="12" opacity="0.75">只到半格高</text>

      <!-- 圖例 -->
      <g>
        <rect x="30" y="322" width="18" height="14" fill="#bfe3a0" opacity="0.55" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4" />
        <text x="54" y="333" fill="currentColor" font-size="12">可通行，射線繼續往下</text>

        <rect x="240" y="322" width="18" height="14" fill="#8a8578" stroke="#5f5b52" stroke-width="1.5" />
        <text x="264" y="333" fill="currentColor" font-size="12">擋路，射線停在這裡</text>

        <rect x="440" y="322" width="18" height="14" fill="#a8cbe8" opacity="0.6" stroke="#3d7fd6" stroke-width="2" />
        <text x="464" y="333" fill="currentColor" font-size="12">水面，特例命中</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
