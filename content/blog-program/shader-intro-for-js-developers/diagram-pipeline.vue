<template>
  <svg
    viewBox="0 0 260 440"
    class="w-full my-4 max-w-70 mx-auto"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <marker
        id="pipeline-arrow"
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

    <!-- 1. JS 準備資料 -->
    <rect
      x="20"
      y="10"
      width="220"
      height="60"
      rx="10"
      class="fill-amber-50 dark:fill-amber-950/40 stroke-amber-300 dark:stroke-amber-700"
      stroke-width="1.5"
    />
    <text
      x="130"
      y="36"
      text-anchor="middle"
      class="text-[14px] fill-amber-700 dark:fill-amber-300 font-medium"
    >
      JS 準備資料
    </text>
    <text
      x="130"
      y="56"
      text-anchor="middle"
      class="text-[12px] fill-amber-600/70 dark:fill-amber-400/60"
    >
      頂點、顏色
    </text>

    <!-- Arrow 1 -->
    <line
      x1="130"
      y1="74"
      x2="130"
      y2="94"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#pipeline-arrow)"
    />

    <!-- 2. Vertex Shader -->
    <rect
      x="20"
      y="100"
      width="220"
      height="60"
      rx="10"
      class="fill-teal-50 dark:fill-teal-950/40 stroke-teal-400 dark:stroke-teal-600"
      stroke-width="2"
    />
    <text
      x="130"
      y="126"
      text-anchor="middle"
      class="text-[14px] fill-teal-700 dark:fill-teal-300 font-bold"
    >
      Vertex Shader
    </text>
    <text
      x="130"
      y="146"
      text-anchor="middle"
      class="text-[12px] fill-teal-600/70 dark:fill-teal-400/60"
    >
      決定形狀位置
    </text>

    <!-- Arrow 2 -->
    <line
      x1="130"
      y1="164"
      x2="130"
      y2="184"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#pipeline-arrow)"
    />

    <!-- 3. 光柵化 -->
    <rect
      x="20"
      y="190"
      width="220"
      height="60"
      rx="10"
      class="fill-gray-50 dark:fill-gray-800/40 stroke-gray-300 dark:stroke-gray-600"
      stroke-width="1.5"
      stroke-dasharray="5,3"
    />
    <text
      x="130"
      y="216"
      text-anchor="middle"
      class="text-[14px] fill-gray-500 dark:fill-gray-400"
    >
      光柵化
    </text>
    <text
      x="130"
      y="236"
      text-anchor="middle"
      class="text-[12px] fill-gray-400 dark:fill-gray-500"
    >
      GPU 自動處理
    </text>

    <!-- Arrow 3 -->
    <line
      x1="130"
      y1="254"
      x2="130"
      y2="274"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#pipeline-arrow)"
    />

    <!-- 4. Fragment Shader -->
    <rect
      x="20"
      y="280"
      width="220"
      height="60"
      rx="10"
      class="fill-rose-50 dark:fill-rose-950/40 stroke-rose-400 dark:stroke-rose-600"
      stroke-width="2"
    />
    <text
      x="130"
      y="306"
      text-anchor="middle"
      class="text-[14px] fill-rose-700 dark:fill-rose-300 font-bold"
    >
      Fragment Shader
    </text>
    <text
      x="130"
      y="326"
      text-anchor="middle"
      class="text-[12px] fill-rose-600/70 dark:fill-rose-400/60"
    >
      決定每個像素顏色
    </text>

    <!-- Arrow 4 -->
    <line
      x1="130"
      y1="344"
      x2="130"
      y2="364"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#pipeline-arrow)"
    />

    <!-- 5. 螢幕 -->
    <rect
      x="20"
      y="370"
      width="220"
      height="60"
      rx="10"
      class="fill-violet-50 dark:fill-violet-950/40 stroke-violet-300 dark:stroke-violet-700"
      stroke-width="1.5"
    />
    <text
      x="130"
      y="400"
      text-anchor="middle"
      class="text-[14px] fill-violet-700 dark:fill-violet-300 font-medium"
    >
      螢幕上的畫面 🖥️
    </text>
  </svg>
</template>
