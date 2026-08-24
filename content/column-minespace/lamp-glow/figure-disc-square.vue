<template>
  <figure-frame
    title="方片的四個角落，衰減早就收到零"
    caption="衰減以圓心往外收，圓盤網格剛好收在歸零的地方；方片卻要多留四個角落。虛線圓外面那圈，取樣早就是純黑，白白多攤兩成一的片元。萬一衰減在邊界沒收乾淨，方片露出來的是直角分明的正方形，圓盤露出來的還是一圈圓，那才是暈該有的樣子。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="左邊方片網格，四個角落落在衰減歸零的虛線圓外面，畫成斜線的浪費區；右邊圓盤網格剛好收在同一個圓上，沒有多餘的角落"
    >
      <defs>
        <radialGradient
          id="lamp-glow-gradient"
          cx="50%" cy="50%" r="50%"
        >
          <stop offset="0%" stop-color="#e8a33d" stop-opacity="0.9" />
          <stop offset="55%" stop-color="#e8a33d" stop-opacity="0.45" />
          <stop offset="100%" stop-color="#e8a33d" stop-opacity="0" />
        </radialGradient>

        <pattern
          id="lamp-glow-waste"
          width="8" height="8"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="8" height="8" fill="#64748b" fill-opacity="0.14" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#64748b" stroke-width="2" stroke-opacity="0.55" />
        </pattern>
      </defs>

      <!-- 左邊：方片網格 -->
      <text x="160" y="34" fill="currentColor" font-size="14" text-anchor="middle">方片網格</text>

      <!-- 方片邊界，這就是實際會畫的網格範圍 -->
      <rect
        x="70" y="60" width="180" height="180"
        fill="none" stroke="currentColor" stroke-width="2.5"
      />

      <!-- 衰減本體：中心亮、往外收到零 -->
      <circle cx="160" cy="150" r="90" fill="url(#lamp-glow-gradient)" />

      <!--
        方片減去衰減圓，剩下的四個角落

        用 evenodd 直接挖空，不必分開算四塊三角形的路徑
      -->
      <path
        d="M70,60 H250 V240 H70 Z M160,150 m-90,0 a90,90 0 1,0 180,0 a90,90 0 1,0 -180,0"
        fill="url(#lamp-glow-waste)"
        fill-rule="evenodd"
      />

      <!-- 衰減收到零的那條線，方片與圓盤共用同一個半徑 -->
      <circle
        cx="160" cy="150" r="90"
        fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5 5"
      />

      <text x="160" y="270" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">
        角落多算了兩成一的片元
      </text>

      <!-- 右邊：圓盤網格 -->
      <text x="480" y="34" fill="currentColor" font-size="14" text-anchor="middle">圓盤網格</text>

      <!-- 同樣大小的方片，留一個淡淡的參考輪廓 -->
      <rect
        x="390" y="60" width="180" height="180"
        fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-dasharray="4 4" opacity="0.35"
      />

      <!-- 衰減本體，跟左邊完全同一份 -->
      <circle cx="480" cy="150" r="90" fill="url(#lamp-glow-gradient)" />

      <!-- 網格邊界剛好等於衰減歸零的圓，這條線同時是網格邊界 -->
      <circle
        cx="480" cy="150" r="90"
        fill="none" stroke="currentColor" stroke-width="2.5"
      />

      <text x="480" y="270" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">
        網格邊界＝衰減歸零的圓，沒有角落
      </text>

      <!-- 圖例 -->
      <g>
        <rect x="258" y="110" width="20" height="20" fill="url(#lamp-glow-waste)" stroke="#94a3b8" stroke-width="1" />
        <text x="284" y="124" fill="currentColor" font-size="12" opacity="0.85">已經歸零，還在算</text>

        <rect x="258" y="140" width="20" height="20" fill="url(#lamp-glow-gradient)" />
        <text x="284" y="154" fill="currentColor" font-size="12" opacity="0.85">還沒歸零，有貢獻</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
