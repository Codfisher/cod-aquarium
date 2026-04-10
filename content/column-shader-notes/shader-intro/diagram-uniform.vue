<template>
  <div class="diagram-uniform not-prose">
    <svg
      viewBox="0 0 280 480"
      class="uniform-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="uni-arrow"
          viewBox="0 0 10 7"
          refX="10"
          refY="3.5"
          markerWidth="9"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M0 0 L10 3.5 L0 7Z"
            class="arrow-marker"
          />
        </marker>
      </defs>

      <!-- ═══ JS 世界 ═══ -->
      <rect
        x="14"
        y="10"
        width="252"
        height="170"
        rx="14"
        class="world world-js"
      />
      <!-- 標題底色條 -->
      <rect
        x="14"
        y="10"
        width="252"
        height="36"
        rx="14"
        class="world-header world-header-js"
      />
      <rect
        x="14"
        y="32"
        width="252"
        height="14"
        class="world-header world-header-js"
      />
      <text
        x="140"
        y="34"
        text-anchor="middle"
        class="world-title world-title-js"
      >
        JavaScript
      </text>

      <!-- JS code 1 -->
      <rect
        x="28"
        y="58"
        width="224"
        height="40"
        rx="8"
        class="code-block code-block-js"
      />
      <text
        x="140"
        y="83"
        text-anchor="middle"
        class="code-text code-text-js"
      >
        gl.uniform1f(loc, time)
      </text>

      <!-- JS code 2 -->
      <rect
        x="28"
        y="110"
        width="224"
        height="40"
        rx="8"
        class="code-block code-block-js"
      />
      <text
        x="140"
        y="135"
        text-anchor="middle"
        class="code-text code-text-js"
      >
        gl.uniform2f(loc, x, y)
      </text>

      <!-- ═══ 連線 ═══ -->
      <!-- 箭頭 1 -->
      <line
        x1="100"
        y1="184"
        x2="100"
        y2="296"
        class="bridge-line"
        marker-end="url(#uni-arrow)"
      />
      <line
        x1="100"
        y1="184"
        x2="100"
        y2="296"
        class="bridge-flow"
      />

      <!-- 箭頭 2 -->
      <line
        x1="180"
        y1="184"
        x2="180"
        y2="296"
        class="bridge-line"
        marker-end="url(#uni-arrow)"
      />
      <line
        x1="180"
        y1="184"
        x2="180"
        y2="296"
        class="bridge-flow bridge-flow-delay"
      />

      <!-- 中間 badge -->
      <rect
        x="106"
        y="227"
        width="68"
        height="26"
        rx="13"
        class="badge-bg"
      />
      <text
        x="140"
        y="245"
        text-anchor="middle"
        class="badge-text"
      >
        uniform
      </text>

      <!-- ═══ GLSL 世界 ═══ -->
      <rect
        x="14"
        y="300"
        width="252"
        height="170"
        rx="14"
        class="world world-glsl"
      />
      <rect
        x="14"
        y="300"
        width="252"
        height="36"
        rx="14"
        class="world-header world-header-glsl"
      />
      <rect
        x="14"
        y="322"
        width="252"
        height="14"
        class="world-header world-header-glsl"
      />
      <text
        x="140"
        y="324"
        text-anchor="middle"
        class="world-title world-title-glsl"
      >
        GLSL
      </text>

      <!-- GLSL code 1 -->
      <rect
        x="28"
        y="348"
        width="224"
        height="40"
        rx="8"
        class="code-block code-block-glsl"
      />
      <text
        x="140"
        y="373"
        text-anchor="middle"
        class="code-text code-text-glsl"
      >
        uniform float u_time;
      </text>

      <!-- GLSL code 2 -->
      <rect
        x="28"
        y="400"
        width="224"
        height="40"
        rx="8"
        class="code-block code-block-glsl"
      />
      <text
        x="140"
        y="425"
        text-anchor="middle"
        class="code-text code-text-glsl"
      >
        uniform vec2 u_mouse;
      </text>
    </svg>
  </div>
</template>

<style scoped>
.diagram-uniform {
  max-width: 280px;
  margin: 1.5rem auto;
}

.uniform-svg {
  width: 100%;
}

/* ── Worlds ── */
.world {
  stroke-width: 1.5;
}

.world-js {
  fill: #fffbeb;
  stroke: #fbbf24;
}

.world-glsl {
  fill: #ecfeff;
  stroke: #22d3ee;
}

.world-header-js {
  fill: #fef3c7;
  stroke: none;
}

.world-header-glsl {
  fill: #cffafe;
  stroke: none;
}

.world-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.world-title-js { fill: #92400e; }
.world-title-glsl { fill: #155e75; }

/* ── Code blocks ── */
.code-block-js {
  fill: #fefce8;
  stroke: #fde68a;
  stroke-width: 1;
}

.code-block-glsl {
  fill: #f0fdfa;
  stroke: #a5f3fc;
  stroke-width: 1;
}

.code-text {
  font-size: 12px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-weight: 500;
}

.code-text-js { fill: #78350f; }
.code-text-glsl { fill: #164e63; }

/* ── Bridge ── */
.arrow-marker { fill: #8b5cf6; }

.bridge-line {
  stroke: #c4b5fd;
  stroke-width: 1.5;
}

.bridge-flow {
  stroke: #8b5cf6;
  stroke-width: 2.5;
  stroke-dasharray: 6 10;
  stroke-linecap: round;
  opacity: 0.5;
  animation: flow 1.4s linear infinite;
}

.bridge-flow-delay {
  animation-delay: -0.7s;
}

/* ── Badge ── */
.badge-bg {
  fill: #ede9fe;
  stroke: #c4b5fd;
  stroke-width: 1;
}

.badge-text {
  font-size: 12px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-weight: 600;
  fill: #6d28d9;
}

@keyframes flow {
  to { stroke-dashoffset: -16; }
}

/* ── Dark ── */
:global(html.dark) .world-js {
  fill: rgba(120, 53, 15, 0.1);
  stroke: #b45309;
}

:global(html.dark) .world-glsl {
  fill: rgba(6, 182, 212, 0.06);
  stroke: #0891b2;
}

:global(html.dark) .world-header-js {
  fill: rgba(180, 83, 9, 0.15);
}

:global(html.dark) .world-header-glsl {
  fill: rgba(8, 145, 178, 0.12);
}

:global(html.dark) .world-title-js { fill: #fbbf24; }
:global(html.dark) .world-title-glsl { fill: #67e8f9; }

:global(html.dark) .code-block-js {
  fill: rgba(120, 53, 15, 0.12);
  stroke: rgba(251, 191, 36, 0.2);
}

:global(html.dark) .code-block-glsl {
  fill: rgba(6, 182, 212, 0.08);
  stroke: rgba(34, 211, 238, 0.15);
}

:global(html.dark) .code-text-js { fill: #fde68a; }
:global(html.dark) .code-text-glsl { fill: #a5f3fc; }

:global(html.dark) .arrow-marker { fill: #8b5cf6; }
:global(html.dark) .bridge-line { stroke: #4c1d95; }
:global(html.dark) .bridge-flow { stroke: #8b5cf6; opacity: 0.4; }

:global(html.dark) .badge-bg {
  fill: rgba(109, 40, 217, 0.15);
  stroke: #6d28d9;
}

:global(html.dark) .badge-text { fill: #c4b5fd; }
</style>
