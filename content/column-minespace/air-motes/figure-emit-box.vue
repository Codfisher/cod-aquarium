<template>
  <figure-frame
    title="發射盒為什麼上下不對稱"
    caption="minEmitBox 與 maxEmitBox 是相對於鏡頭的偏移。鏡頭本身就是眼睛的高度，往下 2.5 格留給蹲下時的腳邊，往上 4 格留給抬頭時的頭頂再上一截，顆粒才會在蹲著與站著時都飄在視野裡。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="側視圖：鏡頭位在一個上下不對稱的長方體中央偏下，長方體往下量 2.5 格、往上量 4 格，裡面散著顆粒"
    >
      <!-- 發射範圍：長方體剖面 -->
      <rect
        x="160" y="54" width="200" height="156"
        fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 5" opacity="0.85"
      />

      <!-- 範圍裡的顆粒 -->
      <g fill="#e8a33d" opacity="0.9">
        <circle cx="277" cy="125" r="3.5" />
        <circle cx="320" cy="154" r="3.5" />
        <circle cx="205" cy="136" r="3.5" />
        <circle cx="221" cy="148" r="3.5" />
        <circle cx="322" cy="128" r="3.5" />
        <circle cx="217" cy="182" r="3.5" />
        <circle cx="302" cy="107" r="3.5" />
        <circle cx="209" cy="132" r="3.5" />
        <circle cx="292" cy="147" r="3.5" />
        <circle cx="176" cy="128" r="3.5" />
        <circle cx="317" cy="73" r="3.5" />
        <circle cx="276" cy="70" r="3.5" />
        <circle cx="220" cy="74" r="3.5" />
        <circle cx="207" cy="169" r="3.5" />
      </g>

      <!-- 鏡頭：眼睛高度 -->
      <path
        d="M238 150 q22 -17 44 0 q-22 17 -44 0 Z"
        fill="none" stroke="currentColor" stroke-width="2"
      />
      <circle cx="260" cy="150" r="5" fill="currentColor" />

      <!-- 量測線：左側，一條直線從範圍頂到範圍底，中間在眼睛高度分段 -->
      <g stroke="currentColor" stroke-width="1.5">
        <line x1="110" y1="54" x2="110" y2="210" />
        <!-- 上端箭頭 -->
        <polygon points="106,60 114,60 110,52" fill="currentColor" />
        <!-- 下端箭頭 -->
        <polygon points="106,204 114,204 110,212" fill="currentColor" />
        <!-- 眼睛高度的分段刻度 -->
        <line x1="103" y1="150" x2="117" y2="150" />
      </g>

      <!-- 量測線接回範圍邊界與眼睛高度的引線 -->
      <g stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.6">
        <line x1="110" y1="54" x2="160" y2="54" />
        <line x1="110" y1="210" x2="160" y2="210" />
        <line x1="110" y1="150" x2="238" y2="150" />
      </g>

      <text x="100" y="98" fill="currentColor" font-size="14" font-weight="600" text-anchor="end">+4 格</text>
      <text x="100" y="184" fill="currentColor" font-size="14" font-weight="600" text-anchor="end">−2.5 格</text>

      <text x="372" y="50" fill="currentColor" font-size="13" opacity="0.75">頭頂再上一截</text>
      <text x="372" y="218" fill="currentColor" font-size="13" opacity="0.75">蹲下時的腳邊</text>
      <text x="372" y="146" fill="currentColor" font-size="13" opacity="0.75">鏡頭＝眼睛高度</text>
      <line
        x1="282" y1="150" x2="366" y2="146"
        stroke="currentColor" stroke-width="1" stroke-dasharray="2 3" opacity="0.5"
      />

      <!-- 圖例 -->
      <g>
        <circle cx="176" cy="256" r="4" fill="#e8a33d" opacity="0.9" />
        <text x="188" y="260" fill="currentColor" font-size="13" opacity="0.7">顆粒可能生成的位置</text>

        <rect x="168" y="274" width="16" height="12" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 3" />
        <text x="188" y="284" fill="currentColor" font-size="13" opacity="0.7">emitBox 的範圍</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
