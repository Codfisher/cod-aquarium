<template>
  <figure-frame
    title="夾在中間的面誰都看不到"
    caption="一顆方塊有六個面，但只要鄰居把那一側佔滿，那個面就永遠露不出來。所以建網格之前先問六個方向「隔壁有東西嗎」，有就把那一面跳過去。圖裡這塊剖面已經少掉六成八，而真正的世界是整片實心的地底，埋起來的比例遠比這裡誇張。"
  >
    <svg
      viewBox="0 0 640 260"
      role="img"
      aria-label="方塊剖面圖，露在外面的面畫成實線，夾在中間的面畫成虛線"
    >
      <!-- 地形剖面：上面兩排露出來，底下整片是實心的 -->
      <g>
        <!-- 實心的方塊 -->
        <g fill="#8a8578" stroke="#5f5b52" stroke-width="1.5">
          <rect x="60" y="150" width="44" height="44" />
          <rect x="104" y="150" width="44" height="44" />
          <rect x="148" y="150" width="44" height="44" />
          <rect x="192" y="150" width="44" height="44" />
          <rect x="236" y="150" width="44" height="44" />
          <rect x="280" y="150" width="44" height="44" />
          <rect x="60" y="194" width="44" height="44" />
          <rect x="104" y="194" width="44" height="44" />
          <rect x="148" y="194" width="44" height="44" />
          <rect x="192" y="194" width="44" height="44" />
          <rect x="236" y="194" width="44" height="44" />
          <rect x="280" y="194" width="44" height="44" />
          <rect x="148" y="106" width="44" height="44" />
          <rect x="192" y="106" width="44" height="44" />
        </g>
      </g>

      <!-- 露在外面的面，實線加粗 -->
      <g stroke="#3d7fd6" stroke-width="4" stroke-linecap="round">
        <line x1="60" y1="150" x2="148" y2="150" />
        <line x1="148" y1="106" x2="236" y2="106" />
        <line x1="236" y1="150" x2="324" y2="150" />
        <line x1="148" y1="106" x2="148" y2="150" />
        <line x1="236" y1="106" x2="236" y2="150" />
        <line x1="60" y1="150" x2="60" y2="238" />
        <line x1="324" y1="150" x2="324" y2="238" />
        <line x1="60" y1="238" x2="324" y2="238" />
      </g>

      <!-- 夾在中間的面，虛線 -->
      <g stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 5" opacity="0.8">
        <line x1="104" y1="150" x2="104" y2="238" />
        <line x1="148" y1="150" x2="148" y2="238" />
        <line x1="192" y1="106" x2="192" y2="238" />
        <line x1="236" y1="150" x2="236" y2="238" />
        <line x1="280" y1="150" x2="280" y2="238" />
        <line x1="60" y1="194" x2="324" y2="194" />
        <line x1="148" y1="150" x2="236" y2="150" />
      </g>

      <!-- 圖例 -->
      <g>
        <line
          x1="380" y1="120" x2="416" y2="120"
          stroke="#3d7fd6" stroke-width="4" stroke-linecap="round"
        />
        <text x="426" y="125" fill="currentColor" font-size="14">露得出來，要畫</text>

        <line
          x1="380" y1="156" x2="416" y2="156"
          stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 5"
        />
        <text x="426" y="161" fill="currentColor" font-size="14">夾在中間，跳過</text>
      </g>

      <text x="380" y="206" fill="currentColor" font-size="13" opacity="0.7">
        這一小塊剖面：14 顆方塊、56 條邊
      </text>
      <text x="380" y="228" fill="currentColor" font-size="13" opacity="0.7">
        真正露得出來的只有 18 條
      </text>

      <text x="60" y="88" fill="currentColor" font-size="13" opacity="0.7">地表</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
