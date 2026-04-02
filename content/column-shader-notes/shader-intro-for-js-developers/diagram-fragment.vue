<template>
  <div class="diagram-fragment not-prose">
    <svg
      viewBox="0 0 620 110"
      class="fragment-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="fr-arrow"
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

        <filter id="fr-glow">
          <feDropShadow
            dx="0"
            dy="1"
            stdDeviation="3"
            flood-color="currentColor"
            flood-opacity="0.1"
          />
        </filter>
      </defs>

      <!-- ── 1. gl_FragCoord ── -->
      <g filter="url(#fr-glow)">
        <rect
          x="10"
          y="16"
          width="165"
          height="72"
          rx="12"
          class="card card-coord"
        />
        <rect
          x="19"
          y="24"
          width="6"
          height="56"
          rx="3"
          class="accent accent-coord"
        />

        <text
          x="92"
          y="48"
          text-anchor="middle"
          class="title title-coord"
        >
          gl_FragCoord
        </text>
        <text
          x="92"
          y="68"
          text-anchor="middle"
          class="subtitle subtitle-coord"
        >
          我在哪裡？
        </text>
      </g>

      <!-- Arrow 1 -->
      <line
        x1="180"
        y1="52"
        x2="218"
        y2="52"
        class="arrow-line"
        marker-end="url(#fr-arrow)"
      />
      <line
        x1="180"
        y1="52"
        x2="218"
        y2="52"
        class="arrow-flow"
      />

      <!-- ── 2. 你的計算邏輯 ── -->
      <rect
        x="224"
        y="16"
        width="165"
        height="72"
        rx="12"
        class="card card-logic"
        stroke-dasharray="6,4"
      />

      <text
        x="306"
        y="56"
        text-anchor="middle"
        class="title title-logic"
      >
        你的計算邏輯
      </text>

      <!-- Arrow 2 -->
      <line
        x1="394"
        y1="52"
        x2="432"
        y2="52"
        class="arrow-line"
        marker-end="url(#fr-arrow)"
      />
      <line
        x1="394"
        y1="52"
        x2="432"
        y2="52"
        class="arrow-flow"
      />

      <!-- ── 3. gl_FragColor ── -->
      <g filter="url(#fr-glow)">
        <rect
          x="438"
          y="16"
          width="170"
          height="72"
          rx="12"
          class="card card-color"
        />
        <rect
          x="447"
          y="24"
          width="6"
          height="56"
          rx="3"
          class="accent accent-color"
        />

        <text
          x="524"
          y="48"
          text-anchor="middle"
          class="title title-color"
        >
          gl_FragColor
        </text>
        <text
          x="524"
          y="68"
          text-anchor="middle"
          class="subtitle subtitle-color"
        >
          我要什麼顏色
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.diagram-fragment {
  margin: 1.5rem auto;
}

.fragment-svg {
  width: 100%;
}

/* ── Cards ── */
.card {
  stroke-width: 1.5;
}

.card-coord {
  fill: #f0fdfa;
  stroke: #2dd4bf;
  stroke-width: 2;
}

.card-logic {
  fill: #f9fafb;
  stroke: #d1d5db;
}

.card-color {
  fill: #fff1f2;
  stroke: #fb7185;
  stroke-width: 2;
}

/* ── Accent ── */
.accent-coord {
  fill: #2dd4bf;
  opacity: 0.5;
}

.accent-color {
  fill: #fb7185;
  opacity: 0.5;
}

/* ── Icons ── */
.icon-grid rect {
  fill: #99f6e4;
  opacity: 0.7;
}

.icon-gear {
  font-size: 16px;
  fill: #9ca3af;
}

.swatch-r { fill: #f87171; opacity: 0.7; }
.swatch-g { fill: #4ade80; opacity: 0.7; }
.swatch-b { fill: #60a5fa; opacity: 0.7; }

/* ── Text ── */
.title {
  font-size: 13px;
  font-weight: 700;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
}

.subtitle {
  font-size: 11px;
}

.title-coord { fill: #115e59; }
.subtitle-coord { fill: #0d9488; opacity: 0.6; }
.title-logic { fill: #6b7280; }
.title-color { fill: #9f1239; }
.subtitle-color { fill: #e11d48; opacity: 0.6; }

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
:global(html.dark) .card-coord {
  fill: rgba(13, 148, 136, 0.1);
  stroke: #0d9488;
}

:global(html.dark) .card-logic {
  fill: rgba(75, 85, 99, 0.12);
  stroke: #4b5563;
}

:global(html.dark) .card-color {
  fill: rgba(225, 29, 72, 0.08);
  stroke: #e11d48;
}

:global(html.dark) .accent-coord { fill: #0d9488; }
:global(html.dark) .accent-color { fill: #e11d48; }

:global(html.dark) .icon-grid rect {
  fill: #5eead4;
  opacity: 0.3;
}

:global(html.dark) .icon-gear { fill: #6b7280; }

:global(html.dark) .title-coord { fill: #5eead4; }
:global(html.dark) .subtitle-coord { fill: #5eead4; opacity: 0.5; }
:global(html.dark) .title-logic { fill: #9ca3af; }
:global(html.dark) .title-color { fill: #fda4af; }
:global(html.dark) .subtitle-color { fill: #fda4af; opacity: 0.5; }

:global(html.dark) .arrow-fill { fill: #4b5563; }
:global(html.dark) .arrow-line { stroke: #4b5563; }
:global(html.dark) .arrow-flow {
  stroke: #8b5cf6;
  opacity: 0.3;
}
</style>
