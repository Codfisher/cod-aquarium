<template>
  <figure-frame
    title="只有發射點跟著走，顆粒留在原地"
    caption="鏡頭從 t0 走到 t2，發射盒跟著一路挪過去，但每顆顆粒一旦生成，就留在自己出生時的世界座標上不再移動。所以 t0、t1 生出的那些顆粒，此刻全部落在現在這個發射盒之外，變成了身後的空氣；而現在的盒子裡，永遠有新生的一批。"
  >
    <svg
      viewBox="0 0 720 330"
      role="img"
      aria-label="俯視圖：鏡頭沿路徑從 t0 走到 t2，三個時間點各自的發射盒沿路徑排開，t0 與 t1 生出的顆粒留在原本的位置，只有 t2 目前的盒子跟著鏡頭"
    >
      <text x="360" y="34" fill="currentColor" font-size="14" text-anchor="middle" opacity="0.85">
        鏡頭沿路徑往右走
      </text>

      <!-- 行進路徑 -->
      <line x1="40" y1="170" x2="680" y2="170" stroke="currentColor" stroke-width="1.5" opacity="0.35" />
      <polygon points="674,163 686,170 674,177" fill="currentColor" opacity="0.6" />

      <!-- t0 發射盒（已經是過去） -->
      <rect x="45" y="85" width="170" height="170" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 5" opacity="0.4" />
      <circle cx="130" cy="170" r="5" fill="#94a3b8" opacity="0.6" />

      <!-- t1 發射盒（也已經是過去） -->
      <rect x="275" y="85" width="170" height="170" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 5" opacity="0.65" />
      <circle cx="360" cy="170" r="5" fill="#94a3b8" opacity="0.8" />

      <!-- t2 發射盒（現在），鏡頭在這裡 -->
      <rect x="505" y="85" width="170" height="170" fill="none" stroke="#3d7fd6" stroke-width="2.5" stroke-dasharray="6 5" />
      <path d="M568 170 q22 -17 44 0 q-22 17 -44 0 Z" fill="none" stroke="#3d7fd6" stroke-width="2" />
      <circle cx="590" cy="170" r="5" fill="#3d7fd6" />

      <!-- t0 生出、留在原地的顆粒 -->
      <g fill="#e8a33d" opacity="0.55">
        <circle cx="68" cy="115" r="4" />
        <circle cx="190" cy="195" r="4" />
        <circle cx="133" cy="158" r="4" />
        <circle cx="126" cy="137" r="4" />
        <circle cx="137" cy="199" r="4" />
        <circle cx="99" cy="127" r="4" />
        <circle cx="163" cy="172" r="4" />
        <circle cx="92" cy="153" r="4" />
      </g>

      <!-- t1 生出、留在原地的顆粒 -->
      <g fill="#e8a33d" opacity="0.75">
        <circle cx="304" cy="148" r="4" />
        <circle cx="354" cy="202" r="4" />
        <circle cx="421" cy="148" r="4" />
        <circle cx="379" cy="174" r="4" />
        <circle cx="364" cy="211" r="4" />
      </g>

      <!-- t2 現在盒子裡新生的顆粒 -->
      <g fill="#e8a33d">
        <circle cx="612" cy="212" r="4" />
        <circle cx="621" cy="113" r="4" />
        <circle cx="580" cy="151" r="4" />
        <circle cx="536" cy="224" r="4" />
        <circle cx="629" cy="191" r="4" />
      </g>

      <text x="130" y="278" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">t0</text>
      <text x="360" y="278" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">t1</text>
      <text x="590" y="278" fill="currentColor" font-size="13" text-anchor="middle" font-weight="600">t2（現在）</text>

      <!-- 圖例 -->
      <g>
        <circle cx="252" cy="308" r="4" fill="#e8a33d" />
        <text x="264" y="312" fill="currentColor" font-size="13" opacity="0.7">顆粒（留在世界座標上）</text>

        <rect x="440" y="300" width="16" height="12" fill="none" stroke="#3d7fd6" stroke-width="2" stroke-dasharray="4 3" />
        <text x="462" y="312" fill="currentColor" font-size="13" opacity="0.7">現在的發射盒</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
