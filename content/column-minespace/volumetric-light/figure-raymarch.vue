<template>
  <figure-frame
    title="行進法：把視線切成幾十段，一段一段問"
    caption="沒辦法一次算出「這條線上有幾成的空氣曬得到太陽」，所以改成抽樣。從鏡頭出發，沿著視線每隔一段取一個點，每一點各查一次陰影圖，最後把答案平均起來。步數決定抽得夠不夠密。而所有像素都從同一個位置起步的話，取樣點會落在以鏡頭為圓心的同心球面上，畫面上就浮出一圈一圈的紋。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="從鏡頭往右延伸的視線被切成等距的取樣點，每一點往右上角的太陽問一次"
    >
      <!--
        以鏡頭為圓心的同心球面

        取樣點沿著視線等距排開，所以每一點離鏡頭的距離都是步長的整數倍。
        不同像素的視線方向不同，但距離一樣，於是所有像素的第 n 個取樣點
        落在同一個球面上。這裡把七個球面各畫成正負十八度的一段弧
      -->
      <g stroke="#3d7fd6" stroke-width="1.2" fill="none" opacity="0.28">
        <path d="M127.1 131.5 A60 60 0 0 1 127.1 168.5" />
        <path d="M184.1 112.9 A120 120 0 0 1 184.1 187.1" />
        <path d="M241.2 94.4 A180 180 0 0 1 241.2 205.6" />
        <path d="M298.2 75.8 A240 240 0 0 1 298.2 224.2" />
        <path d="M355.3 57.2 A300 300 0 0 1 355.3 242.8" />
        <path d="M412.4 38.6 A360 360 0 0 1 412.4 261.4" />
        <path d="M469.4 20.2 A420 420 0 0 1 469.4 279.8" />
      </g>

      <!-- 視錐的兩條邊，提醒每個像素都有自己的一條線 -->
      <g stroke="currentColor" stroke-width="1.5" opacity="0.22">
        <line x1="70" y1="150" x2="527" y2="1" />
        <line x1="70" y1="150" x2="527" y2="299" />
      </g>

      <!-- 鏡頭 -->
      <polygon points="34,128 34,172 70,150" fill="currentColor" opacity="0.85" />
      <text x="24" y="196" fill="currentColor" font-size="14">鏡頭</text>

      <!-- 主角那一條視線 -->
      <line x1="70" y1="150" x2="510" y2="150" stroke="currentColor" stroke-width="2" opacity="0.55" />

      <!-- 取樣點，離鏡頭 60、120、180⋯⋯ 剛好落在上面那七個球面上 -->
      <g fill="#3d7fd6">
        <circle cx="130" cy="150" r="6" />
        <circle cx="190" cy="150" r="6" />
        <circle cx="250" cy="150" r="6" />
        <circle cx="310" cy="150" r="6" />
        <circle cx="370" cy="150" r="6" />
        <circle cx="430" cy="150" r="6" />
        <circle cx="490" cy="150" r="6" />
      </g>

      <!-- 步長 -->
      <g stroke="currentColor" stroke-width="1" opacity="0.55">
        <line x1="130" y1="172" x2="190" y2="172" />
        <line x1="130" y1="167" x2="130" y2="177" />
        <line x1="190" y1="167" x2="190" y2="177" />
      </g>
      <text x="136" y="192" fill="currentColor" font-size="13" opacity="0.75">一步</text>

      <!-- 太陽，以及每一點往它問的那一次 -->
      <circle cx="596" cy="36" r="14" fill="#e8a33d" />
      <text x="556" y="72" fill="#e8a33d" font-size="14">太陽</text>
      <!--
        一條問到底，其餘的只畫個起手式

        四條都拉到太陽的話，那個角度太平，看起來像四條橫線。
        挑中間那一點一路連到太陽，其餘的畫成同斜率的短撇，
        讀者自己就會把它們接過去
      -->
      <line
        x1="310" y1="150" x2="583" y2="41"
        stroke="#e8a33d" stroke-width="1.8" opacity="0.85" stroke-dasharray="6 4"
      />
      <g stroke="#e8a33d" stroke-width="1.6" opacity="0.55" stroke-dasharray="6 4">
        <line x1="130" y1="150" x2="205" y2="120" />
        <line x1="190" y1="150" x2="265" y2="120" />
        <line x1="250" y1="150" x2="325" y2="120" />
        <line x1="370" y1="150" x2="445" y2="120" />
        <line x1="430" y1="150" x2="505" y2="120" />
        <line x1="490" y1="150" x2="505" y2="144" />
      </g>
      <text x="196" y="82" fill="#e8a33d" font-size="14">每一點問一次「這裡曬得到太陽嗎」</text>

      <!-- 終點 -->
      <rect x="510" y="96" width="52" height="108" fill="#8a8578" />
      <text x="502" y="222" fill="currentColor" font-size="13" opacity="0.75">撞上實體</text>

      <text x="70" y="292" fill="#3d7fd6" font-size="13">藍弧是同心球面：不抖動時，所有像素的第 n 點都落在上面</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
