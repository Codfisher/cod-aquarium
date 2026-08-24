<template>
  <figure-frame
    title="半向量對準法線，那一點才亮"
    caption="L 是往光源看的方向，V 是往眼睛看的方向，兩者的中間值就是半向量 H。法線指在 H 上，點積等於一，乘一百六十次方還是一。法線偏移十五度，點積掉到 0.966，同樣乘一百六十次方只剩 0.004，幾乎全暗。水面的高光只在那一小點閃，原因就在這裡。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="水面上一點往光源與眼睛各拉一條線，兩者中間夾出半向量。法線指在半向量上時點積最大，偏移十五度後點積大幅下降"
    >
      <!-- 水面基準線 -->
      <line x1="70" y1="220" x2="570" y2="220" stroke="currentColor" stroke-width="2" stroke-dasharray="6 5" opacity="0.25" />
      <text x="74" y="238" fill="currentColor" font-size="13" opacity="0.65">水面</text>

      <!-- 這一點 -->
      <circle cx="320" cy="220" r="4" fill="currentColor" />

      <!-- 往光源看的方向 L -->
      <line x1="320" y1="220" x2="265" y2="124.7" stroke="currentColor" stroke-width="2" opacity="0.75" />
      <polygon points="265,124.7 274.3,130.9 265.7,135.9" fill="currentColor" opacity="0.75" />
      <text x="150" y="178" fill="currentColor" font-size="13" opacity="0.75">光源方向 L</text>

      <!-- 往眼睛看的方向 V -->
      <line x1="320" y1="220" x2="375" y2="124.7" stroke="currentColor" stroke-width="2" opacity="0.75" />
      <polygon points="375,124.7 374.3,135.9 365.7,130.9" fill="currentColor" opacity="0.75" />
      <text x="418" y="178" fill="currentColor" font-size="13" opacity="0.75">眼睛方向 V</text>

      <!-- 半向量 H，法線對齊時兩者重合 -->
      <line x1="320" y1="220" x2="320" y2="90" stroke="#3d7fd6" stroke-width="3" />
      <polygon points="320,90 325,100 315,100" fill="#3d7fd6" />
      <text x="320" y="54" fill="currentColor" font-size="12" text-anchor="middle" opacity="0.7">法線對齊半向量</text>
      <text x="320" y="72" fill="currentColor" font-size="14" text-anchor="middle">N = H</text>

      <!-- 法線偏移十五度 -->
      <line x1="320" y1="220" x2="353.6" y2="94.4" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="6 4" />
      <polygon points="353.6,94.4 355.9,105.4 346.2,102.8" fill="#94a3b8" />
      <text x="362" y="116" fill="currentColor" font-size="13" opacity="0.85">N 偏移 15°</text>

      <!-- 兩根法線之間的夾角 -->
      <path d="M320 165 A55 55 0 0 1 334.2 166.9" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.6" />
      <text x="330" y="150" fill="currentColor" font-size="12" opacity="0.8">15°</text>

      <!-- 光源與眼睛的示意圖示 -->
      <circle cx="250" cy="99" r="13" fill="#e8a33d" />
      <g stroke="#e8a33d" stroke-width="2" opacity="0.7" stroke-linecap="round">
        <line x1="250" y1="74" x2="250" y2="81" />
        <line x1="222" y1="99" x2="229" y2="99" />
        <line x1="230" y1="79" x2="235" y2="84" />
        <line x1="230" y1="119" x2="235" y2="114" />
      </g>

      <path d="M384 84 q16 -12 32 0 q-16 12 -32 0 Z" fill="none" stroke="currentColor" stroke-width="2" />
      <circle cx="400" cy="84" r="4.5" fill="currentColor" />

      <!-- 兩種結果換算成的亮度 -->
      <g>
        <line x1="70" y1="256" x2="106" y2="256" stroke="#3d7fd6" stroke-width="3" />
        <text x="116" y="261" fill="currentColor" font-size="13">N 對齊 H → dot = 1.00 → specular = 1.00</text>

        <line x1="70" y1="282" x2="106" y2="282" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="6 4" />
        <text x="116" y="287" fill="currentColor" font-size="13">N 偏移 15° → dot ≈ 0.966 → specular ≈ 0.004</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
