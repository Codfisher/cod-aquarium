<template>
  <figure-frame
    title="門檻前幾乎不動，一過門檻就衝上飽和"
    caption="這裡的角度與反射率都用 bias = 0.02、power = 4 實際算過。視角低於 11.48° 時反射率精準是 0，眼睛正對地面還卡在門檻裡；視角一過 12°，反射率也才 0.8%，幾乎感覺不到差別；視線拉到 35°，反射率已經衝上五成；再拉到接近掠射的 76°，反射率飆到 99.5%，整片地面幾乎泛白，其實遠遠不用拉到那麼平就已經飽和了。指數 4 的意思就是這樣，角度不夠大之前幾乎不動，一過門檻就衝得又快又猛。"
  >
    <svg
      viewBox="0 0 640 320"
      role="img"
      aria-label="眼睛在低處望向遠方的濕地，視線越平反射率越高，地面上的反光色也從暗到亮形成一道漸層"
    >
      <defs>
        <linearGradient id="wet-fresnel-gradient" x1="90" y1="0" x2="630" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0.037" stop-color="#bcdff0" stop-opacity="0.01" />
          <stop offset="0.144" stop-color="#bcdff0" stop-opacity="0.50" />
          <stop offset="0.222" stop-color="#bcdff0" stop-opacity="0.15" />
          <stop offset="0.704" stop-color="#bcdff0" stop-opacity="0.94" />
          <stop offset="0.972" stop-color="#bcdff0" stop-opacity="0.99" />
        </linearGradient>
      </defs>

      <text x="100" y="28" fill="currentColor" font-size="13" opacity="0.7">bias = 0.02, power = 4</text>

      <!-- 地面：實色底，疊一層依反射率算出來的漸層 -->
      <rect x="90" y="250" width="540" height="50" fill="#4b5563" />
      <rect x="90" y="250" width="540" height="50" fill="url(#wet-fresnel-gradient)" />

      <!-- 垂直向下看的參考線 -->
      <line x1="70" y1="110" x2="70" y2="250" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.35" />

      <!-- 眼睛 -->
      <g transform="translate(22,-90)">
        <path d="M26 200 q22 -17 44 0 q-22 17 -44 0 Z" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="48" cy="200" r="6" fill="currentColor" />
      </g>

      <!-- 五條視線 -->
      <g stroke="#3d7fd6" stroke-width="1.6" opacity="0.6">
        <line x1="70" y1="110" x2="110" y2="250" />
        <line x1="70" y1="110" x2="210" y2="250" />
        <line x1="70" y1="110" x2="168" y2="250" />
        <line x1="70" y1="110" x2="470" y2="250" />
        <line x1="70" y1="110" x2="615" y2="250" />
      </g>

      <g fill="#3d7fd6">
        <circle cx="110" cy="250" r="4" />
        <circle cx="210" cy="250" r="4" />
        <circle cx="168" cy="250" r="4" />
        <circle cx="470" cy="250" r="4" />
        <circle cx="615" cy="250" r="4" />
      </g>

      <!-- 三個代表點的視角與反射率 -->
      <text x="110" y="236" fill="#3d7fd6" font-size="12" text-anchor="middle">12°／0.8%</text>
      <text x="168" y="236" fill="#3d7fd6" font-size="12" text-anchor="middle">35°／50%</text>
      <text x="615" y="236" fill="#3d7fd6" font-size="12" text-anchor="middle">76°／99.5%</text>

      <text x="110" y="312" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">正對</text>
      <text x="615" y="312" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">掠射角</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
