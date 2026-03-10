<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui/.'
import { useElementSize } from '@vueuse/core'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'

const canvasWithout = useTemplateRef<HTMLCanvasElement>('canvasWithout')
const canvasWith = useTemplateRef<HTMLCanvasElement>('canvasWith')

const sizeWithout = useElementSize(canvasWithout)
const sizeWith = useElementSize(canvasWith)

/** 模擬選取狀態切換，讓 items 結構改變 */
const menuVariant = ref(0)

/** 使用者拖曳控制的寬度（百分比） */
const resizePercent = ref(100)

/** 紀錄最新的 size */
const lastSizeWithout = ref('')
const lastSizeWith = ref('')

const updateCount = ref(0)

watch([sizeWithout.width, sizeWithout.height], ([width, height]) => {
  if (width === 0 && height === 0)
    return
  lastSizeWithout.value = `${Math.round(width)} × ${Math.round(height)}`
})
watch([sizeWith.width, sizeWith.height], ([width, height]) => {
  if (width === 0 && height === 0)
    return
  lastSizeWith.value = `${Math.round(width)} × ${Math.round(height)}`
})

/** 在 canvas 上畫圖案，如果 DOM 被替換，圖案會消失 */
function drawPattern(canvas: HTMLCanvasElement | null, hueStart: number) {
  if (!canvas)
    return
  const context = canvas.getContext('2d')
  if (!context)
    return

  canvas.width = canvas.offsetWidth * 2
  canvas.height = canvas.offsetHeight * 2
  context.scale(2, 2)

  const displayWidth = canvas.offsetWidth
  const displayHeight = canvas.offsetHeight

  // 畫網格背景
  context.fillStyle = 'rgba(0,0,0,0.03)'
  context.fillRect(0, 0, displayWidth, displayHeight)

  const gridSize = 16
  context.strokeStyle = 'rgba(0,0,0,0.06)'
  context.lineWidth = 0.5
  for (let x = 0; x <= displayWidth; x += gridSize) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, displayHeight)
    context.stroke()
  }
  for (let y = 0; y <= displayHeight; y += gridSize) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(displayWidth, y)
    context.stroke()
  }

  // 畫幾何圖案
  for (let i = 0; i < 6; i++) {
    const x = (displayWidth / 7) * (i + 1)
    const y = displayHeight / 2 + Math.sin(i * 0.8) * 12
    const size = 8 + Math.cos(i * 1.2) * 4

    context.beginPath()
    context.arc(x, y, size, 0, Math.PI * 2)
    context.fillStyle = `hsla(${hueStart + i * 25}, 70%, 60%, 0.5)`
    context.fill()
    context.strokeStyle = `hsla(${hueStart + i * 25}, 70%, 50%, 0.8)`
    context.lineWidth = 1.5
    context.stroke()
  }

  // 中間的連接線
  context.beginPath()
  context.strokeStyle = `hsla(${hueStart}, 60%, 55%, 0.3)`
  context.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    const x = (displayWidth / 7) * (i + 1)
    const y = displayHeight / 2 + Math.sin(i * 0.8) * 12
    if (i === 0)
      context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.stroke()

  // 標記文字
  context.fillStyle = `hsla(${hueStart}, 50%, 40%, 0.6)`
  context.font = '500 10px system-ui'
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillText('canvas 2d context · initialized', 8, 6)
}

/** 模擬右鍵選單 items 結構變化 */
function updateContextMenu() {
  menuVariant.value = menuVariant.value === 0 ? 1 : 0
  updateCount.value++
}

const menuItems = computed<ContextMenuItem[][]>(() => {
  const baseItems: ContextMenuItem[] = [
    {
      label: 'Select All',
      icon: 'material-symbols:select-all-rounded',
    },
    {
      label: 'Reset View',
      icon: 'material-symbols:flip-camera-ios-outline-rounded',
    },
  ]

  if (menuVariant.value > 0) {
    return [
      [
        { label: `已選取 ${menuVariant.value} 個物件`, type: 'label' as const },
        {
          label: 'Position',
          icon: 'hugeicons:three-d-move',
          children: [
            { label: 'Snap to Ground' },
            { label: 'Move to Origin' },
          ],
        },
        {
          label: 'Rotation',
          icon: 'hugeicons:three-d-rotate',
          children: [
            { label: 'Rotate X 90°' },
            { label: 'Rotate Y 90°' },
            { label: 'Reset' },
          ],
        },
        {
          label: 'Delete',
          icon: 'i-material-symbols:delete-outline-rounded',
        },
      ],
      baseItems,
    ]
  }

  return [baseItems]
})

onMounted(() => {
  drawPattern(canvasWithout.value, 0)
  drawPattern(canvasWith.value, 160)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 控制區 -->
    <div class="flex flex-wrap items-center gap-3">
      <u-button
        variant="outline"
        color="neutral"
        class="p-2!"
        @click="updateContextMenu"
      >
        更新右鍵選單
      </u-button>

      <span class="text-xs opacity-40 tabular-nums">
        items 已更新 {{ updateCount }} 次
      </span>
    </div>

    <!-- 寬度滑桿 -->
    <div class="flex items-center gap-3 text-sm">
      <label class="opacity-50 shrink-0 text-xs">調整寬度</label>
      <input
        v-model="resizePercent"
        type="range"
        min="30"
        max="100"
        class="flex-1 accent-primary"
      >
      <span class="opacity-40 text-xs tabular-nums w-8 text-right">{{ resizePercent }}%</span>
    </div>

    <p class="text-xs opacity-40 -mt-1">
      操作：先按「更新右鍵選單」讓 items 結構變化，再拖曳寬度滑桿觀察 useElementSize 是否還能收到事件。右鍵點擊 canvas 可以看到實際的 context menu。
    </p>

    <!-- 兩欄對比 -->
    <div
      class="grid md:grid-cols-2 gap-4 transition-all"
      :style="{ width: `${resizePercent}%` }"
    >
      <!-- 沒有 v-once -->
      <div
        class="flex flex-col gap-3 rounded-xl border border-red-200 dark:border-red-900/40 p-4 bg-red-50/30 dark:bg-red-950/10"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-red-400" />
            <span class="text-sm font-medium">
              沒有 v-once
            </span>
          </div>
        </div>

        <u-context-menu
          :items="menuItems"
          :modal="false"
        >
          <canvas
            ref="canvasWithout"
            class="w-full h-20 rounded-lg border border-black/5 dark:border-white/5"
          />
        </u-context-menu>

        <!-- useElementSize 最新尺寸 -->
        <div class="flex items-center gap-2 text-xs">
          <span class="opacity-50">useElementSize：</span>
          <span
            class="tabular-nums font-mono"
            :class="lastSizeWithout ? 'text-red-500 dark:text-red-400' : 'opacity-30'"
          >
            {{ lastSizeWithout || '（尚未收到事件）' }}
          </span>
        </div>
      </div>

      <!-- 有 v-once -->
      <div
        class="flex flex-col gap-3 rounded-xl border border-green-200 dark:border-green-900/40 p-4 bg-green-50/30 dark:bg-green-950/10"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full bg-green-400" />
            <span class="text-sm font-medium">
              有 v-once
            </span>
          </div>
        </div>

        <u-context-menu
          :items="menuItems"
          :modal="false"
        >
          <canvas
            v-once
            ref="canvasWith"
            class="w-full h-20 rounded-lg border border-black/5 dark:border-white/5"
          />
        </u-context-menu>

        <!-- useElementSize 最新尺寸 -->
        <div class="flex items-center gap-2 text-xs">
          <span class="opacity-50">useElementSize：</span>
          <span
            class="tabular-nums font-mono"
            :class="lastSizeWith ? 'text-green-500 dark:text-green-400' : 'opacity-30'"
          >
            {{ lastSizeWith || '（尚未收到事件）' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
