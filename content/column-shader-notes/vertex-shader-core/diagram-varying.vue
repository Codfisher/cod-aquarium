<template>
  <div class="diagram-varying not-prose">
    <div class="flow">
      <!-- Vertex Shader -->
      <div class="flow-step">
        <div class="step-label">
          Vertex Shader
        </div>
        <div class="step-content">
          <svg
            viewBox="0 0 220 80"
            xmlns="http://www.w3.org/2000/svg"
          >
            <!-- 頂點 A -->
            <circle
              cx="40"
              cy="40"
              r="14"
              fill="#ff7b72"
              fill-opacity="0.2"
              stroke="#ff7b72"
              stroke-width="1.5"
            />
            <text
              x="40"
              y="44"
              text-anchor="middle"
              font-size="10"
              fill="#ff7b72"
              font-weight="600"
            >
              A
            </text>
            <text
              x="40"
              y="70"
              text-anchor="middle"
              font-size="8"
              fill="#ff7b72"
              opacity="0.7"
              font-family="ui-monospace, monospace"
            >
              紅
            </text>

            <!-- 頂點 B -->
            <circle
              cx="110"
              cy="40"
              r="14"
              fill="#7ee787"
              fill-opacity="0.2"
              stroke="#7ee787"
              stroke-width="1.5"
            />
            <text
              x="110"
              y="44"
              text-anchor="middle"
              font-size="10"
              fill="#7ee787"
              font-weight="600"
            >
              B
            </text>
            <text
              x="110"
              y="70"
              text-anchor="middle"
              font-size="8"
              fill="#7ee787"
              opacity="0.7"
              font-family="ui-monospace, monospace"
            >
              綠
            </text>

            <!-- 頂點 C -->
            <circle
              cx="180"
              cy="40"
              r="14"
              fill="#58a6ff"
              fill-opacity="0.2"
              stroke="#58a6ff"
              stroke-width="1.5"
            />
            <text
              x="180"
              y="44"
              text-anchor="middle"
              font-size="10"
              fill="#58a6ff"
              font-weight="600"
            >
              C
            </text>
            <text
              x="180"
              y="70"
              text-anchor="middle"
              font-size="8"
              fill="#58a6ff"
              opacity="0.7"
              font-family="ui-monospace, monospace"
            >
              藍
            </text>
          </svg>
          <div class="step-code">
            v_color = a_color
          </div>
        </div>
      </div>

      <!-- 箭頭 -->
      <div class="flow-arrow">
        <svg
          viewBox="0 0 24 40"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 4 L12 28 M6 22 L12 28 L18 22"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            opacity="0.3"
          />
        </svg>
        <span class="flow-arrow-label">GPU 自動插值</span>
      </div>

      <!-- Fragment Shader -->
      <div class="flow-step">
        <div class="step-label">
          Fragment Shader
        </div>
        <div class="step-content">
          <svg
            viewBox="0 0 220 90"
            xmlns="http://www.w3.org/2000/svg"
          >
            <!-- 漸層三角形 -->
            <defs>
              <linearGradient
                id="grad-ab"
                x1="0%"
                y1="100%"
                x2="100%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  stop-color="#ff7b72"
                />
                <stop
                  offset="100%"
                  stop-color="#7ee787"
                />
              </linearGradient>
              <linearGradient
                id="grad-tri"
                x1="0%"
                y1="100%"
                x2="50%"
                y2="0%"
              >
                <stop
                  offset="0%"
                  stop-color="#ff7b72"
                />
                <stop
                  offset="50%"
                  stop-color="#7ee787"
                />
                <stop
                  offset="100%"
                  stop-color="#58a6ff"
                />
              </linearGradient>
            </defs>

            <polygon
              points="110,10 30,78 190,78"
              fill="url(#grad-tri)"
              fill-opacity="0.6"
              stroke="none"
            />

            <!-- 頂點標記 -->
            <circle
              cx="110"
              cy="10"
              r="4"
              fill="#58a6ff"
            />
            <circle
              cx="30"
              cy="78"
              r="4"
              fill="#ff7b72"
            />
            <circle
              cx="190"
              cy="78"
              r="4"
              fill="#7ee787"
            />
          </svg>
          <div class="step-code">
            gl_FragColor = vec4(v_color, 1.0)
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagram-varying {
  margin: 1.5rem 0;
}

.flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  border-radius: 12px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  overflow: hidden;
  background: rgba(128, 128, 128, 0.04);
  padding: 20px;
}

.flow-step {
  width: 100%;
  max-width: 300px;
  text-align: center;
}

.step-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2, currentColor);
  opacity: 0.7;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.step-content svg {
  max-width: 240px;
  margin: 0 auto;
  display: block;
}

.step-code {
  margin-top: 8px;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: #d2a8ff;
  opacity: 0.8;
}

.flow-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
}

.flow-arrow svg {
  width: 24px;
  height: 40px;
}

.flow-arrow-label {
  font-size: 10px;
  color: var(--vp-c-text-3, currentColor);
  opacity: 0.5;
}
</style>
