<template>
  <div class="diagram-attribute not-prose">
    <div class="comparison">
      <!-- Uniform 側 -->
      <div class="side">
        <div class="side-title">
          Uniform
        </div>
        <div class="side-desc">
          所有頂點拿到同一份資料
        </div>
        <svg
          viewBox="0 0 200 140"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- JS 方塊 -->
          <rect
            x="60"
            y="8"
            width="80"
            height="28"
            rx="6"
            fill="#58a6ff"
            fill-opacity="0.15"
            stroke="#58a6ff"
            stroke-width="1.5"
          />
          <text
            x="100"
            y="27"
            text-anchor="middle"
            font-size="12"
            fill="#58a6ff"
            font-family="ui-monospace, monospace"
          >
            u_color
          </text>

          <!-- 箭頭 -->
          <line
            x1="100"
            y1="36"
            x2="40"
            y2="70"
            stroke="currentColor"
            stroke-width="1"
            opacity="0.3"
          />
          <line
            x1="100"
            y1="36"
            x2="100"
            y2="70"
            stroke="currentColor"
            stroke-width="1"
            opacity="0.3"
          />
          <line
            x1="100"
            y1="36"
            x2="160"
            y2="70"
            stroke="currentColor"
            stroke-width="1"
            opacity="0.3"
          />

          <!-- 頂點 -->
          <circle
            cx="40"
            cy="82"
            r="10"
            fill="#2dd4bf"
            fill-opacity="0.15"
            stroke="#2dd4bf"
            stroke-width="1.5"
          />
          <text
            x="40"
            y="106"
            text-anchor="middle"
            font-size="9"
            fill="currentColor"
            opacity="0.5"
          >
            同色
          </text>

          <circle
            cx="100"
            cy="82"
            r="10"
            fill="#2dd4bf"
            fill-opacity="0.15"
            stroke="#2dd4bf"
            stroke-width="1.5"
          />
          <text
            x="100"
            y="106"
            text-anchor="middle"
            font-size="9"
            fill="currentColor"
            opacity="0.5"
          >
            同色
          </text>

          <circle
            cx="160"
            cy="82"
            r="10"
            fill="#2dd4bf"
            fill-opacity="0.15"
            stroke="#2dd4bf"
            stroke-width="1.5"
          />
          <text
            x="160"
            y="106"
            text-anchor="middle"
            font-size="9"
            fill="currentColor"
            opacity="0.5"
          >
            同色
          </text>
        </svg>
      </div>

      <!-- 分隔線 -->
      <div class="divider" />

      <!-- Attribute 側 -->
      <div class="side">
        <div class="side-title side-title--highlight">
          Attribute
        </div>
        <div class="side-desc">
          每個頂點拿到<strong>專屬的</strong>資料
        </div>
        <svg
          viewBox="0 0 200 140"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- JS 方塊們 -->
          <rect
            x="8"
            y="8"
            width="56"
            height="28"
            rx="6"
            fill="#ff7b72"
            fill-opacity="0.15"
            stroke="#ff7b72"
            stroke-width="1.5"
          />
          <text
            x="36"
            y="27"
            text-anchor="middle"
            font-size="10"
            fill="#ff7b72"
            font-family="ui-monospace, monospace"
          >
            紅色
          </text>

          <rect
            x="72"
            y="8"
            width="56"
            height="28"
            rx="6"
            fill="#7ee787"
            fill-opacity="0.15"
            stroke="#7ee787"
            stroke-width="1.5"
          />
          <text
            x="100"
            y="27"
            text-anchor="middle"
            font-size="10"
            fill="#7ee787"
            font-family="ui-monospace, monospace"
          >
            綠色
          </text>

          <rect
            x="136"
            y="8"
            width="56"
            height="28"
            rx="6"
            fill="#58a6ff"
            fill-opacity="0.15"
            stroke="#58a6ff"
            stroke-width="1.5"
          />
          <text
            x="164"
            y="27"
            text-anchor="middle"
            font-size="10"
            fill="#58a6ff"
            font-family="ui-monospace, monospace"
          >
            藍色
          </text>

          <!-- 箭頭 -->
          <line
            x1="36"
            y1="36"
            x2="40"
            y2="70"
            stroke="#ff7b72"
            stroke-width="1"
            opacity="0.4"
          />
          <line
            x1="100"
            y1="36"
            x2="100"
            y2="70"
            stroke="#7ee787"
            stroke-width="1"
            opacity="0.4"
          />
          <line
            x1="164"
            y1="36"
            x2="160"
            y2="70"
            stroke="#58a6ff"
            stroke-width="1"
            opacity="0.4"
          />

          <!-- 頂點 -->
          <circle
            cx="40"
            cy="82"
            r="10"
            fill="#ff7b72"
            fill-opacity="0.2"
            stroke="#ff7b72"
            stroke-width="1.5"
          />
          <text
            x="40"
            y="106"
            text-anchor="middle"
            font-size="9"
            fill="#ff7b72"
            opacity="0.7"
          >
            各自
          </text>

          <circle
            cx="100"
            cy="82"
            r="10"
            fill="#7ee787"
            fill-opacity="0.2"
            stroke="#7ee787"
            stroke-width="1.5"
          />
          <text
            x="100"
            y="106"
            text-anchor="middle"
            font-size="9"
            fill="#7ee787"
            opacity="0.7"
          >
            各自
          </text>

          <circle
            cx="160"
            cy="82"
            r="10"
            fill="#58a6ff"
            fill-opacity="0.2"
            stroke="#58a6ff"
            stroke-width="1.5"
          />
          <text
            x="160"
            y="106"
            text-anchor="middle"
            font-size="9"
            fill="#58a6ff"
            opacity="0.7"
          >
            各自
          </text>
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagram-attribute {
  margin: 1.5rem 0;
}

.comparison {
  display: flex;
  gap: 1px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(128, 128, 128, 0.2);
}

.side {
  flex: 1;
  padding: 16px;
  background: rgba(128, 128, 128, 0.04);
  text-align: center;
}

.divider {
  width: 1px;
  background: rgba(128, 128, 128, 0.2);
}

.side-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1, currentColor);
  margin-bottom: 4px;
  font-family: ui-monospace, monospace;
}

.side-title--highlight {
  color: #2dd4bf;
}

.side-desc {
  font-size: 12px;
  color: var(--vp-c-text-3, currentColor);
  opacity: 0.7;
  margin-bottom: 12px;
}

svg {
  max-width: 220px;
  margin: 0 auto;
  display: block;
}
</style>
