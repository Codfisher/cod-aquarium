<template>
  <figure-frame
    title="近乎透明、中段偏藍、遠處近白"
    caption="眼前那段幾乎看不出濁氣，蓋住原本顏色的比例趨近 0%。中距離開始偏藍，比例爬到半上下。再遠處線性霧本身已經收滿，比例等於 100%，這一段幾乎全由霧色決定。中間偏藍的那一層，下一步的兩層混色會接手處理。"
  >
    <svg
      viewBox="0 0 640 280"
      role="img"
      aria-label="眼睛望向遠方，視線依序穿過近、中、遠三段空氣，山的顏色也跟著從原本的顏色、偏藍，變成近乎全白，下方一條漸層條標出蓋住原色的比例從 0% 爬到 100%"
    >
      <!-- 地面 -->
      <rect x="0" y="170" width="640" height="18" fill="#cfc7b4" />

      <!-- 眼睛 -->
      <path d="M26 130 q22 -17 44 0 q-22 17 -44 0 Z" fill="none" stroke="currentColor" stroke-width="2" />
      <circle cx="48" cy="130" r="6" fill="currentColor" />

      <!-- 視線，依序穿過三段空氣、三片山 -->
      <line
        x1="76" y1="130" x2="580" y2="130"
        stroke="currentColor" stroke-width="1.5" opacity="0.4" stroke-dasharray="6 5"
      />

      <!--
        三片山：近、中、遠

        由近到遠越疊越矮，也越貼近地平線，這是視覺上的遠近感，
        跟後面那條漸層條要講的「蓋住原色的比例」是兩件事、但同一個方向
      -->
      <polygon points="110,170 170,60 230,170" fill="#8a8578" stroke="#5f5b52" stroke-width="1.5" />
      <polygon points="290,170 340,90 390,170" fill="#7c93ab" stroke="#5f6f82" stroke-width="1.5" />
      <polygon points="440,170 500,115 560,170" fill="#dbe0e6" stroke="#b9c0c8" stroke-width="1.2" />

      <text x="170" y="45" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.85">幾乎透明</text>
      <text x="340" y="75" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.85">偏藍</text>
      <text x="500" y="100" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.85">近乎白</text>

      <!-- 下方：蓋住原本顏色的比例，從 0% 爬到 100% -->
      <text x="320" y="204" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">蓋住原本顏色的比例</text>

      <defs>
        <linearGradient id="airBlend" x1="100" y1="0" x2="540" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#8a8578" />
          <stop offset="0.5" stop-color="#7c93ab" />
          <stop offset="1" stop-color="#dbe0e6" />
        </linearGradient>
      </defs>
      <rect x="100" y="216" width="440" height="16" rx="8" fill="url(#airBlend)" stroke="#94a3b8" stroke-width="1" opacity="0.95" />

      <text x="100" y="252" fill="currentColor" font-size="13" text-anchor="start" opacity="0.75">近｜0%</text>
      <text x="320" y="252" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.75">中｜≈ 50%</text>
      <text x="540" y="252" fill="currentColor" font-size="13" text-anchor="end" opacity="0.75">遠｜100%</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
