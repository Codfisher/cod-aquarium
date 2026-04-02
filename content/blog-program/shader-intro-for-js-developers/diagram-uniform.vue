<template>
  <svg
    viewBox="0 0 650 180"
    class="w-full my-4"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <marker
        id="uniform-arrow"
        viewBox="0 0 10 7"
        refX="10"
        refY="3.5"
        markerWidth="10"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path
          d="M 0 0 L 10 3.5 L 0 7 z"
          class="fill-violet-400 dark:fill-violet-500"
        />
      </marker>
    </defs>

    <!-- JS 區塊 -->
    <rect
      x="10"
      y="10"
      width="250"
      height="160"
      rx="12"
      class="fill-amber-50/80 dark:fill-amber-950/20 stroke-amber-300 dark:stroke-amber-800"
      stroke-width="1.5"
    />
    <text
      x="135"
      y="36"
      text-anchor="middle"
      class="text-[13px] fill-amber-700 dark:fill-amber-300 font-bold"
    >
      JavaScript 世界
    </text>

    <!-- JS 項目 -->
    <rect
      x="30"
      y="52"
      width="210"
      height="36"
      rx="6"
      class="fill-amber-100 dark:fill-amber-900/40 stroke-amber-300 dark:stroke-amber-700"
      stroke-width="1"
    />
    <text
      x="135"
      y="75"
      text-anchor="middle"
      class="text-[10px] fill-amber-800 dark:fill-amber-200 font-mono"
    >
      gl.uniform1f(loc, time)
    </text>

    <rect
      x="30"
      y="98"
      width="210"
      height="36"
      rx="6"
      class="fill-amber-100 dark:fill-amber-900/40 stroke-amber-300 dark:stroke-amber-700"
      stroke-width="1"
    />
    <text
      x="135"
      y="121"
      text-anchor="middle"
      class="text-[10px] fill-amber-800 dark:fill-amber-200 font-mono"
    >
      gl.uniform2f(loc, x, y)
    </text>

    <!-- GLSL 區塊 -->
    <rect
      x="390"
      y="10"
      width="250"
      height="160"
      rx="12"
      class="fill-cyan-50/80 dark:fill-cyan-950/20 stroke-cyan-300 dark:stroke-cyan-800"
      stroke-width="1.5"
    />
    <text
      x="515"
      y="36"
      text-anchor="middle"
      class="text-[13px] fill-cyan-700 dark:fill-cyan-300 font-bold"
    >
      GLSL 世界
    </text>

    <!-- GLSL 項目 -->
    <rect
      x="410"
      y="52"
      width="210"
      height="36"
      rx="6"
      class="fill-cyan-100 dark:fill-cyan-900/40 stroke-cyan-300 dark:stroke-cyan-700"
      stroke-width="1"
    />
    <text
      x="515"
      y="75"
      text-anchor="middle"
      class="text-[10px] fill-cyan-800 dark:fill-cyan-200 font-mono"
    >
      uniform float u_time;
    </text>

    <rect
      x="410"
      y="98"
      width="210"
      height="36"
      rx="6"
      class="fill-cyan-100 dark:fill-cyan-900/40 stroke-cyan-300 dark:stroke-cyan-700"
      stroke-width="1"
    />
    <text
      x="515"
      y="121"
      text-anchor="middle"
      class="text-[10px] fill-cyan-800 dark:fill-cyan-200 font-mono"
    >
      uniform vec2 u_mouse;
    </text>

    <!-- 箭頭：傳值 -->
    <line
      x1="245"
      y1="70"
      x2="405"
      y2="70"
      class="stroke-violet-400 dark:stroke-violet-500"
      stroke-width="2"
      marker-end="url(#uniform-arrow)"
    />
    <text
      x="325"
      y="63"
      text-anchor="middle"
      class="text-[10px] fill-violet-600 dark:fill-violet-400 font-medium"
    >
      傳值
    </text>

    <line
      x1="245"
      y1="116"
      x2="405"
      y2="116"
      class="stroke-violet-400 dark:stroke-violet-500"
      stroke-width="2"
      marker-end="url(#uniform-arrow)"
    />
    <text
      x="325"
      y="109"
      text-anchor="middle"
      class="text-[10px] fill-violet-600 dark:fill-violet-400 font-medium"
    >
      傳值
    </text>
  </svg>
</template>
