<template>
  <div class="diagram-uv not-prose">
    <svg
      viewBox="0 0 280 280"
      class="uv-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="uv-arrow"
          viewBox="0 0 8 6"
          refX="8"
          refY="3"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M0 0 L8 3 L0 6Z"
            class="arrow-fill"
          />
        </marker>
      </defs>

      <!-- ── 1. gl_FragCoord ── -->
      <rect
        x="24"
        y="12"
        width="232"
        height="72"
        rx="12"
        class="card card-pixel"
      />
      <rect
        x="33"
        y="20"
        width="6"
        height="56"
        rx="3"
        class="accent accent-pixel"
      />

      <!-- 小座標示意 -->
      <g
        transform="translate(50, 30)"
        class="coord-mini"
      >
        <line
          x1="0"
          y1="16"
          x2="16"
          y2="16"
        />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="16"
        />
        <circle
          cx="10"
          cy="6"
          r="2.5"
        />
      </g>

      <text
        x="148"
        y="44"
        text-anchor="middle"
        class="title title-pixel"
      >
        gl_FragCoord.xy
      </text>
      <text
        x="148"
        y="66"
        text-anchor="middle"
        class="subtitle subtitle-pixel"
      >
        (0, 0) ~ (800, 600)
      </text>

      <!-- Arrow + 運算標籤 -->
      <line
        x1="140"
        y1="88"
        x2="140"
        y2="176"
        class="arrow-line"
        marker-end="url(#uv-arrow)"
      />
      <line
        x1="140"
        y1="88"
        x2="140"
        y2="176"
        class="arrow-flow"
      />

      <!-- 運算 badge -->
      <rect
        x="82"
        y="120"
        width="116"
        height="26"
        rx="13"
        class="badge-bg"
      />
      <text
        x="140"
        y="138"
        text-anchor="middle"
        class="badge-text"
      >
        ÷ u_resolution
      </text>

      <!-- ── 2. UV ── -->
      <rect
        x="24"
        y="184"
        width="232"
        height="72"
        rx="12"
        class="card card-uv"
      />
      <rect
        x="33"
        y="192"
        width="6"
        height="56"
        rx="3"
        class="accent accent-uv"
      />

      <!-- 0-1 範圍示意 -->
      <g
        transform="translate(50, 204)"
        class="range-bar"
      >
        <rect
          width="26"
          height="5"
          rx="2.5"
        />
        <circle
          cx="0"
          cy="2.5"
          r="2.5"
        />
        <circle
          cx="26"
          cy="2.5"
          r="2.5"
        />
      </g>

      <text
        x="148"
        y="218"
        text-anchor="middle"
        class="title title-uv"
      >
        uv
      </text>
      <text
        x="148"
        y="240"
        text-anchor="middle"
        class="subtitle subtitle-uv"
      >
        (0.0, 0.0) ~ (1.0, 1.0)
      </text>
    </svg>
  </div>
</template>

<style scoped>
.diagram-uv {
  max-width: 280px;
  margin: 1.5rem auto;
}

.uv-svg {
  width: 100%;
}

/* ── Cards ── */
.card {
  stroke-width: 1.5;
}

.card-pixel {
  fill: #fffbeb;
  stroke: #fbbf24;
}

.card-uv {
  fill: #ecfeff;
  stroke: #22d3ee;
}

.accent-pixel {
  fill: #fbbf24;
  opacity: 0.5;
}

.accent-uv {
  fill: #22d3ee;
  opacity: 0.5;
}

/* ── Mini icons ── */
.coord-mini line {
  stroke: #f59e0b;
  stroke-width: 1.5;
  opacity: 0.4;
}

.coord-mini circle {
  fill: #f59e0b;
  opacity: 0.5;
}

.range-bar rect {
  fill: #22d3ee;
  opacity: 0.25;
}

.range-bar circle {
  fill: #22d3ee;
  opacity: 0.5;
}

/* ── Text ── */
.title {
  font-size: 14px;
  font-weight: 700;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
}

.subtitle {
  font-size: 12px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
}

.title-pixel { fill: #92400e; }
.subtitle-pixel { fill: #b45309; opacity: 0.55; }
.title-uv { fill: #155e75; }
.subtitle-uv { fill: #0891b2; opacity: 0.55; }

/* ── Badge ── */
.badge-bg {
  fill: #f3f4f6;
  stroke: #e5e7eb;
  stroke-width: 1;
}

.badge-text {
  font-size: 12px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-weight: 500;
  fill: #6b7280;
}

/* ── Arrows ── */
.arrow-fill { fill: #d1d5db; }

.arrow-line {
  stroke: #d1d5db;
  stroke-width: 1.5;
}

.arrow-flow {
  stroke: #a78bfa;
  stroke-width: 2;
  stroke-dasharray: 4 8;
  stroke-linecap: round;
  opacity: 0.45;
  animation: flow 1.2s linear infinite;
}

@keyframes flow {
  to { stroke-dashoffset: -12; }
}

/* ── Dark ── */
:global(html.dark) .card-pixel {
  fill: rgba(120, 53, 15, 0.15);
  stroke: #b45309;
}

:global(html.dark) .card-uv {
  fill: rgba(6, 182, 212, 0.08);
  stroke: #0891b2;
}

:global(html.dark) .accent-pixel { fill: #b45309; }
:global(html.dark) .accent-uv { fill: #0891b2; }

:global(html.dark) .coord-mini line { stroke: #fbbf24; opacity: 0.3; }
:global(html.dark) .coord-mini circle { fill: #fbbf24; opacity: 0.35; }

:global(html.dark) .range-bar rect { fill: #22d3ee; opacity: 0.15; }
:global(html.dark) .range-bar circle { fill: #22d3ee; opacity: 0.3; }

:global(html.dark) .title-pixel { fill: #fbbf24; }
:global(html.dark) .subtitle-pixel { fill: #fbbf24; opacity: 0.45; }
:global(html.dark) .title-uv { fill: #67e8f9; }
:global(html.dark) .subtitle-uv { fill: #67e8f9; opacity: 0.45; }

:global(html.dark) .badge-bg {
  fill: rgba(75, 85, 99, 0.25);
  stroke: #374151;
}

:global(html.dark) .badge-text { fill: #9ca3af; }

:global(html.dark) .arrow-fill { fill: #4b5563; }
:global(html.dark) .arrow-line { stroke: #4b5563; }
:global(html.dark) .arrow-flow { stroke: #8b5cf6; opacity: 0.3; }
</style>
