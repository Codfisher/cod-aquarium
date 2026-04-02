<template>
  <div class="diagram-circle not-prose">
    <svg
      viewBox="0 0 280 490"
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
        dist = length(center)
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

      <!-- ── 3. step 產生 0 / 1 ── -->
      <rect
        x="24"
        y="190"
        width="232"
        height="58"
        rx="12"
        class="card card-step-fn"
      />
      <text
        x="140"
        y="214"
        text-anchor="middle"
        class="title title-step"
      >
        step 判斷邊界
      </text>
      <text
        x="140"
        y="234"
        text-anchor="middle"
        class="code-label"
      >
        circle = step(dist, 0.3)
      </text>

      <!-- 左右標注 -->
      <text
        x="140"
        y="268"
        text-anchor="middle"
        class="note"
      >
        圓內 → 1.0　　圓外 → 0.0
      </text>

      <!-- Arrow -->
      <line
        x1="140"
        y1="278"
        x2="140"
        y2="300"
        class="arrow-line"
        marker-end="url(#ci-arrow)"
      />
      <line
        x1="140"
        y1="278"
        x2="140"
        y2="300"
        class="arrow-flow"
      />

      <!-- ── 4. mix 混色 ── -->
      <rect
        x="24"
        y="306"
        width="232"
        height="58"
        rx="12"
        class="card card-mix"
      />
      <text
        x="140"
        y="330"
        text-anchor="middle"
        class="title title-mix"
      >
        mix 混合顏色
      </text>
      <text
        x="140"
        y="350"
        text-anchor="middle"
        class="code-label"
      >
        mix(背景色, 圓色, circle)
      </text>

      <!-- Arrow -->
      <line
        x1="140"
        y1="368"
        x2="140"
        y2="390"
        class="arrow-line"
        marker-end="url(#ci-arrow)"
      />
      <line
        x1="140"
        y1="368"
        x2="140"
        y2="390"
        class="arrow-flow"
      />

      <!-- ── 5. 輸出 ── -->
      <rect
        x="24"
        y="396"
        width="232"
        height="58"
        rx="12"
        class="card card-output"
      />
      <text
        x="140"
        y="420"
        text-anchor="middle"
        class="title title-output"
      >
        輸出顏色
      </text>
      <text
        x="140"
        y="440"
        text-anchor="middle"
        class="code-label"
      >
        gl_FragColor = vec4(color, 1.0)
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
.card {
  stroke-width: 1.5;
}

.card-step {
  fill: #f9fafb;
  stroke: #d1d5db;
}

.card-step-fn {
  fill: #faf5ff;
  stroke: #a78bfa;
}

.card-mix {
  fill: #fff1f2;
  stroke: #fb7185;
}

.card-output {
  fill: #f5f3ff;
  stroke: #a78bfa;
}

/* ── Text ── */
.title {
  font-size: 13px;
  font-weight: 600;
  fill: #374151;
}

.title-step { fill: #6d28d9; }
.title-mix { fill: #9f1239; }
.title-output { fill: #5b21b6; }

.code-label {
  font-size: 11px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  fill: #9ca3af;
}

.note {
  font-size: 11px;
  fill: #9ca3af;
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
:global(html.dark) .card-step {
  fill: rgba(75, 85, 99, 0.12);
  stroke: #4b5563;
}

:global(html.dark) .card-step-fn {
  fill: rgba(139, 92, 246, 0.08);
  stroke: #7c3aed;
}

:global(html.dark) .card-mix {
  fill: rgba(225, 29, 72, 0.08);
  stroke: #e11d48;
}

:global(html.dark) .card-output {
  fill: rgba(139, 92, 246, 0.08);
  stroke: #7c3aed;
}

:global(html.dark) .title { fill: #d1d5db; }
:global(html.dark) .title-step { fill: #c4b5fd; }
:global(html.dark) .title-mix { fill: #fda4af; }
:global(html.dark) .title-output { fill: #c4b5fd; }
:global(html.dark) .code-label { fill: #6b7280; }
:global(html.dark) .note { fill: #6b7280; }

:global(html.dark) .arrow-fill { fill: #4b5563; }
:global(html.dark) .arrow-line { stroke: #4b5563; }
:global(html.dark) .arrow-flow { stroke: #8b5cf6; opacity: 0.3; }
</style>
