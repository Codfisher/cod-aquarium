<template>
  <div class="diagram-buffer-flow not-prose">
    <div class="flow">
      <!-- Step 1: createBuffer -->
      <div class="step">
        <div class="step-header">
          <span class="step-num">1</span>
          <code class="step-api">gl.createBuffer()</code>
        </div>
        <div class="step-visual">
          <div class="buffer buffer--empty">
            <span class="buffer-label">Buffer</span>
            <span class="buffer-state">空的</span>
          </div>
        </div>
        <div class="step-desc">
          在 GPU 記憶體開一塊空間
        </div>
      </div>

      <div class="arrow">
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
          <path d="M8 2V22M4 18L8 22L12 18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      <!-- Step 2: bindBuffer -->
      <div class="step">
        <div class="step-header">
          <span class="step-num">2</span>
          <code class="step-api">gl.bindBuffer(gl.ARRAY_BUFFER, buffer)</code>
        </div>
        <div class="step-visual">
          <div class="bind-scene">
            <div class="bind-slot">
              <span class="bind-slot-label">ARRAY_BUFFER</span>
            </div>
            <svg class="bind-link" width="40" height="16" viewBox="0 0 40 16" fill="none">
              <path d="M0 8H40" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3" />
              <circle cx="38" cy="8" r="3" fill="currentColor" />
            </svg>
            <div class="buffer buffer--bound">
              <span class="buffer-label">Buffer</span>
            </div>
          </div>
        </div>
        <div class="step-desc">
          把 Buffer 綁到操作插槽上
        </div>
      </div>

      <div class="arrow">
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
          <path d="M8 2V22M4 18L8 22L12 18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      <!-- Step 3: bufferData -->
      <div class="step">
        <div class="step-header">
          <span class="step-num">3</span>
          <code class="step-api">gl.bufferData(..., positionList, ...)</code>
        </div>
        <div class="step-visual">
          <div class="data-scene">
            <div class="data-source">
              <span class="data-source-label">JS</span>
              <div class="data-values">
                <span class="data-val data-val--a">-1</span>
                <span class="data-val data-val--a">-1</span>
                <span class="data-val data-val--b">1</span>
                <span class="data-val data-val--b">-1</span>
                <span class="data-val data-val--c">-1</span>
                <span class="data-val data-val--c">1</span>
              </div>
            </div>
            <svg class="data-arrow" width="28" height="16" viewBox="0 0 28 16" fill="none">
              <path d="M2 8H26M22 4L26 8L22 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div class="buffer buffer--filled">
              <span class="buffer-label">Buffer</span>
              <div class="buffer-data">
                <span class="bd bd--a" />
                <span class="bd bd--a" />
                <span class="bd bd--b" />
                <span class="bd bd--b" />
                <span class="bd bd--c" />
                <span class="bd bd--c" />
              </div>
            </div>
          </div>
        </div>
        <div class="step-desc">
          把 Float32Array 資料複製進 Buffer
        </div>
      </div>

      <div class="arrow">
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
          <path d="M8 2V22M4 18L8 22L12 18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      <!-- Step 4: vertexAttribPointer -->
      <div class="step">
        <div class="step-header">
          <span class="step-num step-num--green">4</span>
          <code class="step-api">gl.vertexAttribPointer(loc, <strong>2</strong>, ...)</code>
        </div>
        <div class="step-visual">
          <div class="read-scene">
            <div class="buffer buffer--reading">
              <div class="read-groups">
                <div class="read-group read-group--a">
                  <span class="rg-val">-1</span>
                  <span class="rg-val">-1</span>
                  <span class="rg-brace" />
                </div>
                <div class="read-group read-group--b">
                  <span class="rg-val">1</span>
                  <span class="rg-val">-1</span>
                  <span class="rg-brace" />
                </div>
                <div class="read-group read-group--c">
                  <span class="rg-val">-1</span>
                  <span class="rg-val">1</span>
                  <span class="rg-brace" />
                </div>
              </div>
            </div>
            <div class="read-labels">
              <span class="read-label read-label--a">頂點 1</span>
              <span class="read-label read-label--b">頂點 2</span>
              <span class="read-label read-label--c">頂點 3</span>
            </div>
          </div>
        </div>
        <div class="step-desc">
          告訴 GPU 每 <strong>2</strong> 個 float 讀成一組 → 對應 <code>attribute vec2 a_position</code>
        </div>
      </div>

      <!-- 結果 -->
      <div class="arrow arrow--done">
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
          <path d="M8 2V22M4 18L8 22L12 18" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <div class="result">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M3 7.5L6 11L12 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Vertex Shader 裡的 <code>a_position</code> 就能收到每個頂點的座標了
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagram-buffer-flow {
  margin: 1.5rem 0;
}

.flow {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 箭頭 */
.arrow {
  opacity: 0.18;
  padding: 2px 0;
}

.arrow--done {
  opacity: 0.3;
  color: #1e8e3e;
}

/* 步驟 */
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 380px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  background: rgba(128, 128, 128, 0.02);
}

.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  background: rgba(26, 115, 232, 0.1);
  color: #1a73e8;
  font-family: ui-monospace, monospace;
}

.step-num--green {
  background: rgba(30, 142, 62, 0.1);
  color: #1e8e3e;
}

.step-api {
  font-size: 12px;
  font-family: ui-monospace, 'SF Mono', monospace;
  opacity: 0.85;
  background: none !important;
  padding: 0 !important;
}

.step-api strong {
  opacity: 1;
  color: #1e8e3e;
  font-weight: 700;
}

.step-visual {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.step-desc {
  font-size: 12px;
  opacity: 0.8;
  text-align: center;
}

.step-desc code {
  font-family: ui-monospace, monospace;
  font-size: inherit;
  background: none;
  padding: 0;
}

.step-desc strong {
  font-weight: 700;
}

/* Buffer 方塊 */
.buffer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1.5px dashed rgba(128, 128, 128, 0.3);
  min-width: 80px;
  justify-content: center;
  font-family: ui-monospace, monospace;
}

.buffer-label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
}

.buffer-state {
  font-size: 12px;
  opacity: 0.55;
  font-style: italic;
}

.buffer--empty {
  min-height: 38px;
  background: rgba(128, 128, 128, 0.03);
}

.buffer--bound {
  border-style: solid;
  border-color: rgba(26, 115, 232, 0.3);
  background: rgba(26, 115, 232, 0.03);
}

.buffer--filled {
  border-style: solid;
  border-color: rgba(26, 115, 232, 0.3);
  background: rgba(26, 115, 232, 0.03);
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
}

.buffer--reading {
  border-style: solid;
  border-color: rgba(30, 142, 62, 0.3);
  background: rgba(30, 142, 62, 0.03);
  padding: 10px 12px;
}

/* Buffer 內的色塊 */
.buffer-data {
  display: flex;
  gap: 2px;
}

.bd {
  width: 14px;
  height: 10px;
  border-radius: 2px;
}

.bd--a { background: rgba(217, 48, 37, 0.5); }
.bd--b { background: rgba(30, 142, 62, 0.5); }
.bd--c { background: rgba(26, 115, 232, 0.5); }

/* Step 2: bind */
.bind-scene {
  display: flex;
  align-items: center;
  gap: 0;
}

.bind-slot {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1.5px solid rgba(26, 115, 232, 0.25);
  background: rgba(26, 115, 232, 0.04);
}

.bind-slot-label {
  font-size: 12px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  color: #1a73e8;
}

.bind-link {
  opacity: 0.4;
  flex-shrink: 0;
}

/* Step 3: data */
.data-scene {
  display: flex;
  align-items: center;
  gap: 6px;
}

.data-source {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.data-source-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.7;
  font-family: ui-monospace, monospace;
}

.data-values {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  max-width: 120px;
  justify-content: center;
}

.data-val {
  font-size: 12px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  padding: 2px 5px;
  border-radius: 3px;
}

.data-val--a { background: rgba(217, 48, 37, 0.1); color: #d93025; }
.data-val--b { background: rgba(30, 142, 62, 0.1); color: #1e8e3e; }
.data-val--c { background: rgba(26, 115, 232, 0.1); color: #1a73e8; }

.data-arrow {
  opacity: 0.4;
  flex-shrink: 0;
}

/* Step 4: read groups */
.read-scene {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.read-groups {
  display: flex;
  gap: 8px;
}

.read-group {
  display: flex;
  gap: 3px;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1.5px solid;
  position: relative;
}

.read-group--a {
  border-color: rgba(217, 48, 37, 0.25);
  background: rgba(217, 48, 37, 0.04);
}

.read-group--b {
  border-color: rgba(30, 142, 62, 0.25);
  background: rgba(30, 142, 62, 0.04);
}

.read-group--c {
  border-color: rgba(26, 115, 232, 0.25);
  background: rgba(26, 115, 232, 0.04);
}

.rg-val {
  font-size: 12px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}

.rg-brace {
  display: none;
}

.read-labels {
  display: flex;
  gap: 8px;
}

.read-label {
  font-size: 12px;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  min-width: 52px;
  text-align: center;
}

.read-label--a { color: #d93025; }
.read-label--b { color: #1e8e3e; }
.read-label--c { color: #1a73e8; }

/* 結果 */
.result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(30, 142, 62, 0.05);
  border: 1px dashed rgba(30, 142, 62, 0.25);
  color: #1e8e3e;
  font-size: 12px;
  font-weight: 600;
}

.result code {
  font-family: ui-monospace, monospace;
  font-size: inherit;
  background: none;
  padding: 0;
}

/* RWD */
@media (max-width: 480px) {
  .read-groups {
    flex-direction: column;
    gap: 4px;
  }

  .read-labels {
    flex-direction: column;
    gap: 0;
  }
}
</style>
