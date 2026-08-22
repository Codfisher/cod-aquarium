<template>
  <figure
    class="demo-frame not-prose"
    :class="{ 'demo-frame--compact': compact }"
  >
    <figcaption
      v-if="title"
      class="demo-title"
    >
      {{ title }}
    </figcaption>

    <div
      ref="containerRef"
      class="demo-stage"
      :style="{ height: `${height}px` }"
    >
      <canvas
        ref="canvasRef"
        class="demo-canvas"
      />

      <div
        v-if="!isReady && !errorMessage"
        class="demo-status"
      >
        場景載入中…
      </div>

      <div
        v-if="errorMessage"
        class="demo-status demo-status--error"
      >
        {{ errorMessage }}
      </div>

      <span
        v-if="badge"
        class="demo-badge"
      >
        {{ badge }}
      </span>

      <!--
        操作提示

        滾輪縮放要按過畫布才開放（見 use-babylon-demo 的說明），
        而「按一下才有」這件事讀者猜不到，得寫出來。
        開放之後提示就收掉，免得一直擋著畫面。

        zoomable 關掉時整套縮放機制都不會啟動，這句提示也不該出現
      -->
      <span
        v-if="zoomable && isReady && !isZoomActive"
        class="demo-hint"
      >
        {{ interactive ? '拖曳轉動，按一下開放滾輪縮放' : '按一下開放滾輪縮放' }}
      </span>
    </div>

    <div
      v-if="$slots.default"
      class="demo-controls"
    >
      <slot />
    </div>

    <p
      v-if="caption"
      class="demo-caption"
    >
      {{ caption }}
    </p>
  </figure>
</template>

<script setup lang="ts">
import type { BabylonDemoContext } from './use-babylon-demo'
import { useBabylonDemo } from './use-babylon-demo'

const props = withDefaults(defineProps<{
  /** 場景內容，引擎建好之後才會被呼叫，可回傳清理函式 */
  setup: (context: BabylonDemoContext) => void | (() => void) | Promise<void | (() => void)>;
  title?: string;
  caption?: string;
  /** 左上角的小標籤，前後對比時用來標示這一邊是哪一種 */
  badge?: string;
  height?: number;
  compact?: boolean;
  cameraAlpha?: number;
  cameraBeta?: number;
  cameraRadius?: number;
  cameraTarget?: [number, number, number];
  clearColor?: [number, number, number, number];
  interactive?: boolean;
  /** 是否允許滾輪縮放，純 PostProcess、鏡頭距離對畫面沒有意義的範例可以關掉 */
  zoomable?: boolean;
}>(), {
  height: 260,
  compact: false,
  interactive: true,
  zoomable: true,
})

const {
  containerRef,
  canvasRef,
  isReady,
  errorMessage,
  isZoomActive,
} = useBabylonDemo({
  setup: props.setup,
  cameraAlpha: props.cameraAlpha,
  cameraBeta: props.cameraBeta,
  cameraRadius: props.cameraRadius,
  cameraTarget: props.cameraTarget,
  clearColor: props.clearColor,
  interactive: props.interactive,
  zoomable: props.zoomable,
})
</script>

<style scoped>
.demo-frame {
  margin: 1.5rem 0;
}

.demo-frame--compact {
  margin: 0;
}

.demo-title {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.demo-stage {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background:
    linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%);
  border: 1px solid #e5e7eb;
}

.demo-canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
  touch-action: none;
}

.demo-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #9ca3af;
  pointer-events: none;
}

.demo-status--error {
  color: #dc2626;
  padding: 1rem;
  text-align: center;
}

.demo-hint {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: #6b7280;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #e5e7eb;
  pointer-events: none;
  opacity: 0.85;
}

.demo-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #4b5563;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid #e5e7eb;
  pointer-events: none;
}

.demo-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.demo-caption {
  margin-top: 0.6rem;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

:global(html.dark) .demo-title { color: #9ca3af; }

:global(html.dark) .demo-stage {
  background: linear-gradient(135deg, #111827 0%, #0b1220 100%);
  border-color: #1f2937;
}

:global(html.dark) .demo-badge {
  color: #d1d5db;
  background: rgba(17, 24, 39, 0.82);
  border-color: #374151;
}

:global(html.dark) .demo-caption { color: #9ca3af; }
</style>
