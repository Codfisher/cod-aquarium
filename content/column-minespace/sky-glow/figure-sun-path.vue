<template>
  <figure-frame
    title="兩根軸怎麼畫出一條傾斜的路徑"
    caption="日出與日落一定落在地平線上、彼此相對；正午與半夜也是同一件事，只是換了一根軸。兩根軸永遠精確垂直——這是結構保證，否則太陽走的軌跡會歪成橢圓。正午不在正上方，是因為 NOON_AXIS 本身仰角只有約 58°，不是垂直軸的問題。月亮永遠取太陽的反方向，是同一個圓上正對面的那一點。"
  >
    <svg
      viewBox="0 0 640 340"
      role="img"
      aria-label="太陽的路徑示意圖：一個圓被兩根軸切出日出、正午、日落、半夜四個位置，太陽與月亮永遠落在圓上相對的兩點"
    >
      <!-- 地平線，正好通過圓心，因為指向日出的那根軸沒有垂直分量 -->
      <line
        x1="40" y1="165" x2="600" y2="165"
        stroke="currentColor" stroke-width="1.5" opacity="0.32"
      />
      <text x="566" y="157" fill="currentColor" font-size="13" opacity="0.6">地平線</text>

      <!-- 太陽與月亮共用的那個圓 -->
      <circle
        cx="320" cy="165" r="110"
        fill="none" stroke="currentColor" stroke-width="2" opacity="0.4"
      />

      <!-- 兩根軸，從圓心指出去 -->
      <g stroke="#6366f1" stroke-width="3" stroke-linecap="round">
        <line x1="320" y1="165" x2="430" y2="165" />
        <line
          x1="320" y1="165" x2="320" y2="55"
          stroke-dasharray="7 5"
        />
      </g>
      <text x="380" y="151" fill="#6366f1" font-size="11" font-family="ui-monospace, monospace" text-anchor="middle">SUNRISE_AXIS</text>
      <text x="345" y="118" fill="#6366f1" font-size="11" font-family="ui-monospace, monospace">NOON_AXIS</text>

      <!-- 圓心 -->
      <circle cx="320" cy="165" r="3.5" fill="currentColor" opacity="0.55" />

      <!-- 四個關鍵位置：日出、正午、日落、半夜，全部落在圓上 -->
      <g fill="currentColor" opacity="0.6">
        <circle cx="430" cy="165" r="4.5" />
        <circle cx="210" cy="165" r="4.5" />
        <circle cx="320" cy="55" r="4.5" />
        <circle cx="320" cy="275" r="4.5" />
      </g>
      <text x="464" y="170" fill="currentColor" font-size="13">日出</text>
      <text x="176" y="170" fill="currentColor" font-size="13" text-anchor="end">日落</text>
      <text x="320" y="18" fill="currentColor" font-size="13" text-anchor="middle">正午</text>
      <text x="320" y="318" fill="currentColor" font-size="13" text-anchor="middle">半夜</text>

      <!-- 此刻的太陽與月亮：同一個圓上正對面的兩點 -->
      <line
        x1="404.3" y1="94.3" x2="235.7" y2="235.7"
        stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.4"
      />
      <circle cx="404.3" cy="94.3" r="14" fill="#e8a33d" opacity="0.22" />
      <circle cx="404.3" cy="94.3" r="7" fill="#e8a33d" />
      <text x="430" y="80" fill="#e8a33d" font-size="13">太陽（此刻）</text>

      <circle cx="235.7" cy="235.7" r="7" fill="#5b7bab" />
      <text x="213" y="264" fill="#5b7bab" font-size="13" text-anchor="end">月亮</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
