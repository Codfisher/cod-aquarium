<template>
  <client-only>
    <div class="shader-playground not-prose">
      <!-- Canvas 渲染區 -->
      <lazy-render>
        <div class="sp-canvas-wrap">
          <canvas
            ref="canvasRef"
            class="sp-canvas"
          />

          <!-- 錯誤訊息 -->
          <div
            v-if="error"
            class="sp-error"
          >
            <span class="sp-error-icon">✕</span>
            <span>{{ error }}</span>
          </div>
        </div>
      </lazy-render>

      <!-- 標題列 -->
      <div class="sp-header">
        <div class="sp-tab-list">
          <button
            class="sp-tab"
            :class="{ 'sp-tab--active': activeTab === 'fragment' }"
            @click="activeTab = 'fragment'"
          >
            Fragment Shader
          </button>
          <button
            v-if="showVertexEditor"
            class="sp-tab"
            :class="{ 'sp-tab--active': activeTab === 'vertex' }"
            @click="activeTab = 'vertex'"
          >
            Vertex Shader
          </button>
        </div>

        <!-- 預設範例 -->
        <div
          v-if="props.presetList.length > 0"
          class="sp-preset-list"
        >
          <button
            v-for="(preset, index) in props.presetList"
            :key="index"
            class="sp-preset-btn"
            :class="{ 'sp-preset-btn--active': currentPresetIndex === index }"
            @click="selectPreset(index)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <!-- 程式碼編輯區 -->
      <div class="sp-editor">
        <!-- 行號 -->
        <div
          ref="lineNumberRef"
          class="sp-line-number"
          aria-hidden="true"
        >
          <div
            v-for="lineNumber in lineCount"
            :key="lineNumber"
            class="sp-line-number-item"
          >
            {{ lineNumber }}
          </div>
        </div>

        <!-- 語法高亮層 + 輸入層 -->
        <div class="sp-code-area">
          <!-- 高亮層（背景） -->
          <pre
            ref="highlightRef"
            class="sp-highlight"
            aria-hidden="true"
          ><code v-html="highlightedHtml" /></pre>

          <!-- 輸入層（前景，透明文字） -->
          <textarea
            ref="textareaRef"
            v-model="code"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            class="sp-textarea"
            @input="handleInput"
            @scroll="syncScroll"
          />
        </div>
      </div>

      <!-- 底部資訊列 -->
      <div class="sp-footer">
        <span class="sp-uniform-tag">u_time</span>
        <span class="sp-uniform-desc">時間(秒)</span>
        <span class="sp-uniform-tag">u_resolution</span>
        <span class="sp-uniform-desc">畫布尺寸</span>
        <span class="sp-uniform-tag">u_mouse</span>
        <span class="sp-uniform-desc">滑鼠位置</span>
      </div>
    </div>
  </client-only>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import LazyRender from '../../web/components/lazy-render.vue'
import { PRESET_SOLID_COLOR, type ShaderPreset } from './shader-intro-for-js-developers/shader-preset'
import { useGlslHighlight } from './shader-intro-for-js-developers/use-glsl-highlight'
import { DEFAULT_VERTEX_SHADER, useWebGl } from './shader-intro-for-js-developers/use-webgl'

type ShaderTab = 'fragment' | 'vertex'

interface Props {
  /** 預設 Fragment Shader 程式碼 */
  initialCode?: string;
  /** 預設 Vertex Shader 程式碼 */
  vertexCode?: string;
  /** 是否顯示 Vertex Shader 編輯區 */
  showVertexEditor?: boolean;
  /** 自訂預設範例列表 */
  presetList?: ShaderPreset[];
  /** canvas 高度 */
  height?: number;
}

const props = withDefaults(defineProps<Props>(), {
  initialCode: () => PRESET_SOLID_COLOR.code,
  vertexCode: () => DEFAULT_VERTEX_SHADER,
  showVertexEditor: false,
  presetList: () => [],
  height: 300,
})

const canvasRef = useTemplateRef('canvasRef')
const textareaRef = useTemplateRef('textareaRef')
const highlightRef = useTemplateRef('highlightRef')
const lineNumberRef = useTemplateRef('lineNumberRef')

const activeTab = ref<ShaderTab>('fragment')

// Fragment Shader 狀態
const fragmentCode = ref(props.initialCode)
const fragmentSource = ref(props.initialCode)

// Vertex Shader 狀態
const vertexCode = ref(props.vertexCode)
const vertexSource = ref(props.vertexCode)

const currentPresetIndex = ref(-1)

// 目前顯示的程式碼（依 tab 切換）
const code = computed({
  get: () => activeTab.value === 'fragment' ? fragmentCode.value : vertexCode.value,
  set: (value: string) => {
    if (activeTab.value === 'fragment') {
      fragmentCode.value = value
    }
    else {
      vertexCode.value = value
    }
  },
})

const { highlightedHtml } = useGlslHighlight(code)

const lineCount = computed(() => code.value.split('\n').length)

const { error } = useWebGl(canvasRef, {
  fragmentShaderSource: fragmentSource,
  vertexShaderSource: vertexSource,
})

const debouncedCompile = useDebounceFn(() => {
  fragmentSource.value = fragmentCode.value
  vertexSource.value = vertexCode.value
}, 500)

function handleInput() {
  currentPresetIndex.value = -1
  debouncedCompile()
}

function syncScroll() {
  const textarea = textareaRef.value
  const highlight = highlightRef.value
  const lineNumber = lineNumberRef.value
  if (!textarea)
    return

  if (highlight) {
    highlight.scrollTop = textarea.scrollTop
    highlight.scrollLeft = textarea.scrollLeft
  }
  if (lineNumber) {
    lineNumber.scrollTop = textarea.scrollTop
  }
}

function selectPreset(index: number) {
  currentPresetIndex.value = index
  if (props.presetList[index]) {
    fragmentCode.value = props.presetList[index].code
    fragmentSource.value = fragmentCode.value
  }
  nextTick(syncScroll)
}

// 切換 tab 時重置滾動位置
watch(activeTab, () => {
  nextTick(() => {
    const textarea = textareaRef.value
    if (textarea) {
      textarea.scrollTop = 0
      textarea.scrollLeft = 0
    }
    syncScroll()
  })
})

watch(code, () => {
  nextTick(syncScroll)
})
</script>

<style scoped>
.shader-playground {
  --sp-bg: #0d1117;
  --sp-bg-header: #161b22;
  --sp-bg-footer: #161b22;
  --sp-border: #30363d;
  --sp-text: #e6edf3;
  --sp-text-dim: #7d8590;
  --sp-line-num: #484f58;
  --sp-accent: #58a6ff;

  /* 語法高亮色 */
  --sh-keyword: #ff7b72;
  --sh-type: #79c0ff;
  --sh-builtin-fn: #d2a8ff;
  --sh-builtin-var: #ffa657;
  --sh-number: #a5d6ff;
  --sh-comment: #484f58;
  --sh-preprocessor: #7ee787;
  --sh-swizzle: #ffa657;

  border-radius: 12px;
  border: 1px solid var(--sp-border);
  overflow: hidden;
  background: var(--sp-bg);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
}

/* 標題列 */
.sp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--sp-bg-header);
  border-bottom: 1px solid var(--sp-border);
}

.sp-header-left {
  display: flex;
  align-items: center;
  gap: 7px;
}

.sp-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.sp-dot--red {
  background: #ff5f57;
}

.sp-dot--yellow {
  background: #febc2e;
}

.sp-dot--green {
  background: #28c840;
}

.sp-label {
  margin-left: 8px;
  font-size: 11px;
  color: var(--sp-text-dim);
  letter-spacing: 0.02em;
}

/* Tab 切換 */
.sp-tab-list {
  display: flex;
  gap: 2px;
}

.sp-tab {
  padding: 4px 12px;
  font-size: 11px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--sp-text-dim);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  letter-spacing: 0.02em;
}

.sp-tab:hover {
  color: var(--sp-text);
}

.sp-tab--active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--sp-text);
}

/* 預設範例按鈕 */
.sp-preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sp-preset-btn {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid var(--sp-border);
  background: transparent;
  color: var(--sp-text-dim);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.sp-preset-btn:hover {
  color: var(--sp-text);
  border-color: var(--sp-text-dim);
}

.sp-preset-btn--active {
  background: var(--sp-accent);
  color: #0d1117;
  border-color: var(--sp-accent);
}

/* 編輯區 */
.sp-editor {
  display: flex;
  position: relative;
  max-height: 60dvh;
  min-height: 30dvh;
  overflow: hidden;
  border-bottom: 1px solid var(--sp-border);
}

.sp-line-number {
  flex-shrink: 0;
  width: 40px;
  padding: 12px 0;
  overflow: hidden;
  text-align: right;
  user-select: none;
  background: var(--sp-bg);
  border-right: 1px solid var(--sp-border);
}

.sp-line-number-item {
  font-size: 11px;
  line-height: 20px;
  padding-right: 10px;
  color: var(--sp-line-num);
}

/* 程式碼區域：疊加結構 */
.sp-code-area {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.sp-highlight,
.sp-textarea {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 12px;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 20px;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
  box-sizing: border-box;
}

.sp-highlight {
  color: var(--sp-text);
  background: var(--sp-bg);
  pointer-events: none;
  z-index: 0;
}

.sp-highlight code {
  font-family: inherit;
}

.sp-textarea {
  color: transparent;
  caret-color: var(--sp-text);
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  z-index: 1;
  -webkit-text-fill-color: transparent;
}

.sp-textarea::selection {
  background: rgba(88, 166, 255, 0.25);
  -webkit-text-fill-color: transparent;
}

/* 語法高亮 */
.sp-highlight :deep(.sh-keyword) {
  color: var(--sh-keyword);
}

.sp-highlight :deep(.sh-type) {
  color: var(--sh-type);
}

.sp-highlight :deep(.sh-builtin-fn) {
  color: var(--sh-builtin-fn);
}

.sp-highlight :deep(.sh-builtin-var) {
  color: var(--sh-builtin-var);
}

.sp-highlight :deep(.sh-number) {
  color: var(--sh-number);
}

.sp-highlight :deep(.sh-comment) {
  color: var(--sh-comment);
  font-style: italic;
}

.sp-highlight :deep(.sh-preprocessor) {
  color: var(--sh-preprocessor);
}

.sp-highlight :deep(.sh-swizzle) {
  color: var(--sh-swizzle);
}

/* Canvas */
.sp-canvas-wrap {
  position: relative;
  background: #000;
}

.sp-canvas {
  display: block;
  width: 100%;
  height: v-bind("`${height}px`");
}

/* 錯誤 */
.sp-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  color: #ff7b72;
  font-size: 11px;
  line-height: 1.6;
  font-family: inherit;
  white-space: pre-wrap;
  overflow: auto;
}

.sp-error-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 123, 114, 0.15);
  font-size: 10px;
  margin-top: 1px;
}

/* 底部 */
.sp-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--sp-bg-footer);
  border-top: 1px solid var(--sp-border);
}

.sp-uniform-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(88, 166, 255, 0.1);
  color: var(--sp-accent);
  font-family: inherit;
}

.sp-uniform-desc {
  font-size: 10px;
  color: var(--sp-text-dim);
  margin-right: 6px;
}
</style>
