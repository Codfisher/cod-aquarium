<template>
  <figure-frame
    title="沿光線往上找雲，仰角決定要退多遠"
    caption="地面上一點沿著太陽反方向往上退到雲層那一層，水平方向要退的距離等於高度差乘上仰角的餘切。仰角 30 度時退 170 格，還在雲圖樣寬之內；仰角 6 度時要退到 932 格外，等於在 280 格寬的圖樣上繞了三圈多，取樣到的雲跟頭頂那朵已經脫鉤，太陽貼近地平線就只好把雲影收掉。"
  >
    <svg
      viewBox="0 0 640 360"
      role="img"
      aria-label="地面上一點沿光線往上退到雲層，仰角三十度時偏移量不大，仰角六度時偏移量遠遠超出畫面"
    >
      <!-- 雲層 -->
      <rect x="20" y="55" width="600" height="30" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />
      <text x="26" y="46" fill="currentColor" font-size="13" opacity="0.75">雲層</text>

      <!-- 沙地 -->
      <rect x="20" y="270" width="600" height="30" fill="#cfc7b4" stroke="#a89a7c" stroke-width="1.5" />
      <text x="26" y="316" fill="currentColor" font-size="13" opacity="0.75">沙地（高度 6 格）</text>

      <!-- 正上方參考線 -->
      <line
        x1="170" y1="270" x2="170" y2="55"
        stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"
      />

      <!-- 水平偏移量測（仰角 30 度那一支） -->
      <line x1="170" y1="55" x2="170" y2="26" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3" />
      <line x1="516.41" y1="70" x2="516.41" y2="26" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3" />
      <line x1="177" y1="26" x2="509.41" y2="26" stroke="#3d7fd6" stroke-width="1.5" />
      <polygon points="170,26 177,23.45 177,28.55" fill="#3d7fd6" />
      <polygon points="516.41,26 509.41,28.55 509.41,23.45" fill="#3d7fd6" />
      <text x="343" y="16" fill="#3d7fd6" font-size="13" text-anchor="middle">水平偏移 ≈170 格</text>

      <!-- 仰角 30 度：一般情況 -->
      <line
        x1="170" y1="270" x2="516.41" y2="70"
        stroke="#3d7fd6" stroke-width="3" stroke-linecap="round"
      />
      <polygon points="516.41,70 510.43,77.65 506.8,71.35" fill="#3d7fd6" />
      <circle cx="516.41" cy="70" r="6" fill="#ffffff" stroke="#3d7fd6" stroke-width="2.5" />

      <path
        d="M 216 270 A 46 46 0 0 0 209.84 247"
        fill="none" stroke="#3d7fd6" stroke-width="1.5" opacity="0.85"
      />
      <text x="228" y="252" fill="#3d7fd6" font-size="13">30°</text>

      <!-- 仰角 6 度：太陽貼近地平線 -->
      <line
        x1="170" y1="270" x2="580" y2="226.91"
        stroke="#e8a33d" stroke-width="2.5" stroke-dasharray="6 4" stroke-linecap="round"
      />
      <!-- 截斷記號，代表後面還很遠，畫不下了 -->
      <line x1="574.19" y1="219.47" x2="575.87" y2="235.39" stroke="#e8a33d" stroke-width="2" />
      <line x1="584.13" y1="218.43" x2="585.81" y2="234.35" stroke="#e8a33d" stroke-width="2" />
      <line
        x1="580" y1="226.91" x2="619.78" y2="222.73"
        stroke="#e8a33d" stroke-width="2.5" stroke-dasharray="6 4" stroke-linecap="round"
      />
      <polygon points="619.78,222.73 611.21,227.29 610.45,220.05" fill="#e8a33d" />

      <text x="396" y="188" fill="#e8a33d" font-size="13">仰角 6°</text>
      <text x="396" y="208" fill="#e8a33d" font-size="13">偏移 ≈932 格</text>
      <text x="396" y="228" fill="#e8a33d" font-size="13">≈ 3.3 圈雲圖樣寬</text>

      <!-- 地面上這一點 -->
      <circle cx="170" cy="270" r="5" fill="#3d7fd6" stroke="#ffffff" stroke-width="1.5" />
      <text x="177" y="262" fill="#3d7fd6" font-size="14" font-weight="600">P</text>

      <!-- 圖例 -->
      <line x1="60" y1="322" x2="96" y2="322" stroke="#3d7fd6" stroke-width="3" stroke-linecap="round" />
      <text x="106" y="327" fill="currentColor" font-size="13" opacity="0.8">仰角較高，偏移量在圖樣寬之內</text>

      <line x1="60" y1="344" x2="96" y2="344" stroke="#e8a33d" stroke-width="2.5" stroke-dasharray="6 4" />
      <text x="106" y="349" fill="currentColor" font-size="13" opacity="0.8">仰角貼近地平線，偏移量遠超圖樣寬，取樣脫鉤</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
