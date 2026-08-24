<template>
  <figure-frame
    title="界線消失了，誤差還在"
    caption="同一段漸層，理想值從 100.2 一路爬到 100.8。沒有雜訊時，前半段全選 100、後半段全選 101，中間切出一條界線；加了雜訊後，四格裡選 101 的比例依序是兩成、四成、六成、八成，剛好等於各自理想值的小數部分，界線就散成了看不出來的顆粒。"
  >
    <svg
      viewBox="0 0 640 248"
      role="img"
      aria-label="上排沒有雜訊，前兩格整片選第 100 階、後兩格整片選第 101 階，中間有一條界線；下排加了雜訊，四格裡選第 101 階的格子比例分別是兩成、四成、六成、八成"
    >
      <!-- 上排：沒有雜訊，兩大塊顏色中間一條界線 -->
      <text x="40" y="18" fill="currentColor" font-size="13" font-weight="600" opacity="0.85">
        沒有雜訊：整排一起跳
      </text>
      <rect x="40" y="26" width="280" height="40" rx="4" fill="#dbe4f0" stroke="currentColor" stroke-opacity="0.15" />
      <rect x="320" y="26" width="280" height="40" rx="4" fill="#3d7fd6" stroke="currentColor" stroke-opacity="0.15" />

      <!-- 界線 -->
      <line x1="320" y1="20" x2="320" y2="72" stroke="#e8a33d" stroke-width="3" stroke-linecap="round" />
      <text x="328" y="50" fill="#e8a33d" font-size="12" font-weight="600">界線</text>

      <!-- 下排：加了雜訊，四格各自散成顆粒 -->
      <text x="40" y="86" fill="currentColor" font-size="13" font-weight="600" opacity="0.85">
        加了雜訊之後：顆粒隨機成的漸層
      </text>

      <!-- 兩條淡淡的欄位分隔線，對齊上排未變色的那兩道邊 -->
      <g stroke="currentColor" stroke-opacity="0.08">
        <line x1="180" y1="92" x2="180" y2="186" />
        <line x1="460" y1="92" x2="460" y2="186" />
      </g>

      <!-- 第一格：兩成選 101 -->
      <g fill="#dbe4f0" stroke="currentColor" stroke-opacity="0.15">
        <rect x="77" y="96" width="18" height="18" rx="3" />
        <rect x="101" y="96" width="18" height="18" rx="3" />
        <rect x="125" y="96" width="18" height="18" rx="3" />
        <rect x="149" y="96" width="18" height="18" rx="3" />
        <rect x="53" y="120" width="18" height="18" rx="3" />
        <rect x="77" y="120" width="18" height="18" rx="3" />
        <rect x="125" y="120" width="18" height="18" rx="3" />
        <rect x="149" y="120" width="18" height="18" rx="3" />
      </g>
      <g fill="#3d7fd6">
        <rect x="53" y="96" width="18" height="18" rx="3" />
        <rect x="101" y="120" width="18" height="18" rx="3" />
      </g>

      <!-- 第二格：四成選 101 -->
      <g fill="#dbe4f0" stroke="currentColor" stroke-opacity="0.15">
        <rect x="217" y="96" width="18" height="18" rx="3" />
        <rect x="241" y="96" width="18" height="18" rx="3" />
        <rect x="289" y="96" width="18" height="18" rx="3" />
        <rect x="217" y="120" width="18" height="18" rx="3" />
        <rect x="265" y="120" width="18" height="18" rx="3" />
        <rect x="289" y="120" width="18" height="18" rx="3" />
      </g>
      <g fill="#3d7fd6">
        <rect x="193" y="96" width="18" height="18" rx="3" />
        <rect x="265" y="96" width="18" height="18" rx="3" />
        <rect x="193" y="120" width="18" height="18" rx="3" />
        <rect x="241" y="120" width="18" height="18" rx="3" />
      </g>

      <!-- 第三格：六成選 101 -->
      <g fill="#dbe4f0" stroke="currentColor" stroke-opacity="0.15">
        <rect x="429" y="96" width="18" height="18" rx="3" />
        <rect x="357" y="120" width="18" height="18" rx="3" />
        <rect x="405" y="120" width="18" height="18" rx="3" />
        <rect x="429" y="120" width="18" height="18" rx="3" />
      </g>
      <g fill="#3d7fd6">
        <rect x="333" y="96" width="18" height="18" rx="3" />
        <rect x="357" y="96" width="18" height="18" rx="3" />
        <rect x="381" y="96" width="18" height="18" rx="3" />
        <rect x="405" y="96" width="18" height="18" rx="3" />
        <rect x="333" y="120" width="18" height="18" rx="3" />
        <rect x="381" y="120" width="18" height="18" rx="3" />
      </g>

      <!-- 第四格：八成選 101 -->
      <g fill="#dbe4f0" stroke="currentColor" stroke-opacity="0.15">
        <rect x="569" y="96" width="18" height="18" rx="3" />
        <rect x="497" y="120" width="18" height="18" rx="3" />
      </g>
      <g fill="#3d7fd6">
        <rect x="473" y="96" width="18" height="18" rx="3" />
        <rect x="497" y="96" width="18" height="18" rx="3" />
        <rect x="521" y="96" width="18" height="18" rx="3" />
        <rect x="545" y="96" width="18" height="18" rx="3" />
        <rect x="473" y="120" width="18" height="18" rx="3" />
        <rect x="521" y="120" width="18" height="18" rx="3" />
        <rect x="545" y="120" width="18" height="18" rx="3" />
        <rect x="569" y="120" width="18" height="18" rx="3" />
      </g>

      <!-- 每一格選 101 的比例 -->
      <g text-anchor="middle" font-weight="600" font-size="16" fill="currentColor">
        <text x="110" y="160">20%</text>
        <text x="250" y="160">40%</text>
        <text x="390" y="160">60%</text>
        <text x="530" y="160">80%</text>
      </g>
      <g text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6">
        <text x="110" y="178">理想值 100.2</text>
        <text x="250" y="178">理想值 100.4</text>
        <text x="390" y="178">理想值 100.6</text>
        <text x="530" y="178">理想值 100.8</text>
      </g>

      <!-- 圖例與收尾 -->
      <rect x="40" y="200" width="16" height="16" rx="3" fill="#dbe4f0" stroke="currentColor" stroke-opacity="0.15" />
      <text x="62" y="212" fill="currentColor" font-size="13" opacity="0.85">選 100</text>
      <rect x="150" y="200" width="16" height="16" rx="3" fill="#3d7fd6" />
      <text x="172" y="212" fill="currentColor" font-size="13" opacity="0.85">選 101</text>

      <text x="40" y="234" fill="currentColor" font-size="12" opacity="0.65">
        每一格深色的比例，剛好等於自己理想值的小數部分，平均亮度因此連續
      </text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
