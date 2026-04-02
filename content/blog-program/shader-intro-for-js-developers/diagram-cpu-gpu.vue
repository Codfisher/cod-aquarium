<template>
  <svg
    viewBox="0 0 700 260"
    class="w-full my-4"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <marker
        id="cpugpu-arrow"
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

    <!-- CPU 區塊 -->
    <rect
      x="10"
      y="10"
      width="680"
      height="105"
      rx="12"
      class="fill-amber-50/80 dark:fill-amber-950/20 stroke-amber-300 dark:stroke-amber-800"
      stroke-width="1.5"
    />
    <text
      x="30"
      y="38"
      class="text-[13px] fill-amber-700 dark:fill-amber-300 font-bold"
    >
      CPU 思維 — 一個廚師做所有菜
    </text>

    <!-- CPU 流程：依序處理 -->
    <rect
      x="30"
      y="55"
      width="120"
      height="42"
      rx="8"
      class="fill-amber-100 dark:fill-amber-900/40 stroke-amber-400 dark:stroke-amber-700"
      stroke-width="1"
    />
    <text
      x="90"
      y="81"
      text-anchor="middle"
      class="text-[11px] fill-amber-800 dark:fill-amber-200"
    >
      處理 Pixel 1
    </text>

    <line
      x1="155"
      y1="76"
      x2="185"
      y2="76"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#cpugpu-arrow)"
    />

    <rect
      x="190"
      y="55"
      width="120"
      height="42"
      rx="8"
      class="fill-amber-100 dark:fill-amber-900/40 stroke-amber-400 dark:stroke-amber-700"
      stroke-width="1"
    />
    <text
      x="250"
      y="81"
      text-anchor="middle"
      class="text-[11px] fill-amber-800 dark:fill-amber-200"
    >
      處理 Pixel 2
    </text>

    <line
      x1="315"
      y1="76"
      x2="345"
      y2="76"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#cpugpu-arrow)"
    />

    <rect
      x="350"
      y="55"
      width="120"
      height="42"
      rx="8"
      class="fill-amber-100 dark:fill-amber-900/40 stroke-amber-400 dark:stroke-amber-700"
      stroke-width="1"
    />
    <text
      x="410"
      y="81"
      text-anchor="middle"
      class="text-[11px] fill-amber-800 dark:fill-amber-200"
    >
      處理 Pixel 3
    </text>

    <line
      x1="475"
      y1="76"
      x2="505"
      y2="76"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#cpugpu-arrow)"
    />

    <text
      x="540"
      y="81"
      class="text-[12px] fill-amber-600/60 dark:fill-amber-400/50"
    >
      ...一個一個慢慢來
    </text>

    <!-- GPU 區塊 -->
    <rect
      x="10"
      y="140"
      width="680"
      height="105"
      rx="12"
      class="fill-cyan-50/80 dark:fill-cyan-950/20 stroke-cyan-300 dark:stroke-cyan-800"
      stroke-width="1.5"
    />
    <text
      x="30"
      y="168"
      class="text-[13px] fill-cyan-700 dark:fill-cyan-300 font-bold"
    >
      GPU 思維 — 一萬個廚師同時做菜
    </text>

    <!-- GPU 流程：同時處理 -->
    <rect
      x="30"
      y="185"
      width="90"
      height="42"
      rx="8"
      class="fill-cyan-100 dark:fill-cyan-900/40 stroke-cyan-400 dark:stroke-cyan-700"
      stroke-width="1"
    />
    <text
      x="75"
      y="211"
      text-anchor="middle"
      class="text-[11px] fill-cyan-800 dark:fill-cyan-200"
    >
      Pixel 1
    </text>

    <rect
      x="135"
      y="185"
      width="90"
      height="42"
      rx="8"
      class="fill-cyan-100 dark:fill-cyan-900/40 stroke-cyan-400 dark:stroke-cyan-700"
      stroke-width="1"
    />
    <text
      x="180"
      y="211"
      text-anchor="middle"
      class="text-[11px] fill-cyan-800 dark:fill-cyan-200"
    >
      Pixel 2
    </text>

    <rect
      x="240"
      y="185"
      width="90"
      height="42"
      rx="8"
      class="fill-cyan-100 dark:fill-cyan-900/40 stroke-cyan-400 dark:stroke-cyan-700"
      stroke-width="1"
    />
    <text
      x="285"
      y="211"
      text-anchor="middle"
      class="text-[11px] fill-cyan-800 dark:fill-cyan-200"
    >
      Pixel 3
    </text>

    <rect
      x="345"
      y="185"
      width="90"
      height="42"
      rx="8"
      class="fill-cyan-100 dark:fill-cyan-900/40 stroke-cyan-400 dark:stroke-cyan-700"
      stroke-width="1"
    />
    <text
      x="390"
      y="211"
      text-anchor="middle"
      class="text-[11px] fill-cyan-800 dark:fill-cyan-200"
    >
      Pixel 4
    </text>

    <rect
      x="450"
      y="185"
      width="90"
      height="42"
      rx="8"
      class="fill-cyan-100 dark:fill-cyan-900/40 stroke-cyan-400 dark:stroke-cyan-700"
      stroke-width="1"
    />
    <text
      x="495"
      y="211"
      text-anchor="middle"
      class="text-[11px] fill-cyan-800 dark:fill-cyan-200"
    >
      Pixel 5
    </text>

    <text
      x="570"
      y="211"
      class="text-[12px] fill-cyan-600/60 dark:fill-cyan-400/50"
    >
      ...全部同時！
    </text>
  </svg>
</template>
