<template>
  <svg
    viewBox="0 0 340 560"
    class="w-full my-4 max-w-85 mx-auto"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- ===== 上半：問題 ===== -->
    <text
      x="160"
      y="20"
      text-anchor="middle"
      class="text-[14px] fill-gray-700 dark:fill-gray-300 font-bold"
    >
      問題：UV 座標的陷阱
    </text>

    <!-- 長方形畫布 -->
    <rect
      x="20"
      y="40"
      width="280"
      height="140"
      rx="6"
      class="fill-gray-50 dark:fill-gray-900/60 stroke-gray-300 dark:stroke-gray-600"
      stroke-width="1"
    />

    <!-- 橢圓（錯誤結果） -->
    <ellipse
      cx="160"
      cy="110"
      rx="84"
      ry="42"
      class="fill-rose-400/30 dark:fill-rose-500/20 stroke-rose-400 dark:stroke-rose-500"
      stroke-width="1.5"
      stroke-dasharray="4,3"
    />

    <!-- 橢圓上的 ✗ 標記 -->
    <text
      x="160"
      y="115"
      text-anchor="middle"
      class="text-[16px] fill-rose-500 dark:fill-rose-400 font-bold"
    >
      ✗
    </text>

    <!-- x 尺寸標注（畫布下方） -->
    <line
      x1="20"
      y1="192"
      x2="300"
      y2="192"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1"
    />
    <line
      x1="20"
      y1="186"
      x2="20"
      y2="198"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1"
    />
    <line
      x1="300"
      y1="186"
      x2="300"
      y2="198"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1"
    />
    <text
      x="160"
      y="210"
      text-anchor="middle"
      class="text-[12px] fill-gray-500 dark:fill-gray-400"
    >
      x: 0→1 對應 600px
    </text>

    <!-- y 尺寸標注（畫布右側） -->
    <line
      x1="308"
      y1="40"
      x2="308"
      y2="180"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1"
    />
    <line
      x1="302"
      y1="40"
      x2="314"
      y2="40"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1"
    />
    <line
      x1="302"
      y1="180"
      x2="314"
      y2="180"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1"
    />

    <!-- y 標注文字（尺寸線旁） -->
    <text
      x="316"
      y="106"
      class="text-[12px] fill-gray-500 dark:fill-gray-400"
      transform="rotate(90, 316, 106)"
      text-anchor="middle"
    >
      y: 0→1 對應 300px
    </text>

    <!-- 說明文字 -->
    <text
      x="160"
      y="278"
      text-anchor="middle"
      class="text-[12px] fill-rose-600 dark:fill-rose-400"
    >
      同樣是 0.3 的距離
    </text>
    <text
      x="160"
      y="296"
      text-anchor="middle"
      class="text-[12px] fill-rose-600 dark:fill-rose-400"
    >
      x 方向 = 180px，y 方向 = 90px
    </text>
    <text
      x="160"
      y="314"
      text-anchor="middle"
      class="text-[12px] fill-rose-600 dark:fill-rose-400"
    >
      → 圓被壓扁成橢圓！
    </text>

    <!-- ===== 下半：解法 ===== -->
    <text
      x="160"
      y="354"
      text-anchor="middle"
      class="text-[14px] fill-gray-700 dark:fill-gray-300 font-bold"
    >
      解法：x 乘上長寬比
    </text>

    <!-- 長方形畫布 -->
    <rect
      x="20"
      y="372"
      width="280"
      height="140"
      rx="6"
      class="fill-gray-50 dark:fill-gray-900/60 stroke-gray-300 dark:stroke-gray-600"
      stroke-width="1"
    />

    <!-- 正圓（正確結果） -->
    <circle
      cx="160"
      cy="442"
      r="42"
      class="fill-teal-400/30 dark:fill-teal-500/20 stroke-teal-400 dark:stroke-teal-500"
      stroke-width="1.5"
    />

    <!-- 正圓上的 ✓ 標記 -->
    <text
      x="160"
      y="447"
      text-anchor="middle"
      class="text-[16px] fill-teal-600 dark:fill-teal-400 font-bold"
    >
      ✓
    </text>

    <!-- 程式碼說明 -->
    <rect
      x="20"
      y="524"
      width="280"
      height="28"
      rx="6"
      class="fill-gray-100 dark:fill-gray-800/60"
    />
    <text
      x="160"
      y="543"
      text-anchor="middle"
      class="text-[11px] fill-teal-700 dark:fill-teal-300 font-mono"
    >
      center.x *= u_resolution.x / u_resolution.y
    </text>
  </svg>
</template>
