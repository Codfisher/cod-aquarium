<template>
  <svg
    viewBox="0 0 580 90"
    class="w-full my-4"
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
      x="10"
      y="12"
      width="175"
      height="60"
      rx="10"
      class="fill-amber-50 dark:fill-amber-950/40 stroke-amber-300 dark:stroke-amber-700"
      stroke-width="1.5"
    />
    <text
      x="97"
      y="36"
      text-anchor="middle"
      class="text-[12px] fill-amber-700 dark:fill-amber-300 font-mono font-bold"
    >
      gl_FragCoord.xy
    </text>
    <text
      x="97"
      y="56"
      text-anchor="middle"
      class="text-[10px] fill-amber-600/70 dark:fill-amber-400/60"
    >
      (0, 0) ~ (800, 600)
    </text>

    <!-- Arrow + label -->
    <line
      x1="190"
      y1="42"
      x2="255"
      y2="42"
      class="stroke-gray-400 dark:stroke-gray-500"
      stroke-width="1.5"
      marker-end="url(#uv-arrow)"
    />
    <text
      x="222"
      y="34"
      text-anchor="middle"
      class="text-[10px] fill-gray-500 dark:fill-gray-400 font-mono"
    >
      ÷ u_resolution
    </text>

    <!-- 2. UV -->
    <rect
      x="260"
      y="12"
      width="155"
      height="60"
      rx="10"
      class="fill-cyan-50 dark:fill-cyan-950/40 stroke-cyan-400 dark:stroke-cyan-700"
      stroke-width="1.5"
    />
    <text
      x="337"
      y="36"
      text-anchor="middle"
      class="text-[12px] fill-cyan-700 dark:fill-cyan-300 font-mono font-bold"
    >
      uv
    </text>
    <text
      x="337"
      y="56"
      text-anchor="middle"
      class="text-[10px] fill-cyan-600/70 dark:fill-cyan-400/60"
    >
      (0.0, 0.0) ~ (1.0, 1.0)
    </text>
  </svg>
</template>
