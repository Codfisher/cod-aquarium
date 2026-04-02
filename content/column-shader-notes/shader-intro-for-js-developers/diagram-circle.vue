<template>
  <div class="diagram-circle not-prose">
    <svg
      viewBox="0 0 280 430"
      class="circle-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="ci-arrow"
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

        <filter id="ci-glow-teal">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="4"
            flood-color="#2dd4bf"
            flood-opacity="0.35"
          />
        </filter>
      </defs>

      <!-- ── 1. 修正長寬比 ── -->
      <rect
        x="24"
        y="10"
        width="232"
        height="58"
        rx="12"
        class="card card-step"
      />
      <text
        x="140"
        y="34"
        text-anchor="middle"
        class="title"
      >
        修正長寬比
      </text>
      <text
        x="140"
        y="54"
        text-anchor="middle"
        class="code-label"
      >
        center.x *= aspect
      </text>

      <!-- Arrow -->
      <line
        x1="140"
        y1="72"
        x2="140"
        y2="94"
        class="arrow-line"
        marker-end="url(#ci-arrow)"
      />
      <line
        x1="140"
        y1="72"
        x2="140"
        y2="94"
        class="arrow-flow"
      />

      <!-- ── 2. 計算距離 ── -->
      <rect
        x="24"
        y="100"
        width="232"
        height="58"
        rx="12"
        class="card card-step"
      />
      <text
        x="140"
        y="124"
        text-anchor="middle"
        class="title"
      >
        計算到中心的距離
      </text>
      <text
        x="140"
        y="144"
        text-anchor="middle"
        class="code-label"
      >
        distance = length(center)
      </text>

      <!-- Arrow -->
      <line
        x1="140"
        y1="162"
        x2="140"
        y2="184"
        class="arrow-line"
        marker-end="url(#ci-arrow)"
      />
      <line
        x1="140"
        y1="162"
        x2="140"
        y2="184"
        class="arrow-flow"
      />

      <!-- ── 3. 菱形判斷 ── -->
      <polygon
        points="140,188 244,232 140,276 36,232"
        class="card card-diamond"
      />
      <text
        x="140"
        y="236"
        text-anchor="middle"
        class="title title-diamond"
      >
        distance &lt; 半徑
      </text>

      <!-- Arrow left: 是 -->
      <line
        x1="84"
        y1="266"
        x2="58"
        y2="312"
        class="arrow-line"
        marker-end="url(#ci-arrow)"
      />
      <rect
        x="40"
        y="275"
        width="28"
        height="20"
        rx="10"
        class="yn-badge yn-yes"
      />
      <text
        x="54"
        y="289"
        text-anchor="middle"
        class="yn-text yn-yes-text"
      >
        是
      </text>

      <!-- Arrow right: 否 -->
      <line
        x1="196"
        y1="266"
        x2="222"
        y2="312"
        class="arrow-line"
        marker-end="url(#ci-arrow)"
      />
      <rect
        x="212"
        y="275"
        width="28"
        height="20"
        rx="10"
        class="yn-badge yn-no"
      />
      <text
        x="226"
        y="289"
        text-anchor="middle"
        class="yn-text yn-no-text"
      >
        否
      </text>

      <!-- ── 左結果：圓的顏色 ── -->
      <g filter="url(#ci-glow-teal)">
        <circle
          cx="52"
          cy="342"
          r="24"
          class="result result-circle"
        />
      </g>
      <text
        x="52"
        y="386"
        text-anchor="middle"
        class="result-label result-label-circle"
      >
        圓的顏色
      </text>

      <!-- ── 右結果：背景色 ── -->
      <rect
        x="196"
        y="318"
        width="48"
        height="48"
        rx="8"
        class="result result-bg"
      />
      <text
        x="220"
        y="386"
        text-anchor="middle"
        class="result-label result-label-bg"
      >
        背景色
      </text>
    </svg>
  </div>
</template>

<style scoped>
.diagram-circle {
  max-width: 280px;
  margin: 1.5rem auto;
}

.circle-svg {
  width: 100%;
}

/* ── Cards ── */
.card-step {
  fill: #f9fafb;
  stroke: #d1d5db;
  stroke-width: 1.5;
}

.card-diamond {
  fill: #faf5ff;
  stroke: #a78bfa;
  stroke-width: 1.5;
}

/* ── Text ── */
.title {
  font-size: 13px;
  font-weight: 600;
  fill: #374151;
}

.title-diamond {
  fill: #6d28d9;
  font-weight: 700;
}

.code-label {
  font-size: 11px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  fill: #9ca3af;
}

/* ── Yes/No badges ── */
.yn-badge { stroke: none; }
.yn-yes { fill: #d1fae5; }
.yn-no { fill: #fee2e2; }

.yn-text {
  font-size: 11px;
  font-weight: 600;
}

.yn-yes-text { fill: #059669; }
.yn-no-text { fill: #dc2626; }

/* ── Results ── */
.result-circle {
  fill: #2dd4bf;
  opacity: 0.75;
}

.result-bg {
  fill: #1f2937;
  opacity: 0.8;
}

.result-label {
  font-size: 12px;
}

.result-label-circle { fill: #0d9488; }
.result-label-bg { fill: #6b7280; }

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
:global(html.dark) .card-step {
  fill: rgba(75, 85, 99, 0.12);
  stroke: #4b5563;
}

:global(html.dark) .card-diamond {
  fill: rgba(139, 92, 246, 0.08);
  stroke: #7c3aed;
}

:global(html.dark) .title { fill: #d1d5db; }
:global(html.dark) .title-diamond { fill: #c4b5fd; }
:global(html.dark) .code-label { fill: #6b7280; }

:global(html.dark) .yn-yes { fill: rgba(5, 150, 105, 0.15); }
:global(html.dark) .yn-no { fill: rgba(220, 38, 38, 0.12); }
:global(html.dark) .yn-yes-text { fill: #34d399; }
:global(html.dark) .yn-no-text { fill: #f87171; }

:global(html.dark) .result-circle { fill: #0d9488; opacity: 0.7; }
:global(html.dark) .result-bg { fill: #d1d5db; opacity: 0.6; }

:global(html.dark) .result-label-circle { fill: #5eead4; }
:global(html.dark) .result-label-bg { fill: #9ca3af; }

:global(html.dark) .arrow-fill { fill: #4b5563; }
:global(html.dark) .arrow-line { stroke: #4b5563; }
:global(html.dark) .arrow-flow { stroke: #8b5cf6; opacity: 0.3; }
</style>
