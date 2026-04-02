<template>
  <svg
    viewBox="0 0 260 230"
    class="w-full my-4 max-w-70 mx-auto"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <marker
        id="uv-arrow"
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
      x="20"
      y="10"
      width="220"
      height="64"
      rx="10"
      class="fill-amber-50 dark:fill-amber-950/40 stroke-amber-300 dark:stroke-amber-700"
      stroke-width="1.5"
    />
    <text
      x="130"
      y="36"
      text-anchor="middle"
      class="text-[14px] fill-amber-700 dark:fill-amber-300 font-mono font-bold"
    >
      gl_FragCoord.xy
    </text>
    <text
      x="130"
      y="58"
      text-anchor="middle"
      class="text-[12px] fill-amber-600/70 dark:fill-amber-400/60"
    >
      (0, 0) ~ (800, 600)
    </text>

    <!-- Arrow + label -->
    <line
      x1="130"
      y1="78"
      x2="130"
      y2="146"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#uv-arrow)"
    />
    <text
      x="142"
      y="118"
      class="text-[12px] fill-gray-500 dark:fill-gray-400 font-mono"
    >
      ÷ u_resolution
    </text>

    <!-- 2. UV -->
    <rect
      x="20"
      y="152"
      width="220"
      height="64"
      rx="10"
      class="fill-cyan-50 dark:fill-cyan-950/40 stroke-cyan-400 dark:stroke-cyan-700"
      stroke-width="1.5"
    />
    <text
      x="130"
      y="178"
      text-anchor="middle"
      class="text-[14px] fill-cyan-700 dark:fill-cyan-300 font-mono font-bold"
    >
      uv
    </text>
    <text
      x="130"
      y="200"
      text-anchor="middle"
      class="text-[12px] fill-cyan-600/70 dark:fill-cyan-400/60"
    >
      (0.0, 0.0) ~ (1.0, 1.0)
    </text>
  </svg>
</template>
