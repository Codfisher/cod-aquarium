<template>
  <div class="diagram-ar not-prose">
    <svg
      viewBox="0 0 380 560"
      class="ar-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- ═══════ 上半：問題 ═══════ -->
      <!-- 標題 -->
      <rect
        x="94"
        y="4"
        width="152"
        height="26"
        rx="13"
        class="section-badge section-badge-problem"
      />
      <text
        x="170"
        y="22"
        text-anchor="middle"
        class="section-title section-title-problem"
      >
        問題：UV 座標的陷阱
      </text>

      <!-- 畫布框 -->
      <rect
        x="20"
        y="44"
        width="300"
        height="150"
        rx="10"
        class="canvas canvas-problem"
      />

      <!-- 背景格子 -->
      <g
        class="grid-dots"
        opacity="0.3"
      >
        <circle
          v-for="gy in 5"
          :key="`gp-row-${gy}`"
          v-bind="void 0"
        />
        <template
          v-for="gy in 5"
          :key="`gpr-${gy}`"
        >
          <circle
            v-for="gx in 10"
            :key="`gp-${gy}-${gx}`"
            :cx="35 + (gx - 1) * 30"
            :cy="56 + (gy - 1) * 30"
            r="1"
            class="grid-dot"
          />
        </template>
      </g>

      <!-- 橢圓 -->
      <ellipse
        cx="170"
        cy="119"
        rx="90"
        ry="45"
        class="shape shape-ellipse"
      />
      <text
        x="170"
        y="124"
        text-anchor="middle"
        class="shape-mark shape-mark-bad"
      >
        ✕
      </text>

      <!-- x 尺寸 -->
      <line
        x1="20"
        y1="206"
        x2="320"
        y2="206"
        class="dim-line"
      />
      <line
        x1="20"
        y1="200"
        x2="20"
        y2="212"
        class="dim-line"
      />
      <line
        x1="320"
        y1="200"
        x2="320"
        y2="212"
        class="dim-line"
      />
      <text
        x="170"
        y="224"
        text-anchor="middle"
        class="dim-text"
      >
        x: 0→1 對應 600px
      </text>

      <!-- y 尺寸 -->
      <line
        x1="328"
        y1="44"
        x2="328"
        y2="194"
        class="dim-line"
      />
      <line
        x1="322"
        y1="44"
        x2="334"
        y2="44"
        class="dim-line"
      />
      <line
        x1="322"
        y1="194"
        x2="334"
        y2="194"
        class="dim-line"
      />
      <text
        x="334"
        y="115"
        class="dim-text dim-text-rotated"
        transform="rotate(90, 334, 115)"
        text-anchor="middle"
      >
        y: 0→1 對應 300px
      </text>

      <!-- 說明 -->
      <text
        x="170"
        y="262"
        text-anchor="middle"
        class="explain explain-problem"
      >
        同樣是 0.3 的距離
      </text>
      <text
        x="170"
        y="280"
        text-anchor="middle"
        class="explain explain-problem"
      >
        x 方向 = 180px，y 方向 = 90px
      </text>
      <text
        x="170"
        y="298"
        text-anchor="middle"
        class="explain explain-problem-bold"
      >
        導致圓變成橢圓！
      </text>

      <!-- ═══════ 下半：解法 ═══════ -->
      <rect
        x="100"
        y="326"
        width="140"
        height="26"
        rx="13"
        class="section-badge section-badge-solution"
      />
      <text
        x="170"
        y="344"
        text-anchor="middle"
        class="section-title section-title-solution"
      >
        解法：x 乘上長寬比
      </text>

      <!-- 畫布框 -->
      <rect
        x="20"
        y="366"
        width="300"
        height="150"
        rx="10"
        class="canvas canvas-solution"
      />

      <!-- 背景格子 -->
      <g
        class="grid-dots"
        opacity="0.3"
      >
        <template
          v-for="gy in 5"
          :key="`gsr-${gy}`"
        >
          <circle
            v-for="gx in 10"
            :key="`gs-${gy}-${gx}`"
            :cx="35 + (gx - 1) * 30"
            :cy="378 + (gy - 1) * 30"
            r="1"
            class="grid-dot"
          />
        </template>
      </g>

      <!-- 正圓 -->
      <circle
        cx="170"
        cy="441"
        r="45"
        class="shape shape-circle"
      />
      <text
        x="170"
        y="446"
        text-anchor="middle"
        class="shape-mark shape-mark-good"
      >
        ✓
      </text>

      <!-- 程式碼 -->
      <rect
        x="20"
        y="528"
        width="300"
        height="26"
        rx="6"
        class="code-bar"
      />
      <text
        x="170"
        y="546"
        text-anchor="middle"
        class="code-text"
      >
        center.x *= u_resolution.x / u_resolution.y
      </text>
    </svg>
  </div>
</template>

<style scoped>
.diagram-ar {
  max-width: 380px;
  margin: 1.5rem auto;
}

.ar-svg {
  width: 100%;
}

/* ── Section badges ── */
.section-badge-problem {
  fill: #fef2f2;
  stroke: #fca5a5;
  stroke-width: 1;
}

.section-badge-solution {
  fill: #f0fdfa;
  stroke: #99f6e4;
  stroke-width: 1;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
}

.section-title-problem { fill: #991b1b; }
.section-title-solution { fill: #115e59; }

/* ── Canvas ── */
.canvas {
  stroke-width: 1.5;
}

.canvas-problem {
  fill: #fafafa;
  stroke: #e5e7eb;
}

.canvas-solution {
  fill: #fafafa;
  stroke: #e5e7eb;
}

.grid-dot {
  fill: #9ca3af;
}

/* ── Shapes ── */
.shape-ellipse {
  fill: rgba(244, 63, 94, 0.12);
  stroke: #f43f5e;
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}

.shape-circle {
  fill: rgba(45, 212, 191, 0.15);
  stroke: #14b8a6;
  stroke-width: 2;
}

.shape-mark {
  font-size: 18px;
  font-weight: 800;
}

.shape-mark-bad { fill: #f43f5e; }
.shape-mark-good { fill: #0d9488; }

/* ── Dimensions ── */
.dim-line {
  stroke: #d1d5db;
  stroke-width: 1;
}

.dim-text {
  font-size: 11.5px;
  fill: #9ca3af;
}

/* ── Explain ── */
.explain {
  font-size: 12px;
}

.explain-problem { fill: #f43f5e; opacity: 0.8; }
.explain-problem-bold {
  fill: #e11d48;
  font-weight: 700;
}

/* ── Code bar ── */
.code-bar {
  fill: #f3f4f6;
  stroke: #e5e7eb;
  stroke-width: 1;
}

.code-text {
  font-size: 11px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  font-weight: 500;
  fill: #0d9488;
}

/* ── Dark ── */
:global(html.dark) .section-badge-problem {
  fill: rgba(220, 38, 38, 0.1);
  stroke: rgba(248, 113, 113, 0.3);
}

:global(html.dark) .section-badge-solution {
  fill: rgba(13, 148, 136, 0.1);
  stroke: rgba(94, 234, 212, 0.2);
}

:global(html.dark) .section-title-problem { fill: #fca5a5; }
:global(html.dark) .section-title-solution { fill: #5eead4; }

:global(html.dark) .canvas-problem,
:global(html.dark) .canvas-solution {
  fill: rgba(17, 24, 39, 0.5);
  stroke: #374151;
}

:global(html.dark) .grid-dot { fill: #4b5563; }

:global(html.dark) .shape-ellipse {
  fill: rgba(244, 63, 94, 0.08);
  stroke: #f43f5e;
}

:global(html.dark) .shape-circle {
  fill: rgba(45, 212, 191, 0.1);
  stroke: #2dd4bf;
}

:global(html.dark) .shape-mark-bad { fill: #fb7185; }
:global(html.dark) .shape-mark-good { fill: #5eead4; }

:global(html.dark) .dim-line { stroke: #4b5563; }
:global(html.dark) .dim-text { fill: #9ca3af; }

:global(html.dark) .explain-problem { fill: #fb7185; }
:global(html.dark) .explain-problem-bold { fill: #fb7185; }

:global(html.dark) .code-bar {
  fill: rgba(75, 85, 99, 0.2);
  stroke: #374151;
}

:global(html.dark) .code-text { fill: #5eead4; }
</style>
