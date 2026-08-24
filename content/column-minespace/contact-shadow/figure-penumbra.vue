<template>
  <figure-frame
    title="遮蔽物離地面越遠，半影就越寬"
    caption="光源有實際的寬度，柱腳貼著地面，光源兩側邊緣射出的光線在地上幾乎會合成同一點，邊界窄得像一條線；橫樑離地面遠，兩側邊緣的光線在地上散開一大片，邊界化成一段漸層。同一根柱子，越靠近地面陰影越硬，越往上離地面越遠就越軟。"
  >
    <svg
      viewBox="0 0 640 320"
      role="img"
      aria-label="一根柱子，柱腳與橫樑各自往光源兩側邊緣連線並延伸到地面，柱腳的兩條線幾乎會合在一起，橫樑的兩條線在地上散開很寬"
    >
      <!-- 地面 -->
      <rect x="0" y="260" width="640" height="40" fill="#e8dcc0" />

      <!--
        地上的半影帶

        寬度是拿光源寬度、柱子高度與地面距離三個數字，
        用相似三角形直接算出來的，不是隨手畫的：
        柱腳那點量到 8px，橫樑那點量到 140px
      -->
      <rect x="230" y="260" width="140" height="10" fill="#d1495b" opacity="0.32" />
      <rect x="296" y="260" width="8" height="10" fill="#3d7fd6" opacity="0.6" />

      <!-- 柱子 -->
      <rect
        x="287" y="70" width="26" height="190"
        fill="#a97c50" stroke="#7a5636" stroke-width="1.5"
      />

      <!-- 光源，畫成有寬度的一條帶子 -->
      <rect x="260" y="34" width="80" height="12" rx="6" fill="#e8a33d" />
      <text x="300" y="24" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.8">
        光源（有寬度）
      </text>

      <!--
        柱腳那一點：光源兩側邊緣的連線，延伸到地面
        (260,40)-(304,260) 與 (340,40)-(296,260)，地上落在 296~304
      -->
      <g stroke="#3d7fd6" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.85">
        <line x1="260" y1="40" x2="304" y2="260" />
        <line x1="340" y1="40" x2="296" y2="260" />
      </g>
      <circle cx="300" cy="240" r="4.5" fill="#3d7fd6" stroke="#fff" stroke-width="1.2" />

      <!--
        橫樑那一點：光源兩側邊緣的連線，延伸到地面
        (260,40)-(370,260) 與 (340,40)-(230,260)，地上落在 230~370
      -->
      <g stroke="#d1495b" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.85">
        <line x1="260" y1="40" x2="370" y2="260" />
        <line x1="340" y1="40" x2="230" y2="260" />
      </g>
      <circle cx="300" cy="120" r="4.5" fill="#d1495b" stroke="#fff" stroke-width="1.2" />

      <!-- 兩個點各自的標籤，顏色跟光線對應 -->
      <text x="222" y="244" fill="#3d7fd6" font-size="13" text-anchor="end">柱腳</text>
      <text x="222" y="124" fill="#d1495b" font-size="13" text-anchor="end">橫樑</text>

      <!-- 地面兩段半影的量測括線 -->
      <g stroke="currentColor" opacity="0.55">
        <line x1="296" y1="274" x2="304" y2="274" stroke-width="1.5" />
        <line x1="296" y1="270" x2="296" y2="278" stroke-width="1" />
        <line x1="304" y1="270" x2="304" y2="278" stroke-width="1" />
      </g>
      <text x="150" y="279" fill="currentColor" font-size="13" opacity="0.8" text-anchor="end">
        柱腳貼地，幾乎是刀切
      </text>
      <path
        d="M 154 275 C 200 275, 260 275, 294 274"
        fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"
      />

      <g stroke="currentColor" opacity="0.55">
        <line x1="230" y1="292" x2="370" y2="292" stroke-width="1.5" />
        <line x1="230" y1="288" x2="230" y2="296" stroke-width="1" />
        <line x1="370" y1="288" x2="370" y2="296" stroke-width="1" />
      </g>
      <text x="300" y="309" fill="currentColor" font-size="13" opacity="0.8" text-anchor="middle">
        離地面越遠，半影就越寬
      </text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
