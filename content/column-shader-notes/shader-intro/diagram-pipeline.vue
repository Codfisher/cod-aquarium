<template>
  <div class="diagram-pipeline not-prose">
    <svg
      viewBox="0 0 280 520"
      class="pipeline-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <!-- 箭頭 -->
        <marker
          id="pl-arrow"
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

        <!-- 可控步驟光暈 -->
        <filter id="pl-glow">
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="4"
            flood-color="currentColor"
            flood-opacity="0.12"
          />
        </filter>
      </defs>

      <!-- ───── 1. JS 準備資料 ───── -->
      <g class="step step-js">
        <rect
          x="24"
          y="12"
          width="232"
          height="68"
          rx="12"
          class="card card-js"
        />
        <text
          x="140"
          y="42"
          text-anchor="middle"
          class="title title-js"
        >
          JS 準備資料
        </text>
        <text
          x="140"
          y="62"
          text-anchor="middle"
          class="subtitle subtitle-js"
        >
          頂點座標、顏色、Uniform
        </text>
      </g>

      <!-- Arrow 1 -->
      <line
        x1="140"
        y1="84"
        x2="140"
        y2="108"
        class="arrow-line"
        marker-end="url(#pl-arrow)"
      />

      <!-- ───── 2. Vertex Shader ───── -->
      <g
        class="step step-shader"
        filter="url(#pl-glow)"
      >
        <rect
          x="24"
          y="114"
          width="232"
          height="68"
          rx="12"
          class="card card-vertex"
        />
        <!-- 可控標記 -->
        <rect
          x="33"
          y="122"
          width="8"
          height="52"
          rx="4"
          class="accent accent-vertex"
        />
        <text
          x="148"
          y="144"
          text-anchor="middle"
          class="title title-vertex"
        >
          Vertex Shader
        </text>
        <text
          x="148"
          y="164"
          text-anchor="middle"
          class="subtitle subtitle-vertex"
        >
          決定形狀位置
        </text>
      </g>

      <!-- Arrow 2 -->
      <line
        x1="140"
        y1="186"
        x2="140"
        y2="210"
        class="arrow-line"
        marker-end="url(#pl-arrow)"
      />

      <!-- ───── 3. 光柵化 ───── -->
      <g class="step step-auto">
        <rect
          x="24"
          y="216"
          width="232"
          height="68"
          rx="12"
          class="card card-raster"
          stroke-dasharray="6,4"
        />
        <text
          x="140"
          y="246"
          text-anchor="middle"
          class="title title-raster"
        >
          光柵化
        </text>
        <text
          x="140"
          y="266"
          text-anchor="middle"
          class="subtitle subtitle-raster"
        >
          GPU 自動處理
        </text>
      </g>

      <!-- Arrow 3 -->
      <line
        x1="140"
        y1="288"
        x2="140"
        y2="312"
        class="arrow-line"
        marker-end="url(#pl-arrow)"
      />

      <!-- ───── 4. Fragment Shader ───── -->
      <g
        class="step step-shader"
        filter="url(#pl-glow)"
      >
        <rect
          x="24"
          y="318"
          width="232"
          height="68"
          rx="12"
          class="card card-fragment"
        />
        <!-- 可控標記 -->
        <rect
          x="33"
          y="326"
          width="8"
          height="52"
          rx="4"
          class="accent accent-fragment"
        />
        <text
          x="148"
          y="348"
          text-anchor="middle"
          class="title title-fragment"
        >
          Fragment Shader
        </text>
        <text
          x="148"
          y="368"
          text-anchor="middle"
          class="subtitle subtitle-fragment"
        >
          決定每個像素顏色
        </text>
      </g>

      <!-- Arrow 4 -->
      <line
        x1="140"
        y1="390"
        x2="140"
        y2="414"
        class="arrow-line"
        marker-end="url(#pl-arrow)"
      />

      <!-- ───── 5. 螢幕輸出 ───── -->
      <g class="step step-output">
        <rect
          x="24"
          y="420"
          width="232"
          height="68"
          rx="12"
          class="card card-output"
        />
        <text
          x="140"
          y="460"
          text-anchor="middle"
          class="title title-output"
        >
          螢幕上的畫面
        </text>
      </g>

      <!-- 流動粒子動畫線 -->
      <line
        x1="140"
        y1="84"
        x2="140"
        y2="108"
        class="arrow-flow"
      />
      <line
        x1="140"
        y1="186"
        x2="140"
        y2="210"
        class="arrow-flow"
      />
      <line
        x1="140"
        y1="288"
        x2="140"
        y2="312"
        class="arrow-flow"
      />
      <line
        x1="140"
        y1="390"
        x2="140"
        y2="414"
        class="arrow-flow"
      />
    </svg>
  </div>
</template>

<style scoped>
.diagram-pipeline {
  max-width: 280px;
  margin: 1.5rem auto;
}

.pipeline-svg {
  width: 100%;
}

/* ── Cards ── */
.card {
  stroke-width: 1.5;
  transition: transform 0.3s;
}

.card-js {
  fill: #fffbeb;
  stroke: #fbbf24;
}

.card-vertex {
  fill: #f0fdfa;
  stroke: #2dd4bf;
  stroke-width: 2;
}

.card-raster {
  fill: #f9fafb;
  stroke: #d1d5db;
}

.card-fragment {
  fill: #fff1f2;
  stroke: #fb7185;
  stroke-width: 2;
}

.card-output {
  fill: #f5f3ff;
  stroke: #a78bfa;
}

/* ── Accent bars ── */
.accent-vertex {
  fill: #2dd4bf;
  opacity: 0.6;
}

.accent-fragment {
  fill: #fb7185;
  opacity: 0.6;
}

/* ── Titles ── */
.title {
  font-size: 14px;
  font-weight: 600;
}

.title-js { fill: #92400e; }
.title-vertex { fill: #115e59; }
.title-raster { fill: #6b7280; }
.title-fragment { fill: #9f1239; }
.title-output { fill: #5b21b6; }

.subtitle {
  font-size: 12px;
}

.subtitle-js { fill: #b45309; opacity: 0.6; }
.subtitle-vertex { fill: #0d9488; opacity: 0.6; }
.subtitle-raster { fill: #9ca3af; }
.subtitle-fragment { fill: #e11d48; opacity: 0.6; }

/* ── Badge ── */
.badge-editable {
  font-size: 14px;
  fill: #9ca3af;
}

/* ── Arrows ── */
.arrow-fill {
  fill: #d1d5db;
}

.arrow-line {
  stroke: #d1d5db;
  stroke-width: 1.5;
}

.arrow-flow {
  stroke: #a78bfa;
  stroke-width: 2;
  stroke-dasharray: 4 8;
  stroke-linecap: round;
  opacity: 0.5;
  animation: flow 1.2s linear infinite;
}

@keyframes flow {
  to { stroke-dashoffset: -12; }
}

/* ── Dark mode ── */
:global(html.dark) .card-js {
  fill: rgba(120, 53, 15, 0.15);
  stroke: #b45309;
}

:global(html.dark) .card-vertex {
  fill: rgba(13, 148, 136, 0.1);
  stroke: #0d9488;
}

:global(html.dark) .card-raster {
  fill: rgba(75, 85, 99, 0.12);
  stroke: #4b5563;
}

:global(html.dark) .card-fragment {
  fill: rgba(225, 29, 72, 0.08);
  stroke: #e11d48;
}

:global(html.dark) .card-output {
  fill: rgba(139, 92, 246, 0.08);
  stroke: #7c3aed;
}

:global(html.dark) .accent-vertex {
  fill: #0d9488;
  opacity: 0.5;
}

:global(html.dark) .accent-fragment {
  fill: #e11d48;
  opacity: 0.5;
}

:global(html.dark) .title-js { fill: #fbbf24; }
:global(html.dark) .title-vertex { fill: #5eead4; }
:global(html.dark) .title-raster { fill: #9ca3af; }
:global(html.dark) .title-fragment { fill: #fda4af; }
:global(html.dark) .title-output { fill: #c4b5fd; }

:global(html.dark) .subtitle-js { fill: #fbbf24; opacity: 0.7; }
:global(html.dark) .subtitle-vertex { fill: #5eead4; opacity: 0.7; }
:global(html.dark) .subtitle-raster { fill: #9ca3af; }
:global(html.dark) .subtitle-fragment { fill: #fda4af; opacity: 0.7; }

:global(html.dark) .badge-editable { fill: #6b7280; }

:global(html.dark) .arrow-fill { fill: #4b5563; }
:global(html.dark) .arrow-line { stroke: #4b5563; }
:global(html.dark) .arrow-flow {
  stroke: #8b5cf6;
  opacity: 0.35;
}
</style>
