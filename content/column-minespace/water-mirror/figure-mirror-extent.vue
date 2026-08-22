<template>
  <figure-frame
    title="重心加最遠距離，會把鏡子灌成四十格"
    caption="蛙聲澤的水面 28 格見方，重心落在正中央，四個角離重心都是 14×√2 ≈ 19.8。把這個角落的距離直接當半徑去鋪一面正方形鏡子，邊長就變成約 39.6，四捨五入是 40 格見方，比 32 格寬的木座還寬，四邊各探出四格，懸在外圈的石板路上方。外接矩形量出來的鏡子只比水面寬一點點，穩穩收在木座裡。"
  >
    <svg
      viewBox="0 0 640 480"
      role="img"
      aria-label="俯視圖：水面與木座都是正方形，用重心加最遠距離算出的鏡子明顯超出木座範圍，用外接矩形算出的鏡子則貼著水面邊緣"
    >
      <!-- 木座 -->
      <rect x="176" y="86" width="288" height="288" fill="#c9a876" opacity="0.28" stroke="#8a6d3f" stroke-width="2" />

      <!-- 水面 -->
      <rect x="194" y="104" width="252" height="252" fill="#3d7fd6" opacity="0.22" stroke="#2f5fa8" stroke-width="2" />

      <!-- 重心到水面角落的距離，也就是誤用的半徑 -->
      <line x1="320" y1="230" x2="446" y2="104" stroke="#e0603d" stroke-width="1.4" stroke-dasharray="5 4" opacity="0.75" />

      <!-- 以重心為圓心、半徑等於角落距離的圓，恰好穿過水面四個角 -->
      <circle cx="320" cy="230" r="178.2" fill="none" stroke="#e0603d" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.5" />

      <!-- 重心加最遠距離做出的鏡子：半徑直接當成半寬，灌成 40 格見方 -->
      <rect x="140" y="50" width="360" height="360" fill="none" stroke="#e0603d" stroke-width="2.4" stroke-dasharray="9 6" />

      <!-- 外接矩形做出的鏡子：只比水面略寬，幾乎貼齊水面邊緣 -->
      <rect x="192.5" y="102.5" width="255" height="255" fill="none" stroke="#4caf82" stroke-width="2.4" />

      <!-- 右側探出木座的那四格，標一段長度示意 -->
      <g stroke="currentColor" stroke-width="1" opacity="0.55">
        <line x1="464" y1="230" x2="500" y2="230" />
        <line x1="464" y1="224" x2="464" y2="236" />
        <line x1="500" y1="224" x2="500" y2="236" />
      </g>
      <text x="466" y="218" fill="currentColor" font-size="12" opacity="0.7">4 格露空</text>

      <!-- 重心 -->
      <circle cx="320" cy="230" r="4" fill="currentColor" />
      <text x="298" y="252" fill="currentColor" font-size="12" opacity="0.75">重心</text>

      <!-- 角落距離標註 -->
      <text x="384" y="150" fill="#e0603d" font-size="12" opacity="0.9">14×√2 ≈ 19.8</text>

      <!-- 主要標籤 -->
      <text x="222" y="120" fill="#2f5fa8" font-size="14">水面 28 格</text>
      <text x="182" y="366" fill="#8a6d3f" font-size="14">木座 32 格</text>

      <!-- 圖例 -->
      <g>
        <rect x="40" y="433" width="20" height="14" fill="#3d7fd6" opacity="0.3" stroke="#2f5fa8" stroke-width="1.5" />
        <text x="68" y="445" fill="currentColor" font-size="13" opacity="0.85">水面</text>

        <rect x="340" y="433" width="20" height="14" fill="#c9a876" opacity="0.35" stroke="#8a6d3f" stroke-width="1.5" />
        <text x="368" y="445" fill="currentColor" font-size="13" opacity="0.85">木座</text>

        <rect x="40" y="461" width="20" height="14" fill="none" stroke="#4caf82" stroke-width="2.4" />
        <text x="68" y="473" fill="currentColor" font-size="13" opacity="0.85">外接矩形量出來的鏡子</text>

        <rect x="340" y="461" width="20" height="14" fill="none" stroke="#e0603d" stroke-width="2" stroke-dasharray="6 4" />
        <text x="368" y="473" fill="currentColor" font-size="13" opacity="0.85">重心加最遠距離量出來的鏡子</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
