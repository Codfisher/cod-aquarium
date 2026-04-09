<template>
  <div class="not-prose my-6 flex justify-center font-mono">
    <svg
      viewBox="0 0 220 240"
      class="w-full max-w-55"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- 正方形區域 -->
      <rect
        x="10" y="10" width="200" height="200" rx="4"
        fill="currentColor" fill-opacity="0.03"
        stroke="currentColor" stroke-opacity="0.15" stroke-width="1.5"
      />

      <!-- dist = 0.5 的圓（discard 邊界） -->
      <circle
        cx="110" cy="110" r="100"
        fill="#1e8e3e" fill-opacity="0.05"
        stroke="#1e8e3e" stroke-opacity="0.35" stroke-width="1.5"
        stroke-dasharray="4 3"
      />

      <!-- 中心到圓邊的 dist 標線 -->
      <line
        x1="110" y1="110" x2="181" y2="39"
        stroke="#e8710a" stroke-opacity="0.6" stroke-width="1.2"
      />
      <text x="157" y="68" font-size="12" fill="#e8710a" opacity="0.8" transform="rotate(-45, 157, 68)">dist = 0.5</text>

      <!-- 中心點 -->
      <circle cx="110" cy="110" r="3" fill="#1a73e8" opacity="0.6" />
      <text x="118" y="106" font-size="12" fill="#1a73e8" opacity="0.6">(0.5, 0.5)</text>

      <!-- 區域標註 -->
      <text x="110" y="140" font-size="13" fill="#1e8e3e" opacity="0.6" text-anchor="middle" font-weight="600">保留</text>
      <text x="30" y="200" font-size="12" fill="#d93025" opacity="0.5" text-anchor="middle">discard</text>
      <text x="190" y="200" font-size="12" fill="#d93025" opacity="0.5" text-anchor="middle">discard</text>
      <text x="30" y="28" font-size="12" fill="#d93025" opacity="0.5" text-anchor="middle">discard</text>
      <text x="190" y="28" font-size="12" fill="#d93025" opacity="0.5" text-anchor="middle">discard</text>

      <!-- 底部說明 -->
      <text x="110" y="232" font-size="12" fill="currentColor" opacity="0.4" text-anchor="middle">dist > 0.5 → discard</text>
    </svg>
  </div>
</template>
