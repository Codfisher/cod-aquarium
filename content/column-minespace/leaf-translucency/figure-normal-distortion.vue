<template>
  <figure-frame
    title="法線把同一道光扳向各自的方向"
    caption="太陽是平行光，三片葉子的法線角度卻彼此差了 36 度。偏移量是零的時候，出光方向不管法線朝哪都等於陽光本身，圖上三條灰色虛線因此完全平行。偏移量調到 0.35，中間那片法線剛好對齊陽光方向，出光方向不受影響；兩側的法線偏離陽光方向，才各自扳向左右。三片葉子的出光方向因此散開 18.4 度，一整團樹冠才會整片發光。"
  >
    <svg
      viewBox="0 0 640 360"
      role="img"
      aria-label="三片法線角度不同的葉子，收到同一束平行陽光；不偏移時三條出光虛線完全平行，偏移 0.35 之後三條出光實線各自扳開一個角度"
    >
      <!-- 太陽，光是平行的 -->
      <circle cx="330" cy="20" r="9" fill="#e8a33d" />
      <g stroke="#e8a33d" stroke-width="1.6" opacity="0.7" stroke-linecap="round">
        <line x1="309" y1="20" x2="315" y2="20" />
        <line x1="345" y1="20" x2="351" y2="20" />
        <line x1="330" y1="4" x2="330" y2="10" />
      </g>
      <text x="345" y="24" fill="#e8a33d" font-size="13">太陽（很遠，光線視為平行）</text>

      <!-- 三道平行的入射陽光 -->
      <g stroke="#e8a33d" stroke-width="1.8" opacity="0.55">
        <line x1="150" y1="44" x2="150" y2="150" />
        <line x1="330" y1="44" x2="330" y2="150" />
        <line x1="510" y1="44" x2="510" y2="150" />
      </g>

      <!-- 葉子 A：法線 72 度 -->
      <g>
        <line x1="188" y1="137.6" x2="112" y2="162.4" stroke="#568c3e" stroke-width="7" stroke-linecap="round" />
        <line x1="150" y1="150" x2="164.2" y2="193.7" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="2 3" />
        <text x="172" y="216" fill="#94a3b8" font-size="12" opacity="0.85">法線</text>

        <!-- 偏移量 0：出光方向等於陽光本身 -->
        <line x1="150" y1="150" x2="150" y2="300" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="6 5" opacity="0.75" />

        <!-- 偏移量 0.35：出光方向被自己的法線扳開 -->
        <line x1="150" y1="150" x2="126" y2="298.1" stroke="#e0c34a" stroke-width="2.6" />
      </g>

      <!-- 葉子 B：法線 90 度，剛好對齊陽光方向 -->
      <g>
        <line x1="370" y1="150" x2="290" y2="150" stroke="#568c3e" stroke-width="7" stroke-linecap="round" />
        <line x1="330" y1="150" x2="330" y2="196" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="2 3" />
        <text x="338" y="200" fill="#94a3b8" font-size="12" opacity="0.85">法線</text>

        <!-- 兩種出光方向重合在同一條線上 -->
        <line x1="330" y1="150" x2="330" y2="300" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="6 5" opacity="0.75" />
        <line x1="330" y1="150" x2="330" y2="300" stroke="#e0c34a" stroke-width="2.6" />
        <text x="336" y="230" fill="currentColor" font-size="12" opacity="0.7">這片法線對齊陽光，不受偏移影響</text>
      </g>

      <!-- 葉子 C：法線 108 度 -->
      <g>
        <line x1="548" y1="162.4" x2="472" y2="137.6" stroke="#568c3e" stroke-width="7" stroke-linecap="round" />
        <line x1="510" y1="150" x2="495.8" y2="193.7" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="2 3" />
        <text x="488" y="200" fill="#94a3b8" font-size="12" opacity="0.85">法線</text>

        <line x1="510" y1="150" x2="510" y2="300" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="6 5" opacity="0.75" />
        <line x1="510" y1="150" x2="534" y2="298.1" stroke="#e0c34a" stroke-width="2.6" />
      </g>

      <!-- 圖例，放在所有出光線都結束的下緣，避開葉子 A 那兩條線 -->
      <g>
        <line x1="20" y1="322" x2="52" y2="322" stroke="#94a3b8" stroke-width="1.8" stroke-dasharray="6 5" opacity="0.75" />
        <text x="60" y="327" fill="currentColor" font-size="13" opacity="0.75">偏移量 0：三片方向相同</text>

        <line x1="20" y1="350" x2="52" y2="350" stroke="#e0c34a" stroke-width="2.6" />
        <text x="60" y="355" fill="currentColor" font-size="13" opacity="0.75">偏移量 0.35：各自扳開</text>

        <text x="380" y="327" fill="currentColor" font-size="13" opacity="0.7">三片法線相差 36 度</text>
        <text x="380" y="355" fill="currentColor" font-size="13" opacity="0.7">出光方向只跟著散開 18.4 度</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
