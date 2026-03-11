<template>
  <div class="flex flex-col gap-4">
    <!-- 控制區 -->
    <div class="flex flex-wrap items-center gap-3">
      <label class=" shrink-0 text-sm">
        調整寬度
      </label>

      <u-slider
        v-model="resizePercent"
        :min="50"
        :max="100"
        class="flex-1 accent-primary"
      />
    </div>

    <div class=" text-xs opacity-50">
      點擊滑鼠右鍵或手機長按開啟右鍵選單
    </div>

    <div
      class="transition-all"
      :style="{ width: `${resizePercent}%` }"
    >
      <u-context-menu
        :items="menuItems"
        :modal="false"
      >
        <canvas
          ref="canvasRef"
          class="w-full h-32 rounded-lg border border-black/5 dark:border-white/5 outline-none block"
        />
      </u-context-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui/.'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useBabylonSimple } from './use-babylon-simple'

const canvasRef = useTemplateRef('canvasRef')

useBabylonSimple(canvasRef, { hue: 0 })

/** 使用者拖曳控制的寬度（百分比） */
const resizePercent = ref(100)

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
