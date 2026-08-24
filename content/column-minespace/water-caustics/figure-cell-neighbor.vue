<template>
  <figure-frame
    title="最近的種子可能落在對角的鄰居格"
    caption="細胞中心會在自己的格子裡到處跑，離查詢點最近的那顆不一定是自己這格的中心，甚至不一定是正上方、正右方這種四鄰的中心，可能落在對角那一格。這張圖裡最近的種子落在右上角的對角鄰居，比自己這格的中心近了三倍以上，也比上方、右方那兩個鄰居更近。只查十字形的四個鄰居會漏掉它，九宮格才是撈得到最近種子的最小範圍。"
  >
    <svg
      viewBox="0 0 640 420"
      role="img"
      aria-label="三乘三的格線，查詢點落在中央那格靠右上角的位置。中央格自己的中心在左下角，離查詢點很遠；真正最近的中心落在右上角那個對角鄰居格裡，比正上方與正右方鄰居的中心都更近"
    >
      <!-- 圖例與統計 -->
      <g font-size="13">
        <circle cx="470" cy="68" r="6" fill="#3d7fd6" />
        <text x="484" y="73" fill="#3d7fd6">最近的種子（對角鄰居）</text>

        <circle cx="470" cy="94" r="5" fill="currentColor" opacity="0.55" />
        <text x="484" y="99" fill="currentColor" opacity="0.7">查過但比較遠的中心</text>

        <g stroke="currentColor" stroke-width="2">
          <circle cx="470" cy="120" r="6" fill="none" />
          <line x1="470" y1="115" x2="470" y2="125" />
          <line x1="465" y1="120" x2="475" y2="120" />
        </g>
        <text x="484" y="125" fill="currentColor" opacity="0.7">查詢點</text>

        <text x="464" y="165" fill="currentColor" font-size="13" opacity="0.7">
          <tspan x="464" dy="0">自己這格的中心，</tspan>
          <tspan x="464" dy="20">反而遠了三倍以上</tspan>
        </text>
      </g>

      <!-- 九宮格 -->
      <g stroke="currentColor" stroke-width="1.5" opacity="0.3">
        <line x1="80" y1="40" x2="80" y2="400" />
        <line x1="200" y1="40" x2="200" y2="400" />
        <line x1="320" y1="40" x2="320" y2="400" />
        <line x1="440" y1="40" x2="440" y2="400" />
        <line x1="80" y1="40" x2="440" y2="40" />
        <line x1="80" y1="160" x2="440" y2="160" />
        <line x1="80" y1="280" x2="440" y2="280" />
        <line x1="80" y1="400" x2="440" y2="400" />
      </g>

      <!-- 查詢點所在的格子 -->
      <rect x="200" y="160" width="120" height="120" fill="currentColor" opacity="0.07" />
      <text x="312" y="272" fill="currentColor" font-size="12" opacity="0.6" text-anchor="end">P 的格子</text>

      <!-- 對角鄰居格：真正最近的種子藏在這裡 -->
      <rect x="320" y="40" width="120" height="120" fill="#3d7fd6" opacity="0.12" />
      <text x="328" y="56" fill="#3d7fd6" font-size="12" opacity="0.85">對角鄰居</text>

      <!-- 其餘五格的中心，僅供參考，不涉及圖中比較 -->
      <g fill="currentColor" opacity="0.4">
        <circle cx="140" cy="100" r="4" />
        <circle cx="140" cy="220" r="4" />
        <circle cx="140" cy="340" r="4" />
        <circle cx="260" cy="340" r="4" />
        <circle cx="380" cy="340" r="4" />
      </g>

      <!-- 四個被比較的中心之間的連線 -->
      <line x1="302" y1="178" x2="224" y2="256" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.5" />
      <line x1="302" y1="178" x2="332" y2="220" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.5" />
      <line x1="302" y1="178" x2="260" y2="148" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.5" />
      <line x1="302" y1="178" x2="326" y2="154" stroke="#3d7fd6" stroke-width="2.5" />

      <!-- 四個被比較的中心 -->
      <circle cx="224" cy="256" r="6" fill="currentColor" opacity="0.65" />
      <circle cx="332" cy="220" r="6" fill="currentColor" opacity="0.65" />
      <circle cx="260" cy="148" r="6" fill="currentColor" opacity="0.65" />
      <circle cx="326" cy="154" r="7" fill="#3d7fd6" />

      <text x="150" y="276" fill="currentColor" font-size="12" opacity="0.75">自己這格的中心</text>
      <text x="340" y="224" fill="currentColor" font-size="12" opacity="0.75">右鄰</text>
      <text x="215" y="143" fill="currentColor" font-size="12" opacity="0.75" text-anchor="end">上鄰</text>

      <!-- 查詢點：十字準星，跟實心的細胞中心點區分開 -->
      <g stroke="currentColor" stroke-width="2.5">
        <circle cx="302" cy="178" r="7" fill="none" />
        <line x1="302" y1="171" x2="302" y2="185" />
        <line x1="295" y1="178" x2="309" y2="178" />
      </g>
      <line x1="258" y1="166" x2="293" y2="174" stroke="currentColor" stroke-width="1" opacity="0.5" />
      <text x="255" y="170" fill="currentColor" font-size="13" text-anchor="end">查詢點</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
