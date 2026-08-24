<template>
  <figure-frame
    title="光束是視線沿路撿到的散射"
    caption="眼睛看到的不是那道光本身，是光在空氣裡撞上分子之後拐了個彎、剛好朝著眼睛過來的那一小部分。所以同一條視線，穿過曬得到太陽的空氣就亮，穿過雲影裡的空氣就暗。畫光束等於回答一件事，這條視線經過的空氣有幾成曬得到太陽。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="眼睛往右看出去一條視線，沿路的取樣點有的曬得到太陽、有的落在雲的陰影裡"
    >
      <!-- 地面 -->
      <rect x="0" y="270" width="640" height="30" fill="#cfc7b4" />

      <!--
        雲擋出來的那一段陰影

        邊界是從雲的兩個輪廓角往背離太陽的方向拉出去的。
        左邊界由雲的左上角 (480,100) 出發、右邊界由右下角 (545,125) 出發，
        兩條射線在視線高度 y=200 上圍出 x 從 334 到 511 的那一段
      -->
      <polygon points="480,100 545,125 480,270 231,270" fill="#475569" opacity="0.14" />

      <!-- 太陽 -->
      <circle cx="590" cy="25" r="14" fill="#e8a33d" />
      <g stroke="#e8a33d" stroke-width="2" opacity="0.7" stroke-linecap="round">
        <line x1="590" y1="0" x2="590" y2="7" />
        <line x1="562" y1="25" x2="569" y2="25" />
        <line x1="570" y1="5" x2="575" y2="10" />
        <line x1="570" y1="45" x2="575" y2="40" />
      </g>
      <text x="548" y="66" fill="#e8a33d" font-size="14">太陽</text>

      <!-- 擋光的那朵方塊雲 -->
      <rect x="480" y="100" width="65" height="25" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />
      <text x="474" y="92" fill="currentColor" font-size="13" opacity="0.75">雲</text>

      <!-- 眼睛與那條視線 -->
      <path d="M26 200 q22 -17 44 0 q-22 17 -44 0 Z" fill="none" stroke="currentColor" stroke-width="2" />
      <circle cx="48" cy="200" r="6" fill="currentColor" />
      <line
        x1="76" y1="200" x2="520" y2="200"
        stroke="currentColor" stroke-width="1.5" opacity="0.45" stroke-dasharray="6 5"
      />
      <text x="82" y="186" fill="currentColor" font-size="13" opacity="0.75">一條視線</text>

      <!-- 沿路的取樣點：亮的在陰影之外，灰的落在陰影裡 -->
      <g fill="#e8a33d">
        <circle cx="100" cy="200" r="6" />
        <circle cx="136" cy="200" r="6" />
        <circle cx="172" cy="200" r="6" />
        <circle cx="208" cy="200" r="6" />
        <circle cx="244" cy="200" r="6" />
        <circle cx="280" cy="200" r="6" />
        <circle cx="316" cy="200" r="6" />
      </g>
      <g fill="#64748b" opacity="0.55">
        <circle cx="352" cy="200" r="6" />
        <circle cx="388" cy="200" r="6" />
        <circle cx="424" cy="200" r="6" />
        <circle cx="460" cy="200" r="6" />
        <circle cx="496" cy="200" r="6" />
      </g>

      <!-- 亮的那一點：往太陽的路上沒有東西擋著 -->
      <line
        x1="136" y1="200" x2="578" y2="30"
        stroke="#e8a33d" stroke-width="1.8" stroke-dasharray="5 4"
      />

      <!-- 暗的那一點：往太陽的路上撞到雲 -->
      <line
        x1="424" y1="200" x2="495" y2="125"
        stroke="#64748b" stroke-width="1.8" stroke-dasharray="5 4" opacity="0.85"
      />
      <g stroke="#64748b" stroke-width="2.4" stroke-linecap="round">
        <line x1="489" y1="119" x2="501" y2="131" />
        <line x1="501" y1="119" x2="489" y2="131" />
      </g>

      <!-- 撞上實體，行進到此為止 -->
      <rect x="520" y="150" width="60" height="120" fill="#8a8578" />
      <text x="514" y="290" fill="currentColor" font-size="13" opacity="0.75">撞上實體</text>

      <!-- 沿路撿到多少，攤成一條 -->
      <rect x="100" y="232" width="234" height="9" rx="4" fill="#e8a33d" />
      <rect x="334" y="232" width="177" height="9" rx="4" fill="#64748b" opacity="0.45" />
      <text x="140" y="262" fill="#e8a33d" font-size="13">這一段的空氣是亮的</text>
      <text x="356" y="262" fill="#64748b" font-size="13">這一段在雲影裡</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
