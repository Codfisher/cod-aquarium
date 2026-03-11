<template>
  <div class="flex flex-col gap-4">
    <!-- 控制區 -->
    <div class="flex flex-wrap items-center gap-3">
      <label class=" shrink-0 text-sm">
        調整寬度
      </label>

      <u-slider
        v-model="resizePercent"
        :min="80"
        :max="100"
        class="flex-1 accent-primary"
      />
    </div>

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

        <u-context-menu :items="menuItems">
          <canvas
            ref="canvasWithout"
            class="w-full h-32 rounded-lg border border-black/5 dark:border-white/5 outline-none block"
          />
        </u-context-menu>

        <!-- useElementSize 最新尺寸 -->
        <div class="flex items-center gap-2 text-xs">
          <span class="opacity-50">Element Size：</span>
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

        <u-context-menu :items="menuItems">
          <canvas
            v-once
            ref="canvasWith"
            class="w-full h-32 rounded-lg border border-black/5 dark:border-white/5 outline-none block"
          />
        </u-context-menu>

        <!-- useElementSize 最新尺寸 -->
        <div class="flex items-center gap-2 text-xs">
          <span class="opacity-50">Element Size：</span>
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

<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui/.'
import { useElementSize } from '@vueuse/core'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useBabylonSimple } from './use-babylon-simple'

const canvasWithout = useTemplateRef('canvasWithout')
const canvasWith = useTemplateRef('canvasWith')

useBabylonSimple(canvasWithout, { hue: 0 })
useBabylonSimple(canvasWith, { hue: 160 })

const sizeWithout = useElementSize(canvasWithout)
const sizeWith = useElementSize(canvasWith)

/** 使用者拖曳控制的寬度（百分比） */
const resizePercent = ref(100)

/** 紀錄最新的 size */
const lastSizeWithout = ref('')
const lastSizeWith = ref('')

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
  return [baseItems]
})
</script>
