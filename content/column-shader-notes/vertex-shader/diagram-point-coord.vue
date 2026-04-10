<template>
  <div class="not-prose my-6 flex flex-col items-center gap-2 font-mono">
    <svg
      viewBox="0 0 440 185"
      class="w-full max-w-115"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- 畫布背景 -->
      <rect
        x="10" y="10" width="150" height="140" rx="6"
        fill="currentColor" fill-opacity="0.03"
        stroke="currentColor" stroke-opacity="0.15" stroke-width="1"
      />
      <text x="85" y="170" font-size="12" fill="currentColor" opacity="0.3" text-anchor="middle">畫布</text>

      <!-- 頂點位置（JS 提供的座標） -->
      <circle cx="70" cy="65" r="2.5" fill="#1a73e8" opacity="0.5" />
      <text x="70" y="84" font-size="12" fill="#1a73e8" opacity="0.5" text-anchor="middle">某頂點</text>

      <!-- gl_PointSize 範圍的正方形 -->
      <rect
        x="42" y="37" width="56" height="56" rx="2"
        fill="#1a73e8" fill-opacity="0.06"
        stroke="#1a73e8" stroke-opacity="0.3" stroke-width="1.5"
      />

      <!-- gl_PointSize 標線 -->
      <line x1="42" y1="100" x2="98" y2="100" stroke="#1a73e8" stroke-opacity="0.4" stroke-width="1" />
      <line x1="42" y1="96" x2="42" y2="104" stroke="#1a73e8" stroke-opacity="0.4" stroke-width="1" />
      <line x1="98" y1="96" x2="98" y2="104" stroke="#1a73e8" stroke-opacity="0.4" stroke-width="1" />
      <text x="70" y="114" font-size="12" fill="#1a73e8" opacity="0.6" text-anchor="middle">gl_PointSize</text>

      <!-- 箭頭：放大 -->
      <line x1="170" y1="65" x2="220" y2="65" stroke="currentColor" stroke-opacity="0.2" stroke-width="1.2" />
      <polygon points="220,61 228,65 220,69" fill="currentColor" opacity="0.2" />

      <!-- 放大後的正方形 -->
      <rect
        x="245" y="20" width="140" height="140" rx="3"
        fill="#1a73e8" fill-opacity="0.04"
        stroke="#1a73e8" stroke-opacity="0.25" stroke-width="1.5"
      />

      <!-- 座標軸 -->
      <line x1="245" y1="20" x2="382" y2="20" stroke="currentColor" stroke-opacity="0.25" stroke-width="1" />
      <line x1="245" y1="20" x2="245" y2="157" stroke="currentColor" stroke-opacity="0.25" stroke-width="1" />

      <!-- 座標標註 -->
      <text x="243" y="14" font-size="12" fill="currentColor" opacity="0.3" text-anchor="end">(0,0)</text>
      <text x="388" y="14" font-size="12" fill="currentColor" opacity="0.3">(1,0)</text>
      <text x="243" y="172" font-size="12" fill="currentColor" opacity="0.3" text-anchor="end">(0,1)</text>
      <text x="388" y="172" font-size="12" fill="currentColor" opacity="0.3">(1,1)</text>

      <!-- 示範像素 -->
      <circle cx="300" cy="115" r="4" fill="#e8710a" opacity="0.5" />
      <line x1="300" y1="115" x2="300" y2="20" stroke="#e8710a" stroke-opacity="0.15" stroke-width="1" stroke-dasharray="3 3" />
      <line x1="300" y1="115" x2="245" y2="115" stroke="#e8710a" stroke-opacity="0.15" stroke-width="1" stroke-dasharray="3 3" />
      <text x="308" y="119" font-size="12" fill="#e8710a" opacity="0.6">gl_PointCoord</text>

      <!-- 放大標題 -->
      <text x="315" y="183" font-size="12" fill="currentColor" opacity="0.3" text-anchor="middle">每個像素都有自己的座標</text>
    </svg>
  </div>
</template>
