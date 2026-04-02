<template>
  <svg
    viewBox="0 0 260 380"
    class="w-full my-4 max-w-70 mx-auto"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <marker
        id="circle-arrow"
        viewBox="0 0 10 7"
        refX="10"
        refY="3.5"
        markerWidth="8"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path
          d="M 0 0 L 10 3.5 L 0 7 z"
          class="fill-gray-400 dark:fill-gray-500"
        />
      </marker>
    </defs>

    <!-- 1. 修正長寬比 -->
    <rect
      x="20"
      y="10"
      width="220"
      height="50"
      rx="10"
      class="fill-gray-50 dark:fill-gray-800/40 stroke-gray-300 dark:stroke-gray-600"
      stroke-width="1.5"
    />
    <text
      x="130"
      y="30"
      text-anchor="middle"
      class="text-[13px] fill-gray-700 dark:fill-gray-300"
    >
      修正長寬比
    </text>
    <text
      x="130"
      y="48"
      text-anchor="middle"
      class="text-[11px] fill-gray-500 dark:fill-gray-400 font-mono"
    >
      center.x *= aspect
    </text>

    <!-- Arrow -->
    <line
      x1="130"
      y1="64"
      x2="130"
      y2="84"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#circle-arrow)"
    />

    <!-- 2. 計算距離 -->
    <rect
      x="20"
      y="90"
      width="220"
      height="50"
      rx="10"
      class="fill-gray-50 dark:fill-gray-800/40 stroke-gray-300 dark:stroke-gray-600"
      stroke-width="1.5"
    />
    <text
      x="130"
      y="110"
      text-anchor="middle"
      class="text-[13px] fill-gray-700 dark:fill-gray-300"
    >
      計算到中心的距離
    </text>
    <text
      x="130"
      y="128"
      text-anchor="middle"
      class="text-[11px] fill-gray-500 dark:fill-gray-400 font-mono"
    >
      distance = length(center)
    </text>

    <!-- Arrow -->
    <line
      x1="130"
      y1="144"
      x2="130"
      y2="164"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#circle-arrow)"
    />

    <!-- 3. 判斷 -->
    <polygon
      points="130,170 230,210 130,250 30,210"
      class="fill-violet-50 dark:fill-violet-950/30 stroke-violet-400 dark:stroke-violet-600"
      stroke-width="1.5"
    />
    <text
      x="130"
      y="214"
      text-anchor="middle"
      class="text-[13px] fill-violet-700 dark:fill-violet-300 font-medium"
    >
      distance &lt; 半徑
    </text>

    <!-- Arrow left: 是 -->
    <line
      x1="80"
      y1="250"
      x2="50"
      y2="290"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#circle-arrow)"
    />
    <text
      x="50"
      y="268"
      text-anchor="middle"
      class="text-[11px] fill-gray-500 dark:fill-gray-400"
    >
      是
    </text>

    <!-- Arrow right: 否 -->
    <line
      x1="180"
      y1="250"
      x2="210"
      y2="290"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#circle-arrow)"
    />
    <text
      x="210"
      y="268"
      text-anchor="middle"
      class="text-[11px] fill-gray-500 dark:fill-gray-400"
    >
      否
    </text>

    <!-- 左結果：圓的顏色 -->
    <rect
      x="28"
      y="298"
      width="40"
      height="40"
      rx="20"
      class="fill-teal-400 dark:fill-teal-500"
    />
    <text
      x="48"
      y="356"
      text-anchor="middle"
      class="text-[12px] fill-teal-700 dark:fill-teal-300"
    >
      圓的顏色
    </text>

    <!-- 右結果：背景色 -->
    <rect
      x="190"
      y="298"
      width="40"
      height="40"
      rx="6"
      class="fill-gray-700 dark:fill-gray-300"
    />
    <text
      x="210"
      y="356"
      text-anchor="middle"
      class="text-[12px] fill-gray-600 dark:fill-gray-400"
    >
      背景色
    </text>
  </svg>
</template>
