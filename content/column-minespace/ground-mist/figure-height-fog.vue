<template>
  <figure-frame
    title="距離一樣，山谷比山脊模糊"
    caption="鏡頭到山谷、到山脊的直線距離一樣，兩點落在同一條等距弧上。只看距離的霧會把兩點糊成同樣濃度，但山谷貼著地面，泡在貼地的濁氣裡；山脊探出濁氣的頂，那一層加不上去。距離相同，看起來卻一個清楚一個模糊。"
  >
    <svg
      viewBox="0 0 640 340"
      role="img"
      aria-label="山丘剖面圖，鏡頭望向等距的山谷與山脊，山谷貼地泡在濁氣的灰色帶裡，山脊探出濁氣的頂，兩點以一條等距弧連起來"
    >
      <defs>
        <linearGradient id="mist-haze-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e6ebf1" stop-opacity="0" />
          <stop offset="100%" stop-color="#e6ebf1" stop-opacity="0.82" />
        </linearGradient>
        <!-- 濁氣只該蓋在地形上，剪裁掉山谷那個凹口上方的天空，不然霧會浮在半空中 -->
        <clipPath id="mist-terrain-clip">
          <polygon points="0,320 90,100 180,220 300,298.91 350,220 400,90 500,180 640,260 640,320" />
        </clipPath>
      </defs>

      <!--
        地形剖面，頂點對齊下面標註的兩個點

        鏡頭 (90,70)、山脊 (400,90)、山谷 (300,298.91) 都是先用腳本算過的，
        山脊到鏡頭與山谷到鏡頭的直線距離都是 310.64，山谷的地形頂點直接
        取山谷點的座標，兩者精確疊在一起
      -->
      <polygon
        points="0,320 90,100 180,220 300,298.91 350,220 400,90 500,180 640,260 640,320"
        fill="#93a67c"
        stroke="#5f6b4a"
        stroke-width="1.5"
      />

      <!-- 貼地的濁氣，越低越濃，剪裁到地形範圍內，才不會浮在山谷上方的空中 -->
      <rect x="0" y="230" width="640" height="90" fill="url(#mist-haze-band)" clip-path="url(#mist-terrain-clip)" />

      <!-- 濁氣的頂 -->
      <line x1="0" y1="230" x2="640" y2="230" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.5" />
      <text x="546" y="224" fill="currentColor" font-size="13" opacity="0.75">濁氣的頂</text>

      <!-- 等距弧：鏡頭到山脊、到山谷的距離相同 -->
      <path
        d="M 400 90 A 310.6445 310.6445 0 0 1 300 298.91"
        fill="none"
        stroke="#3d7fd6"
        stroke-width="1.5"
        stroke-dasharray="4 5"
        opacity="0.6"
      />
      <text x="392" y="198" fill="#3d7fd6" font-size="13">兩點到鏡頭一樣遠</text>

      <!-- 鏡頭望向兩點的視線 -->
      <g stroke="#3d7fd6" stroke-width="1.8" opacity="0.85" stroke-dasharray="7 5">
        <line x1="90" y1="70" x2="400" y2="90" />
        <line x1="90" y1="70" x2="300" y2="298.91" />
      </g>

      <!-- 鏡頭 -->
      <polygon points="74,58 74,82 98,70" fill="currentColor" opacity="0.85" />
      <text x="40" y="52" fill="currentColor" font-size="14">鏡頭</text>

      <!-- 山脊：探出濁氣的頂，只剩距離霧 -->
      <circle cx="400" cy="90" r="6" fill="#e8a33d" />
      <text x="412" y="70" fill="currentColor" font-size="14">山脊</text>

      <!-- 山谷：貼地，疊上濁氣。標籤放在凹口的天空裡，不壓在濁氣漸層最濃的那一段上 -->
      <circle cx="300" cy="298.91" r="6" fill="#e8a33d" />
      <text x="300" y="270" text-anchor="middle" fill="currentColor" font-size="14">山谷</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
