<template>
  <div class="not-prose my-6 flex justify-center font-mono">
    <svg
      viewBox="0 0 380 200"
      class="w-full max-w-100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- 座標軸 -->
      <line
        x1="50" y1="160" x2="340" y2="160"
        stroke="currentColor" stroke-opacity="0.3" stroke-width="1"
      />
      <line
        x1="50" y1="160" x2="50" y2="20"
        stroke="currentColor" stroke-opacity="0.3" stroke-width="1"
      />

      <!-- X 軸箭頭 -->
      <polygon points="340,157 340,163 348,160" fill="currentColor" opacity="0.3" />
      <!-- Y 軸箭頭 -->
      <polygon points="47,20 53,20 50,12" fill="currentColor" opacity="0.3" />

      <!-- 軸標籤 -->
      <text x="348" y="172" font-size="12" fill="currentColor" opacity="0.4">dist</text>
      <text x="34" y="8" font-size="12" fill="currentColor" opacity="0.4">alpha</text>

      <!-- Y 軸刻度 -->
      <text x="42" y="164" font-size="12" fill="currentColor" opacity="0.35" text-anchor="end">0</text>
      <text x="42" y="44" font-size="12" fill="currentColor" opacity="0.35" text-anchor="end">1.0</text>
      <line
        x1="48" y1="40" x2="52" y2="40"
        stroke="currentColor" stroke-opacity="0.3" stroke-width="1"
      />

      <!-- X 軸刻度 -->
      <text x="190" y="178" font-size="12" fill="currentColor" opacity="0.35" text-anchor="middle">0.35</text>
      <line
        x1="190" y1="158" x2="190" y2="162"
        stroke="currentColor" stroke-opacity="0.3" stroke-width="1"
      />
      <text x="280" y="178" font-size="12" fill="currentColor" opacity="0.35" text-anchor="middle">0.5</text>
      <line
        x1="280" y1="158" x2="280" y2="162"
        stroke="currentColor" stroke-opacity="0.3" stroke-width="1"
      />

      <!-- edge0、edge1 虛線 -->
      <line
        x1="190" y1="40" x2="190" y2="158"
        stroke="#e8710a" stroke-opacity="0.2" stroke-width="1"
        stroke-dasharray="4 3"
      />
      <line
        x1="280" y1="160" x2="280" y2="158"
        stroke="#e8710a" stroke-opacity="0.2" stroke-width="1"
        stroke-dasharray="4 3"
      />

      <!-- 區間底色 -->
      <!-- 不透明區 -->
      <rect
        x="50" y="30" width="140" height="130"
        fill="#1e8e3e" fill-opacity="0.05"
      />
      <!-- 漸變區 -->
      <rect
        x="190" y="30" width="90" height="130"
        fill="#e8710a" fill-opacity="0.05"
      />
      <!-- 透明區 -->
      <rect
        x="280" y="30" width="60" height="130"
        fill="#d93025" fill-opacity="0.05"
      />

      <!-- 曲線：alpha = 1 - smoothstep(0.35, 0.5, dist) -->
      <!-- dist 0~0.35：alpha=1 -->
      <line
        x1="50" y1="40" x2="190" y2="40"
        stroke="#1a73e8" stroke-width="2" stroke-opacity="0.7"
      />
      <!-- dist 0.35~0.5：平滑過渡 (用貝茲曲線近似 smoothstep) -->
      <path
        d="M190,40 C220,40 250,160 280,160"
        fill="none"
        stroke="#1a73e8" stroke-width="2" stroke-opacity="0.7"
      />
      <!-- dist 0.5~：alpha=0 -->
      <line
        x1="280" y1="160" x2="330" y2="160"
        stroke="#1a73e8" stroke-width="2" stroke-opacity="0.7"
      />

      <!-- 區間標註 -->
      <text x="120" y="58" font-size="12" fill="#1e8e3e" opacity="0.6" text-anchor="middle">不透明</text>
      <text x="235" y="106" font-size="12" fill="#e8710a" opacity="0.6" text-anchor="middle">漸變</text>
      <text x="305" y="150" font-size="12" fill="#d93025" opacity="0.5" text-anchor="middle">透明</text>

      <!-- alpha = 1.0 水平參考線 -->
      <line
        x1="50" y1="40" x2="50" y2="40"
        stroke="currentColor" stroke-opacity="0.15" stroke-width="1"
        stroke-dasharray="3 3"
      />

      <!-- 底部公式 -->
      <text x="180" y="196" font-size="12" fill="currentColor" opacity="0.35" text-anchor="middle">
        alpha = 1.0 - smoothstep(0.35, 0.5, dist)
      </text>
    </svg>
  </div>
</template>
