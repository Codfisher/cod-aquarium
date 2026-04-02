<template>
  <svg
    viewBox="0 0 600 100"
    class="w-full my-4"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <marker
        id="frag-arrow"
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

    <!-- 1. gl_FragCoord -->
    <rect
      x="10"
      y="15"
      width="155"
      height="65"
      rx="10"
      class="fill-teal-50 dark:fill-teal-950/40 stroke-teal-400 dark:stroke-teal-600"
      stroke-width="2"
    />
    <text
      x="87"
      y="42"
      text-anchor="middle"
      class="text-[12px] fill-teal-700 dark:fill-teal-300 font-mono font-bold"
    >
      gl_FragCoord
    </text>
    <text
      x="87"
      y="62"
      text-anchor="middle"
      class="text-[11px] fill-teal-600/70 dark:fill-teal-400/60"
    >
      我在哪裡？
    </text>

    <!-- Arrow 1 -->
    <line
      x1="170"
      y1="48"
      x2="210"
      y2="48"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#frag-arrow)"
    />

    <!-- 2. 你的計算邏輯 -->
    <rect
      x="215"
      y="15"
      width="155"
      height="65"
      rx="10"
      class="fill-gray-50 dark:fill-gray-800/40 stroke-gray-300 dark:stroke-gray-600"
      stroke-width="1.5"
      stroke-dasharray="5,3"
    />
    <text
      x="292"
      y="52"
      text-anchor="middle"
      class="text-[12px] fill-gray-600 dark:fill-gray-300"
    >
      你的計算邏輯
    </text>

    <!-- Arrow 2 -->
    <line
      x1="375"
      y1="48"
      x2="415"
      y2="48"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#frag-arrow)"
    />

    <!-- 3. gl_FragColor -->
    <rect
      x="420"
      y="15"
      width="165"
      height="65"
      rx="10"
      class="fill-rose-50 dark:fill-rose-950/40 stroke-rose-400 dark:stroke-rose-600"
      stroke-width="2"
    />
    <text
      x="502"
      y="42"
      text-anchor="middle"
      class="text-[12px] fill-rose-700 dark:fill-rose-300 font-mono font-bold"
    >
      gl_FragColor
    </text>
    <text
      x="502"
      y="62"
      text-anchor="middle"
      class="text-[11px] fill-rose-600/70 dark:fill-rose-400/60"
    >
      我要什麼顏色
    </text>
  </svg>
</template>
