<template>
  <figure-frame
    title="兩碗相接處抹掉一角，脊線就浮出來"
    caption="沿著兩顆細胞中心的連線切一刀，min 畫出來是兩個 V 型碗，碗與碗相接的地方只是一道尖角，數值上並不特別。平滑版的 min 在碗底與原版完全疊合，只有尖角附近被磨掉一塊。上下兩張圖共用同一條橫軸，兩條曲線相減之後，中心是零、磨掉的地方是正值，一條沿著邊界的脊線就這樣浮出來了。"
  >
    <svg
      viewBox="0 0 640 400"
      role="img"
      aria-label="上圖：沿著一條穿過兩個細胞中心的線，min 與平滑版 min 兩條曲線幾乎重合，只在正中央的邊界附近平滑版明顯往下凹。下圖：兩者相減之後，只有邊界附近是正值，其餘全部是零，形成一條窄窄的脊線"
    >
      <!-- 圖例 -->
      <g>
        <line x1="452" y1="20" x2="488" y2="20" stroke="currentColor" stroke-width="2.5" opacity="0.75" />
        <text x="496" y="25" fill="currentColor" font-size="13" opacity="0.75">原版 min</text>

        <line x1="452" y1="40" x2="488" y2="40" stroke="#3d7fd6" stroke-width="2.5" />
        <text x="496" y="45" fill="#3d7fd6" font-size="13">平滑版 min</text>
      </g>

      <!-- 上圖：兩條 min 曲線 -->
      <g>
        <text x="70" y="26" fill="currentColor" font-size="13" opacity="0.7">兩種 min 疊在一起</text>

        <!-- 邊界的鉛垂參考線，貫穿上下兩張圖 -->
        <line
          x1="340" y1="35" x2="340" y2="340"
          stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.3"
        />

        <!-- 基準線 -->
        <line x1="70" y1="190" x2="610" y2="190" stroke="currentColor" stroke-width="1.5" opacity="0.35" />

        <!-- 原版 min：兩個 V 型碗，相接處是一道尖角 -->
        <polyline
          points="70,80 190,190 340,52.5 490,190 610,80"
          fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.75"
          stroke-linejoin="round"
        />

        <!-- 平滑版 min：碗底與原版重合，只在尖角附近被磨掉一塊 -->
        <polyline
          points="70,80 190,190 196,184.5 202,179 208,173.5 214,168 220,162.5 226,157 232,151.5 238,146 244,140.5 250,135.1 256,129.8 262,124.5 268,119.5 274,114.6 280,110 286,105.7 292,101.6 298,97.9 304,94.6 310,91.7 316,89.2 322,87.3 328,85.8 334,84.9 340,84.6 346,84.9 352,85.8 358,87.3 364,89.2 370,91.7 376,94.6 382,97.9 388,101.6 394,105.7 400,110 406,114.6 412,119.5 418,124.5 424,129.8 430,135.1 436,140.5 442,146 448,151.5 454,157 460,162.5 466,168 472,173.5 478,179 484,184.5 490,190 610,80"
          fill="none" stroke="#3d7fd6" stroke-width="2.5"
          stroke-linejoin="round"
        />

        <!-- 兩顆細胞中心：曲線在這裡碰到零 -->
        <circle cx="190" cy="190" r="5" fill="currentColor" opacity="0.8" />
        <circle cx="490" cy="190" r="5" fill="currentColor" opacity="0.8" />

        <!-- 尖角被磨掉的那一段落差 -->
        <circle cx="340" cy="52.5" r="4" fill="currentColor" opacity="0.8" />
        <circle cx="340" cy="84.6" r="4" fill="#3d7fd6" />
        <line x1="345" y1="60" x2="390" y2="68" stroke="currentColor" stroke-width="1" opacity="0.5" />
        <text x="394" y="72" fill="currentColor" font-size="13" opacity="0.75">磨掉這一塊</text>

        <text x="190" y="212" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">細胞 A 中心</text>
        <text x="340" y="212" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">邊界</text>
        <text x="490" y="212" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">細胞 B 中心</text>
      </g>

      <!-- 下圖：相減之後只剩邊界那條脊線 -->
      <g>
        <text x="70" y="260" fill="currentColor" font-size="13" opacity="0.7">相減之後：min − 平滑版 min</text>

        <line x1="70" y1="340" x2="610" y2="340" stroke="currentColor" stroke-width="1.5" opacity="0.35" />

        <polygon
          points="70,340 244,340 250,339.8 256,339.5 262,339 268,338.2 274,337 280,335.4 286,333.3 292,330.7 298,327.4 304,323.4 310,318.7 316,313.2 322,306.8 328,299.5 334,291.1 340,281.7 346,291.1 352,299.5 358,306.8 364,313.2 370,318.7 376,323.4 382,327.4 388,330.7 394,333.3 400,335.4 406,337 412,338.2 418,339 424,339.5 430,339.8 436,340 610,340"
          fill="#3d7fd6" opacity="0.25"
        />
        <polyline
          points="70,340 244,340 250,339.8 256,339.5 262,339 268,338.2 274,337 280,335.4 286,333.3 292,330.7 298,327.4 304,323.4 310,318.7 316,313.2 322,306.8 328,299.5 334,291.1 340,281.7 346,291.1 352,299.5 358,306.8 364,313.2 370,318.7 376,323.4 382,327.4 388,330.7 394,333.3 400,335.4 406,337 412,338.2 418,339 424,339.5 430,339.8 436,340 610,340"
          fill="none" stroke="#3d7fd6" stroke-width="2"
        />

        <text x="360" y="278" fill="#3d7fd6" font-size="13">只有邊界附近不是零</text>
      </g>

      <text x="340" y="378" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.6">
        沿著穿過兩個細胞中心的這條線移動
      </text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
