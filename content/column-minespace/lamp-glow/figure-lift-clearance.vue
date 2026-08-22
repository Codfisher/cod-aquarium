<template>
  <figure-frame
    title="方塊的半對角線是 0.866，0.95 剛好罩住它"
    caption="方塊的中心到面正對的方向只有 0.5 格，到角對角的方向卻有 0.866 格，這是整顆方塊能藏住圓盤的最遠距離。挪 0.95 格這個半徑畫成一圈，剛好整個罩住方塊，連最糟的對角方向都還多出 0.084 格餘裕；正對一個面時餘裕更寬，有 0.45 格。不管鏡頭繞到哪個角度，圓盤都已經清出方塊之外。"
  >
    <svg
      viewBox="0 0 640 420"
      role="img"
      aria-label="方塊剖面圖，中心到對角最遠是 0.866 格，到面正對只有 0.5 格。一圈半徑 0.95 格的虛線圓整個罩住方塊，鏡頭沿對角方向看過去時，光暈圓盤剛好落在虛線圓上，只比方塊角落多出一點點"
    >
      <!-- 0.95 格的邊界：所有方向挪出去都會落在這一圈上 -->
      <circle
        cx="280" cy="235" r="161.5"
        fill="none" stroke="#3d7fd6" stroke-width="1.8" stroke-dasharray="6 5" opacity="0.8"
      />
      <text x="280" y="410" fill="#3d7fd6" font-size="13" text-anchor="middle">
        挪 0.95 格能到達的位置
      </text>

      <!-- 方塊剖面：中心到角落最遠，到面最近 -->
      <rect
        x="159.8" y="150" width="240.4" height="170"
        fill="#8a8578" stroke="#5f5b52" stroke-width="2"
      />

      <!-- 對角方向的視線，最糟的角度 -->
      <line
        x1="280" y1="235" x2="489.4" y2="86.9"
        stroke="currentColor" stroke-width="1.8" opacity="0.6" stroke-dasharray="6 4"
      />
      <!-- 正對一個面的視線，餘裕最大的角度 -->
      <line
        x1="280" y1="235" x2="280" y2="73.5"
        stroke="currentColor" stroke-width="1.4" opacity="0.4" stroke-dasharray="6 4"
      />

      <!-- 燈的原點 -->
      <circle cx="280" cy="235" r="5" fill="#e8a33d" stroke="#7c4a12" stroke-width="1.5" />
      <text x="252" y="258" fill="currentColor" font-size="13" opacity="0.8">燈（原點）</text>

      <!-- 中心到角落：0.866 格，方塊能藏住圓盤的最遠距離 -->
      <g stroke="currentColor" stroke-width="1.5" opacity="0.7">
        <line x1="395.6" y1="143.5" x2="404.8" y2="156.5" />
      </g>
      <text x="367" y="163" fill="currentColor" font-size="13" font-weight="600">0.866</text>
      <text x="367" y="181" fill="currentColor" font-size="12" opacity="0.7">對角最遠</text>

      <!-- 中心到面：0.5 格，方塊能藏住圓盤的最近距離 -->
      <g stroke="currentColor" stroke-width="1.5" opacity="0.7">
        <line x1="272" y1="150" x2="288" y2="150" />
      </g>
      <text x="266" y="186" fill="currentColor" font-size="13" font-weight="600" text-anchor="end">0.5</text>
      <text x="266" y="204" fill="currentColor" font-size="12" opacity="0.7" text-anchor="end">正對一個面</text>

      <!-- 對角方向：方塊角落與 0.95 圓之間只差 0.084 格 -->
      <g stroke="currentColor" stroke-width="1.5" opacity="0.7">
        <line x1="407.3" y1="135.2" x2="416.5" y2="148.3" />
      </g>
      <text x="424" y="170" fill="currentColor" font-size="13">0.084</text>

      <!-- 正對方向：面與 0.95 圓之間差 0.45 格，餘裕大得多 -->
      <g stroke="currentColor" stroke-width="1.5" opacity="0.7">
        <line x1="272" y1="73.5" x2="288" y2="73.5" />
      </g>
      <text x="298" y="116" fill="currentColor" font-size="13">0.45</text>

      <!-- 光暈圓盤：對角方向那一顆，剛好卡在 0.95 圓上，緊貼方塊角落 -->
      <line
        x1="423.4" y1="158.1" x2="400.3" y2="125.4"
        stroke="#e8a33d" stroke-width="9" stroke-linecap="round"
      />
      <!-- 光暈圓盤：正對方向那一顆，餘裕寬鬆 -->
      <line
        x1="260" y1="73.5" x2="300" y2="73.5"
        stroke="#e8a33d" stroke-width="9" stroke-linecap="round" opacity="0.85"
      />

      <!-- 鏡頭：沿對角方向看過去 -->
      <polygon
        points="477.2,95.6 494.3,71.2 505.8,87.6"
        fill="currentColor" opacity="0.85"
      />
      <text x="500" y="60" fill="currentColor" font-size="13" text-anchor="end">鏡頭</text>
      <text x="560" y="112" fill="currentColor" font-size="12" opacity="0.7" text-anchor="end">
        沿對角看過去
      </text>

      <!-- 圖例 -->
      <g>
        <line x1="30" y1="24" x2="66" y2="24" stroke="#e8a33d" stroke-width="9" stroke-linecap="round" />
        <text x="76" y="29" fill="currentColor" font-size="13" opacity="0.85">光暈圓盤，挪出去之後的位置</text>

        <rect x="30" y="42" width="24" height="16" fill="#8a8578" stroke="#5f5b52" stroke-width="1.5" />
        <text x="76" y="55" fill="currentColor" font-size="13" opacity="0.85">燈籠那顆方塊</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
