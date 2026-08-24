<template>
  <figure-frame
    title="退回半格，才對準格子中心"
    caption="世界座標除以格距，整數點會落在格子邊界上。紅點是這樣算出來的查詢點，剛好卡在格 0 與格 1 的交界，兩格的顏色各拿一半，混在一起。再退回半格，藍點就對準格子正中央，查詢完全落在自己這格，不再混到隔壁。高畫質那組水平格距是 4，半格就是 2 個世界方塊。"
  >
    <svg
      viewBox="0 0 720 270"
      role="img"
      aria-label="三個相鄰的粗格，世界座標除以格距後，整數點原本卡在格子邊界，紅點標示這個錯位；再減去半格後，藍點對準格子正中央，箭頭表示從紅點移到藍點的修正"
    >
      <defs>
        <marker
          id="gi-cell-offset-arrow"
          viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#3d7fd6" />
        </marker>
      </defs>

      <text x="350" y="50" fill="#ef4444" font-size="13" text-anchor="middle">
        沒減 0.5：查詢點卡在格界
      </text>

      <!-- 三個相鄰的粗格 -->
      <g stroke="#94a3b8" stroke-width="1.8" fill="#eef2f7">
        <rect x="80" y="90" width="180" height="80" rx="6" />
        <rect x="260" y="90" width="180" height="80" rx="6" />
        <rect x="440" y="90" width="180" height="80" rx="6" />
      </g>

      <!-- 格 0 額外標出組成它的 4 個世界方塊，其餘兩格從略 -->
      <g stroke="currentColor" stroke-width="1" opacity="0.2">
        <line x1="125" y1="90" x2="125" y2="170" />
        <line x1="170" y1="90" x2="170" y2="170" />
        <line x1="215" y1="90" x2="215" y2="170" />
      </g>

      <!-- 每一格真正的中心，虛線標出目標位置 -->
      <g stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.6">
        <line x1="170" y1="72" x2="170" y2="188" />
        <line x1="350" y1="72" x2="350" y2="188" />
        <line x1="530" y1="72" x2="530" y2="188" />
      </g>

      <!-- 格 0、格 1：紅點是沒減半格的位置，藍點是減了半格的位置 -->
      <circle cx="260" cy="130" r="7" fill="#ef4444" />
      <circle cx="440" cy="130" r="7" fill="#ef4444" />

      <line
        x1="253" y1="130" x2="182" y2="130"
        stroke="#3d7fd6" stroke-width="2.2" marker-end="url(#gi-cell-offset-arrow)"
      />
      <line
        x1="433" y1="130" x2="362" y2="130"
        stroke="#3d7fd6" stroke-width="2.2" marker-end="url(#gi-cell-offset-arrow)"
      />

      <circle cx="170" cy="130" r="7" fill="#3d7fd6" />
      <circle cx="350" cy="130" r="7" fill="#3d7fd6" />

      <text x="350" y="220" fill="#3d7fd6" font-size="13" text-anchor="middle">
        減 0.5：查詢點對準格中心
      </text>

      <g font-size="13" fill="currentColor" opacity="0.75" text-anchor="middle">
        <text x="170" y="250">格 0（4 個方塊）</text>
        <text x="350" y="250">格 1</text>
        <text x="530" y="250">格 2</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
