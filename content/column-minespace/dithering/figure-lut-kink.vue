<template>
  <figure-frame
    title="查找表的節點，斜率會跳一下"
    caption="查找表把一條平滑的曲線，換成節點之間一段段的直線，每個節點兩側的斜率並不相等，左圖刻意把節點縮到六個，才看得出轉折；本體的查找表有三十二格，轉折小了很多，但仍然存在。天空的漸層疊上光暈那圈放射狀的亮度，兩者相加沿著離光源的距離平滑變化，哪一圈亮度剛好落在節點上，那一圈的斜率就跳一下，浮出一道看得見的輪廓。"
  >
    <svg
      viewBox="0 0 640 280"
      role="img"
      aria-label="左圖：一條平滑的曲線與一條六節點折線幾乎重合，但在其中一個節點上，折線的方向明顯轉了一下。右圖：以光源為中心的同心圓代表畫面上平滑的亮度分布，其中一圈顏色特別醒目，代表亮度剛好落在節點上的那一圈"
    >
      <!-- 分隔兩個子圖 -->
      <line x1="318" y1="20" x2="318" y2="270" stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="4 4" />

      <!-- ============ 左圖：曲線 vs 折線 ============ -->
      <text x="60" y="16" fill="currentColor" font-size="13" font-weight="600" opacity="0.85">折線的節點</text>

      <!-- 座標軸 -->
      <line x1="50" y1="250" x2="292" y2="250" stroke="currentColor" stroke-opacity="0.35" />
      <line x1="60" y1="256" x2="60" y2="26" stroke="currentColor" stroke-opacity="0.35" />
      <text x="60" y="264" fill="currentColor" font-size="11" opacity="0.6" text-anchor="middle">0</text>
      <text x="270" y="264" fill="currentColor" font-size="11" opacity="0.6" text-anchor="middle">1</text>
      <text x="280" y="246" fill="currentColor" font-size="11" opacity="0.6">輸入</text>
      <text x="34" y="34" fill="currentColor" font-size="11" opacity="0.6">輸出</text>

      <!-- 平滑的原始曲線 -->
      <polyline
        points="60.0,250.0 70.5,249.5 81.0,247.9 91.5,245.3 102.0,241.6 112.5,236.9 123.0,231.1 133.5,224.3 144.0,216.4 154.5,207.5 165.0,197.5 175.5,186.5 186.0,174.4 196.5,161.3 207.0,147.1 217.5,131.9 228.0,115.6 238.5,98.3 249.0,79.9 259.5,60.5 270.0,40.0"
        fill="none" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" stroke-dasharray="3 4"
      />

      <!-- 查找表的折線，只在六個節點上碰到原始曲線 -->
      <polyline
        points="60,250 102,241.6 144,216.4 186,174.4 228,115.6 270,40"
        fill="none" stroke="#3d7fd6" stroke-width="2.5"
      />
      <g fill="#3d7fd6">
        <circle cx="60" cy="250" r="4" />
        <circle cx="102" cy="241.6" r="4" />
        <circle cx="186" cy="174.4" r="4" />
        <circle cx="228" cy="115.6" r="4" />
        <circle cx="270" cy="40" r="4" />
      </g>

      <!-- 圖例：虛線是原曲線，實線是查找表的折線 -->
      <line x1="70" y1="55" x2="95" y2="55" stroke="currentColor" stroke-opacity="0.4" stroke-width="1.5" stroke-dasharray="3 4" />
      <text x="100" y="59" fill="currentColor" font-size="11" opacity="0.65">平滑的原始曲線</text>
      <line x1="70" y1="75" x2="95" y2="75" stroke="#3d7fd6" stroke-width="2.5" />
      <text x="100" y="79" fill="currentColor" font-size="11" opacity="0.65">查找表的折線（6 個節點）</text>

      <!-- 若斜率不變，理應延伸到的位置；實際的折線在這裡拐了個彎 -->
      <line x1="144" y1="216.4" x2="174.0" y2="198.4" stroke="currentColor" stroke-opacity="0.5" stroke-width="1.3" stroke-dasharray="2 3" />
      <text x="178" y="200" fill="currentColor" font-size="10.5" opacity="0.6">若斜率不變</text>

      <!-- 高亮這個節點：兩側斜率不一樣 -->
      <circle cx="144" cy="216.4" r="7" fill="none" stroke="#e8a33d" stroke-width="2" />
      <circle cx="144" cy="216.4" r="4" fill="#e8a33d" />
      <text x="150" y="238" fill="#e8a33d" font-size="11.5" font-weight="600">斜率 0.6 → 1.0</text>

      <!-- ============ 右圖：畫面上疊出的一圈輪廓 ============ -->
      <text x="345" y="16" fill="currentColor" font-size="13" font-weight="600" opacity="0.85">疊在畫面上的樣子</text>

      <defs>
        <radialGradient id="lutGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#e8a33d" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#e8a33d" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="480" cy="150" r="112" fill="url(#lutGlow)" />

      <!-- 同心圓代表天空漸層疊上光暈之後，平滑變化的亮度場 -->
      <g fill="none" stroke="currentColor" stroke-opacity="0.32" stroke-width="1.3">
        <circle cx="480" cy="150" r="20" />
        <circle cx="480" cy="150" r="50" />
        <circle cx="480" cy="150" r="110" />
      </g>
      <!-- 剛好落在節點上的那一圈 -->
      <circle cx="480" cy="150" r="80" fill="none" stroke="#e8a33d" stroke-width="3" />

      <circle cx="480" cy="150" r="5" fill="#e8a33d" />
      <text x="488" y="154" fill="currentColor" font-size="12" opacity="0.75">光源</text>

      <line x1="480" y1="42" x2="480" y2="30" stroke="currentColor" stroke-opacity="0.5" stroke-width="1" />
      <text x="486" y="30" fill="currentColor" font-size="11.5" opacity="0.65">平滑的亮度等值線</text>

      <line x1="432" y1="214" x2="400" y2="244" stroke="#e8a33d" stroke-width="1" opacity="0.75" />
      <text x="345" y="256" fill="#e8a33d" font-size="12.5" font-weight="600">這一圈落在節點上，浮出輪廓</text>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
