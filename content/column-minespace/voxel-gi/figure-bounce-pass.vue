<template>
  <figure-frame
    title="光要穿過牆，才會換上牆的顏色"
    caption="紅牆左邊是曬得到太陽的空地，右邊的地板本來沒有光。第一趟，紅牆讀進兩側鄰居目前的光，取平均；第二趟，紅牆把讀到的光乘上自己的反照色，送回同一批鄰居。地板繞牆一圈，也跟著泛紅了。"
  >
    <svg
      viewBox="0 0 640 340"
      role="img"
      aria-label="三個相鄰的格子，左邊開放格曬得到太陽，中間實心格是紅牆，右邊開放格原本沒有光。上方灰色箭頭表示紅牆從兩側收集光，下方紅色箭頭表示紅牆把收集到的光乘上反照色送回兩側，右邊格子因此染上紅色"
    >
      <defs>
        <marker
          id="gi-bounce-gather"
          viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#64748b" />
        </marker>
        <marker
          id="gi-bounce-reflect"
          viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#d13329" />
        </marker>
      </defs>

      <!-- 第一趟：收集，兩個開放鄰居的光都被讀進紅牆 -->
      <text x="300" y="34" fill="#64748b" font-size="13" text-anchor="middle">
        ① 收集：讀鄰居目前的光，取平均
      </text>
      <g fill="none" stroke="#64748b" stroke-width="2" marker-end="url(#gi-bounce-gather)">
        <path d="M140,140 Q220,76 296,140" />
        <path d="M460,140 Q380,76 304,140" />
      </g>

      <!-- 三個格子：左開放（亮）、中實心（紅牆）、右開放（原本暗） -->
      <g stroke-width="1.8">
        <rect x="60" y="140" width="160" height="80" rx="6" fill="#fdecc8" stroke="#e8a33d" stroke-dasharray="6 4" />
        <rect x="220" y="140" width="160" height="80" rx="6" fill="#d13329" stroke="#7c2415" />
        <rect x="380" y="140" width="160" height="80" rx="6" fill="#e2e8f0" stroke="#94a3b8" stroke-dasharray="6 4" />
        <!-- 右邊那格被紅牆吐回來的光染紅 -->
        <rect x="380" y="140" width="160" height="80" rx="6" fill="#d13329" opacity="0.28" />
      </g>

      <g font-size="13" text-anchor="middle">
        <text x="140" y="172" fill="currentColor">開放格</text>
        <text x="140" y="196" fill="currentColor" opacity="0.75">陽光曬到的空地</text>

        <text x="300" y="172" fill="#ffffff">實心：紅牆</text>
        <text x="300" y="196" fill="#ffffff" opacity="0.85">反照色 R 0.82</text>

        <text x="460" y="172" fill="currentColor">開放格</text>
        <text x="460" y="196" fill="currentColor" opacity="0.75">本來沒有光</text>
        <text x="460" y="214" fill="#7c2415" font-weight="600">現在泛紅</text>
      </g>

      <!-- 第二趟：反射，紅牆把收集到的光乘上反照色，送回兩側 -->
      <g fill="none" stroke="#d13329" stroke-width="2.2" marker-end="url(#gi-bounce-reflect)">
        <path d="M296,220 Q220,284 140,220" />
        <path d="M304,220 Q380,284 460,220" />
      </g>
      <text x="300" y="316" fill="#d13329" font-size="13" text-anchor="middle">
        ② 反射：乘上牆的反照色，送回開放鄰居
      </text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
