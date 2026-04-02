<template>
  <svg
    viewBox="0 0 550 220"
    class="w-full my-4"
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

    <!-- 1. 計算距離 -->
    <rect
      x="150"
      y="10"
      width="240"
      height="50"
      rx="10"
      class="fill-gray-50 dark:fill-gray-800/40 stroke-gray-300 dark:stroke-gray-600"
      stroke-width="1.5"
    />
    <text
      x="270"
      y="32"
      text-anchor="middle"
      class="text-[11px] fill-gray-700 dark:fill-gray-300"
    >
      計算 UV 到中心的距離
    </text>
    <text
      x="270"
      y="49"
      text-anchor="middle"
      class="text-[10px] fill-gray-500 dark:fill-gray-400 font-mono"
    >
      distance = length(uv - 0.5)
    </text>

    <!-- Arrow down -->
    <line
      x1="270"
      y1="64"
      x2="270"
      y2="88"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#circle-arrow)"
    />

    <!-- 2. 判斷菱形 -->
    <polygon
      points="270,92 400,130 270,168 140,130"
      class="fill-violet-50 dark:fill-violet-950/30 stroke-violet-400 dark:stroke-violet-600"
      stroke-width="1.5"
    />
    <text
      x="270"
      y="134"
      text-anchor="middle"
      class="text-[11px] fill-violet-700 dark:fill-violet-300 font-medium"
    >
      distance &lt; 半徑？
    </text>

    <!-- Arrow left: 是 -->
    <line
      x1="140"
      y1="130"
      x2="30"
      y2="130"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#circle-arrow)"
    />
    <text
      x="100"
      y="122"
      text-anchor="middle"
      class="text-[10px] fill-gray-500 dark:fill-gray-400"
    >
      是 ✓
    </text>

    <!-- Arrow right: 否 -->
    <line
      x1="400"
      y1="130"
      x2="510"
      y2="130"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#circle-arrow)"
    />
    <text
      x="440"
      y="122"
      text-anchor="middle"
      class="text-[10px] fill-gray-500 dark:fill-gray-400"
    >
      否 ✗
    </text>

    <!-- 左結果：圓的顏色 -->
    <rect
      x="0"
      y="140"
      width="28"
      height="28"
      rx="14"
      class="fill-teal-400 dark:fill-teal-500"
    />
    <text
      x="14"
      y="186"
      text-anchor="middle"
      class="text-[10px] fill-teal-700 dark:fill-teal-300"
    >
      圓的顏色
    </text>

    <!-- 右結果：背景色 -->
    <rect
      x="513"
      y="140"
      width="28"
      height="28"
      rx="6"
      class="fill-gray-700 dark:fill-gray-300"
    />
    <text
      x="527"
      y="186"
      text-anchor="middle"
      class="text-[10px] fill-gray-600 dark:fill-gray-400"
    >
      背景色
    </text>
  </svg>
</template>
