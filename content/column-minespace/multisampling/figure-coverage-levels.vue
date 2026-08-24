<template>
  <figure-frame
    title="取樣數決定邊緣能分幾階"
    caption="每一格裡的樣本只會回答「在」或「不在」，N 個樣本就有 N+1 種可能的命中數，也就是 N+1 階顏色。從一個樣本的兩階跳到四個樣本的五階，落差立刻看得出來；四個樣本跳到八個樣本，兩排幾乎長得一樣，那些多出來的階看不太出差別。"
  >
    <svg
      viewBox="0 0 640 280"
      role="img"
      aria-label="四排色階條，由上到下分別是一個、兩個、四個、八個樣本能表達的階數，色塊從空白漸變到全滿，樣本數越多色塊越多也越細"
    >
      <!-- 頂端刻度：這一排色塊代表的覆蓋率範圍 -->
      <text x="130" y="14" fill="currentColor" font-size="12" opacity="0.6">覆蓋率 0%</text>
      <text x="448" y="14" fill="currentColor" font-size="12" opacity="0.6" text-anchor="end">100%</text>
      <line x1="130" y1="20" x2="448" y2="20" stroke="currentColor" stroke-width="1" opacity="0.25" />

      <!--
        四排色塊，每排 N+1 格，格子的不透明度就是命中比例 i/N

        座標與不透明度都是算好的：
        N=1 → i/1 = 0, 1
        N=2 → i/2 = 0, 0.5, 1
        N=4 → i/4 = 0, 0.25, 0.5, 0.75, 1
        N=8 → i/8 = 0, 0.125, 0.25, ..., 1
      -->

      <!-- N = 1，兩階 -->
      <text x="20" y="50" fill="currentColor" font-size="13">1 個樣本</text>
      <g stroke="currentColor" stroke-width="1" stroke-opacity="0.35">
        <rect x="130" y="30" width="30" height="30" fill="#3d7fd6" fill-opacity="0" />
        <rect x="166" y="30" width="30" height="30" fill="#3d7fd6" fill-opacity="1" />
      </g>
      <text x="470" y="50" fill="currentColor" font-size="13">→ 2 階</text>

      <!-- N = 2，三階 -->
      <text x="20" y="112" fill="currentColor" font-size="13">2 個樣本</text>
      <g stroke="currentColor" stroke-width="1" stroke-opacity="0.35">
        <rect x="130" y="92" width="30" height="30" fill="#3d7fd6" fill-opacity="0" />
        <rect x="166" y="92" width="30" height="30" fill="#3d7fd6" fill-opacity="0.5" />
        <rect x="202" y="92" width="30" height="30" fill="#3d7fd6" fill-opacity="1" />
      </g>
      <text x="470" y="112" fill="currentColor" font-size="13">→ 3 階</text>

      <!-- N = 4，五階 -->
      <text x="20" y="174" fill="currentColor" font-size="13">4 個樣本</text>
      <g stroke="currentColor" stroke-width="1" stroke-opacity="0.35">
        <rect x="130" y="154" width="30" height="30" fill="#3d7fd6" fill-opacity="0" />
        <rect x="166" y="154" width="30" height="30" fill="#3d7fd6" fill-opacity="0.25" />
        <rect x="202" y="154" width="30" height="30" fill="#3d7fd6" fill-opacity="0.5" />
        <rect x="238" y="154" width="30" height="30" fill="#3d7fd6" fill-opacity="0.75" />
        <rect x="274" y="154" width="30" height="30" fill="#3d7fd6" fill-opacity="1" />
      </g>
      <text x="470" y="174" fill="currentColor" font-size="13">→ 5 階</text>

      <!-- N = 8，九階 -->
      <text x="20" y="236" fill="currentColor" font-size="13">8 個樣本</text>
      <g stroke="currentColor" stroke-width="1" stroke-opacity="0.35">
        <rect x="130" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="0" />
        <rect x="166" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="0.125" />
        <rect x="202" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="0.25" />
        <rect x="238" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="0.375" />
        <rect x="274" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="0.5" />
        <rect x="310" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="0.625" />
        <rect x="346" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="0.75" />
        <rect x="382" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="0.875" />
        <rect x="418" y="216" width="30" height="30" fill="#3d7fd6" fill-opacity="1" />
      </g>
      <text x="470" y="236" fill="currentColor" font-size="13">→ 9 階</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
