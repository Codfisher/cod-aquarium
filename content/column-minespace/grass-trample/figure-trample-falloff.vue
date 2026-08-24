<template>
  <figure-frame
    title="核心先滿檔，過了核心才慢慢退開"
    caption="衰減若從距離零就開始算，力道最強的地方永遠是腳底下那一株，而那一株在畫面上根本看不到，看得到的全落在曲線尾巴、力道最弱的那一段。核心之內先給滿檔，草才會整片一起讓開。核心給零點六格、外圈給一格半，兩個數字是 smoothstep 的上下界。右邊那條線是這個範圍內的衰減值，核心之前維持平坦，過了核心才開始下滑，到外圈邊界正好收到零。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="左邊是由上往下看的兩個同心圓，內圈是零點六格的滿檔核心，外圈是一格半的邊界；右邊是對應的衰減曲線，距離在核心之內維持在一，過了核心才平滑降到零"
    >
      <text x="16" y="24" fill="currentColor" font-size="13" font-weight="600" opacity="0.75">由上往下看</text>

      <!-- 外圈：1.5 格，退到零的邊界 -->
      <circle cx="150" cy="170" r="75" fill="none" stroke="#e8a33d" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.85" />
      <!-- 核心：0.6 格，滿檔 -->
      <circle cx="150" cy="170" r="30" fill="#3d7fd6" fill-opacity="0.15" stroke="#3d7fd6" stroke-width="1.6" />

      <!-- 人站的位置 -->
      <circle cx="150" cy="170" r="4" fill="currentColor" />
      <text x="150" y="262" fill="currentColor" font-size="12" opacity="0.7" text-anchor="middle">人站在這裡</text>

      <!-- 核心標註 -->
      <line x1="150" y1="140" x2="112" y2="118" stroke="#3d7fd6" stroke-width="1.2" opacity="0.7" />
      <text x="108" y="114" fill="#3d7fd6" font-size="12" text-anchor="end">核心 0.6 格・滿檔</text>

      <!-- 外圈標註 -->
      <line x1="203" y1="117" x2="236" y2="96" stroke="#e8a33d" stroke-width="1.2" opacity="0.85" />
      <text x="240" y="92" fill="#e8a33d" font-size="12">外圈 1.5 格・退到零</text>

      <!-- 比例尺 -->
      <line x1="235" y1="272" x2="285" y2="272" stroke="currentColor" stroke-width="1.4" opacity="0.6" />
      <line x1="235" y1="267" x2="235" y2="277" stroke="currentColor" stroke-width="1.4" opacity="0.6" />
      <line x1="285" y1="267" x2="285" y2="277" stroke="currentColor" stroke-width="1.4" opacity="0.6" />
      <text x="260" y="291" fill="currentColor" font-size="11" opacity="0.6" text-anchor="middle">1 格</text>

      <!-- 分隔線 -->
      <line x1="300" y1="16" x2="300" y2="286" stroke="currentColor" stroke-width="1" opacity="0.12" />

      <!-- 右側：衰減曲線 -->
      <text x="336" y="24" fill="currentColor" font-size="13" font-weight="600" opacity="0.75">距離換算成的衰減值</text>
      <text x="620" y="24" fill="currentColor" font-size="11" opacity="0.55" text-anchor="end">核心之前平坦，過了才下滑</text>

      <!-- 座標軸 -->
      <line x1="380" y1="100" x2="380" y2="250" stroke="currentColor" stroke-width="1" opacity="0.4" />
      <line x1="375" y1="250" x2="620" y2="250" stroke="currentColor" stroke-width="1" opacity="0.4" />
      <text x="365" y="254" fill="currentColor" font-size="11" opacity="0.6" text-anchor="end">0</text>
      <text x="365" y="114" fill="currentColor" font-size="11" opacity="0.6" text-anchor="end">1</text>

      <!-- 核心／外圈的對齊虛線 -->
      <line x1="458" y1="100" x2="458" y2="250" stroke="#3d7fd6" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.55" />
      <line x1="575" y1="100" x2="575" y2="250" stroke="#e8a33d" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.6" />
      <text x="458" y="266" fill="#3d7fd6" font-size="11" text-anchor="middle">0.6</text>
      <text x="575" y="266" fill="#e8a33d" font-size="11" text-anchor="middle">1.5</text>
      <text x="500" y="288" fill="currentColor" font-size="11" opacity="0.55" text-anchor="middle">距離（格）</text>

      <!-- 滿檔平台的底色 -->
      <rect x="380" y="110" width="78" height="140" fill="#3d7fd6" fill-opacity="0.1" />
      <!-- 下滑段的底色 -->
      <polygon
        points="458,110 471,114.8 484,127.7 497,146.3 510,168.4 523,191.6 536,213.7 549,232.3 562,245.2 575,250 458,250"
        fill="#e8a33d" fill-opacity="0.08"
      />

      <!-- 衰減曲線本體 -->
      <polyline
        points="380,110 458,110 471,114.8 484,127.7 497,146.3 510,168.4 523,191.6 536,213.7 549,232.3 562,245.2 575,250 614,250"
        fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"
      />
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
