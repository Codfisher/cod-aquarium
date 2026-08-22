<template>
  <figure-frame
    title="濁氣依高度線性變薄"
    caption="aerialGround.x 訂在十格，越低的地方權重越接近 1。山谷底（y=0）算出來約 0.83，半山腰（y=5）約 0.42，一過十格就直接掉到 0，山頭因此完全露出。這個權重之後乘進 aerialAmount，才決定這一點最終蓋了幾成。"
  >
    <svg
      viewBox="0 0 640 300"
      role="img"
      aria-label="地形剖面圖，濁氣從地面往上十格線性變薄，山谷底權重約 0.83，半山腰約 0.42，超過十格的山頭權重為 0"
    >
      <!-- 地下 -->
      <rect x="0" y="230" width="640" height="70" fill="#cfc7b4" />

      <!--
        地形剖面：從左邊的山谷一路爬升到右邊的山頭

        山谷底是平地（y=0，也就是下面那條基準線本身）。
        半山腰墊高到 y=5，山頭再墊高到 y=15，兩塊剛好接成一道階梯狀的稜線。

        谷底那段（x=40-220）額外貼著地面線鋪一條矮色塊，純粹是為了跟濁氣的
        白色漸層拉出對比，高度壓在 8px 只是貼著地面，不代表谷底真的墊高
      -->
      <g fill="#8a8578" stroke="#5f5b52" stroke-width="1.5">
        <rect x="40" y="222" width="180" height="8" />
        <rect x="220" y="190" width="140" height="40" />
        <rect x="360" y="110" width="200" height="120" />
      </g>

      <!--
        濁氣：一張由下往上變透明的白色圖層

        漸層的兩個端點刻意抓在 y=-2（權重 1，理論上的滿值）與 y=10（權重 0，濁氣的頂），
        矩形本身只畫出 y=0 到 y=10 這段看得到的範圍，
        但漸層的插值結果在地面那一列自然就對到 0.83，半山腰那一列對到 0.42
      -->
      <defs>
        <linearGradient id="hazeGradient" x1="0" y1="246" x2="0" y2="150" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.6" />
          <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect x="40" y="150" width="570" height="80" fill="url(#hazeGradient)" />

      <!-- 濁氣的頂：aerialGround.x = 10 格。單獨留一整排在最上面，才不會跟左右兩個取樣點的標籤擠在一起 -->
      <line x1="40" y1="150" x2="610" y2="150" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.75" />
      <text x="320" y="30" fill="currentColor" font-size="13" text-anchor="middle" opacity="0.8">虛線是濁氣的頂 aerialGround.x = 10 格</text>

      <!-- 高度軸 -->
      <g stroke="currentColor" stroke-width="1.2" opacity="0.5">
        <line x1="40" y1="86" x2="40" y2="230" />
        <line x1="35" y1="230" x2="40" y2="230" />
        <line x1="35" y1="190" x2="40" y2="190" />
        <line x1="35" y1="150" x2="40" y2="150" />
        <line x1="35" y1="110" x2="40" y2="110" />
      </g>
      <g fill="currentColor" font-size="12" opacity="0.6" text-anchor="end">
        <text x="30" y="234">0</text>
        <text x="30" y="194">5</text>
        <text x="30" y="154">10</text>
        <text x="30" y="114">15</text>
      </g>
      <text x="14" y="78" fill="currentColor" font-size="12" opacity="0.6">格</text>

      <!-- 三個取樣點與各自的權重 -->
      <g>
        <!-- 山谷底 y=0 -->
        <line x1="130" y1="150" x2="130" y2="226" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.55" />
        <circle cx="130" cy="230" r="5" fill="#3d7fd6" />
        <text x="130" y="128" fill="currentColor" font-size="13" text-anchor="middle">山谷底 y = 0</text>
        <text x="130" y="146" fill="#3d7fd6" font-size="13" text-anchor="middle" font-weight="600">aerialLow ≈ 0.83</text>

        <!-- 半山腰 y=5 -->
        <line x1="290" y1="140" x2="290" y2="186" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.55" />
        <circle cx="290" cy="190" r="5" fill="#3d7fd6" />
        <text x="290" y="118" fill="currentColor" font-size="13" text-anchor="middle">半山腰 y = 5</text>
        <text x="290" y="136" fill="#3d7fd6" font-size="13" text-anchor="middle" font-weight="600">aerialLow ≈ 0.42</text>

        <!-- 山頭 y=15，已經露出濁氣之外 -->
        <circle cx="460" cy="110" r="5" fill="#94a3b8" />
        <text x="460" y="58" fill="currentColor" font-size="13" text-anchor="middle">山頭 y = 15</text>
        <text x="460" y="76" fill="#94a3b8" font-size="13" text-anchor="middle" font-weight="600">aerialLow = 0（露出）</text>
      </g>
    </svg>
  </figure-frame>
</template>

<script setup lang="ts">
import FigureFrame from '../demo/figure-frame.vue'
</script>
