<template>
  <figure-frame
    title="三個門檻，三個不同時間點"
    caption="橫軸是太陽的高度，越往左代表太陽沉得越深。太陽從高度 0.06 開始變暗，到 -0.05 完全消失；月亮從 0.02 開始浮現，到 -0.14 滿格；星星從 -0.02 開始浮現，到 -0.24 才滿天。灰色那段是太陽剛消失、星星卻只有一成不到亮度的空檔，月亮先撐起了那段天色。"
  >
    <svg
      viewBox="0 0 640 320"
      role="img"
      aria-label="太陽、月亮、星星三條可見度曲線疊在同一個太陽高度座標上，太陽先熄滅、月亮接著浮現、星星最晚滿天"
    >
      <!-- 太陽消失到星空滿格之間的空檔 -->
      <rect x="136" y="54" width="253.3" height="210" fill="#64748b" opacity="0.12" />
      <text x="262.5" y="44" fill="currentColor" font-size="12" opacity="0.62" text-anchor="middle">
        太陽已經消失，星空還沒滿
      </text>

      <!-- 座標軸 -->
      <line x1="56" y1="264" x2="616" y2="264" stroke="currentColor" stroke-width="1.5" opacity="0.35" />
      <line x1="56" y1="54" x2="56" y2="264" stroke="currentColor" stroke-width="1.5" opacity="0.35" />
      <line
        x1="456" y1="54" x2="456" y2="264"
        stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.45"
      />
      <text x="456" y="282" fill="currentColor" font-size="12" opacity="0.7" text-anchor="middle">地平線（0）</text>

      <text x="46" y="58" fill="currentColor" font-size="12" opacity="0.7" text-anchor="end">1</text>
      <text x="46" y="268" fill="currentColor" font-size="12" opacity="0.7" text-anchor="end">0</text>
      <text
        x="22" y="159" fill="currentColor" font-size="12" opacity="0.7"
        text-anchor="middle" transform="rotate(-90 22 159)"
      >可見度</text>

      <text x="336" y="300" fill="currentColor" font-size="12" opacity="0.6" text-anchor="middle">
        太陽高度（往左沉得更深，往右升得更高）
      </text>

      <!-- 三條可見度曲線 -->
      <polyline
        points="56.0,264.0 69.3,264.0 82.7,264.0 96.0,264.0 109.3,264.0 122.7,264.0 136.0,264.0 149.3,264.0 162.7,264.0 176.0,264.0 189.3,264.0 202.7,264.0 216.0,264.0 229.3,264.0 242.7,264.0 256.0,264.0 269.3,264.0 282.7,264.0 296.0,264.0 309.3,264.0 322.7,264.0 336.0,264.0 349.3,264.0 362.7,264.0 376.0,264.0 389.3,264.0 402.7,259.1 416.0,245.7 429.3,225.7 442.7,200.9 456.0,173.3 469.3,144.7 482.7,117.1 496.0,92.3 509.3,72.3 522.7,58.9 536.0,54.0 549.3,54.0 562.7,54.0 576.0,54.0 589.3,54.0 602.7,54.0 616.0,54.0"
        fill="none" stroke="#e8a33d" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"
      />
      <polyline
        points="56.0,54.0 69.3,54.0 82.7,54.0 96.0,54.0 109.3,54.0 122.7,54.0 136.0,54.0 149.3,54.0 162.7,54.0 176.0,54.0 189.3,54.0 202.7,54.0 216.0,54.0 229.3,54.0 242.7,54.0 256.0,54.0 269.3,54.0 282.7,56.4 296.0,63.0 309.3,73.4 322.7,86.8 336.0,102.7 349.3,120.4 362.7,139.4 376.0,159.0 389.3,178.6 402.7,197.6 416.0,215.3 429.3,231.2 442.7,244.6 456.0,255.0 469.3,261.6 482.7,264.0 496.0,264.0 509.3,264.0 522.7,264.0 536.0,264.0 549.3,264.0 562.7,264.0 576.0,264.0 589.3,264.0 602.7,264.0 616.0,264.0"
        fill="none" stroke="#5b7bab" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"
      />
      <polyline
        points="56.0,54.0 69.3,54.0 82.7,54.0 96.0,54.0 109.3,54.0 122.7,54.0 136.0,54.0 149.3,55.3 162.7,58.9 176.0,64.6 189.3,72.3 202.7,81.6 216.0,92.3 229.3,104.3 242.7,117.1 256.0,130.7 269.3,144.7 282.7,159.0 296.0,173.3 309.3,187.3 322.7,200.9 336.0,213.7 349.3,225.7 362.7,236.4 376.0,245.7 389.3,253.4 402.7,259.1 416.0,262.7 429.3,264.0 442.7,264.0 456.0,264.0 469.3,264.0 482.7,264.0 496.0,264.0 509.3,264.0 522.7,264.0 536.0,264.0 549.3,264.0 562.7,264.0 576.0,264.0 589.3,264.0 602.7,264.0 616.0,264.0"
        fill="none" stroke="#8c6fc9" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"
      />

      <!-- 起訖的門檻點 -->
      <g opacity="0.9">
        <circle cx="536.0" cy="54.0" r="4" fill="#e8a33d" />
        <circle cx="389.3" cy="264.0" r="4" fill="#e8a33d" />
        <circle cx="482.7" cy="264.0" r="4" fill="#5b7bab" />
        <circle cx="269.3" cy="54.0" r="4" fill="#5b7bab" />
        <circle cx="429.3" cy="264.0" r="4" fill="#8c6fc9" />
        <circle cx="136.0" cy="54.0" r="4" fill="#8c6fc9" />
      </g>

      <!-- 圖例 -->
      <line x1="64" y1="18" x2="92" y2="18" stroke="#e8a33d" stroke-width="3" />
      <text x="98" y="22" fill="currentColor" font-size="13">太陽</text>
      <line x1="160" y1="18" x2="188" y2="18" stroke="#5b7bab" stroke-width="3" />
      <text x="194" y="22" fill="currentColor" font-size="13">月亮</text>
      <line x1="256" y1="18" x2="284" y2="18" stroke="#8c6fc9" stroke-width="3" />
      <text x="290" y="22" fill="currentColor" font-size="13">星星</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
