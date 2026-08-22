<template>
  <figure-frame
    title="具名插槽直接填，正規式得在既有原始碼裡找"
    caption="Babylon 在 fragment 著色器裡留了四個具名插槽，位置固定，程式碼直接填進去就好。但光照那一行是內建、沒有插槽的既有原始碼，只能靠正規式在裡面搜尋，比對到才替換，找不到就靜靜地不做事。四個插槽由上到下依序是宣告、光照之前、霧之前、整支結束前，這個順序也是實際執行的順序。"
  >
    <svg
      viewBox="0 0 640 380"
      role="img"
      aria-label="fragment 著色器原始碼由上到下排列，四個具名插槽固定在特定位置，一次正規式取代發生在既有的光照計算那一行中間"
    >
      <text x="200" y="46" fill="currentColor" font-size="12" opacity="0.7">fragment 著色器，由上到下</text>
      <text x="618" y="46" fill="currentColor" font-size="11" opacity="0.6" text-anchor="end">字首都是 CUSTOM_FRAGMENT_</text>

      <!-- 具名插槽：宣告 -->
      <rect x="200" y="60" width="260" height="30" fill="#dbe8f7" stroke="#3d7fd6" stroke-width="1.5" />
      <line x1="460" y1="75" x2="476" y2="75" stroke="#3d7fd6" stroke-width="1.5" />
      <circle cx="476" cy="75" r="2.5" fill="#3d7fd6" />
      <text x="482" y="79" fill="#3d7fd6" font-size="12">DEFINITIONS</text>

      <!-- 既有原始碼：取樣、法線計算 -->
      <rect x="200" y="90" width="260" height="40" fill="#eef1f5" stroke="#cbd5e1" stroke-width="1.5" />
      <text x="330" y="114" fill="#64748b" font-size="11" text-anchor="middle">取樣、法線計算…</text>

      <!-- 具名插槽：光照之前 -->
      <rect x="200" y="130" width="260" height="30" fill="#dbe8f7" stroke="#3d7fd6" stroke-width="1.5" />
      <line x1="460" y1="145" x2="476" y2="145" stroke="#3d7fd6" stroke-width="1.5" />
      <circle cx="476" cy="145" r="2.5" fill="#3d7fd6" />
      <text x="482" y="149" fill="#3d7fd6" font-size="12">BEFORE_LIGHTS</text>

      <!-- 既有原始碼：光照計算，內含正規式取代目標 -->
      <rect x="200" y="160" width="260" height="40" fill="#eef1f5" stroke="#cbd5e1" stroke-width="1.5" />
      <rect x="215" y="170" width="230" height="20" fill="#fdecc8" stroke="#e8a33d" stroke-width="1.5" />
      <text x="330" y="184" fill="#92400e" font-size="11" text-anchor="middle">computeLighting(...)</text>
      <!-- 放大鏡 -->
      <circle cx="450" cy="167" r="6.5" fill="none" stroke="#e8a33d" stroke-width="2" />
      <line x1="454.6" y1="171.6" x2="460" y2="177" stroke="#e8a33d" stroke-width="2" stroke-linecap="round" />
      <line x1="460" y1="180" x2="476" y2="180" stroke="#e8a33d" stroke-width="1.5" />
      <circle cx="476" cy="180" r="2.5" fill="#e8a33d" />
      <text x="482" y="176" fill="#e8a33d" font-size="12">← 正規式在這裡找，</text>
      <text x="482" y="192" fill="#e8a33d" font-size="12">找到才換掉</text>

      <!-- 具名插槽：霧之前 -->
      <rect x="200" y="200" width="260" height="30" fill="#dbe8f7" stroke="#3d7fd6" stroke-width="1.5" />
      <line x1="460" y1="215" x2="476" y2="215" stroke="#3d7fd6" stroke-width="1.5" />
      <circle cx="476" cy="215" r="2.5" fill="#3d7fd6" />
      <text x="482" y="219" fill="#3d7fd6" font-size="12">BEFORE_FOG</text>

      <!-- 既有原始碼：霧的計算 -->
      <rect x="200" y="230" width="260" height="30" fill="#eef1f5" stroke="#cbd5e1" stroke-width="1.5" />
      <text x="330" y="249" fill="#64748b" font-size="11" text-anchor="middle">霧的計算…</text>

      <!-- 具名插槽：整支結束前 -->
      <rect x="200" y="260" width="260" height="30" fill="#dbe8f7" stroke="#3d7fd6" stroke-width="1.5" />
      <line x1="460" y1="275" x2="476" y2="275" stroke="#3d7fd6" stroke-width="1.5" />
      <circle cx="476" cy="275" r="2.5" fill="#3d7fd6" />
      <text x="482" y="279" fill="#3d7fd6" font-size="12">MAIN_END</text>

      <!-- 圖例 -->
      <rect x="200" y="322" width="20" height="14" fill="#dbe8f7" stroke="#3d7fd6" stroke-width="1.5" />
      <text x="228" y="333" fill="currentColor" font-size="13" opacity="0.8">具名插槽，位置固定，直接把程式碼填進去</text>

      <rect x="200" y="346" width="20" height="14" fill="#fdecc8" stroke="#e8a33d" stroke-width="1.5" />
      <text x="228" y="357" fill="currentColor" font-size="13" opacity="0.8">正規式取代，在既有原始碼裡找一段字串換掉</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
