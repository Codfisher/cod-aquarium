<template>
  <div class="window-container w-screen h-screen overflow-hidden absolute top-0 left-0 pointer-events-none p-10">
    <div
      ref="containerRef"
      class=" w-full h-full relative"
    >
      <component
        :is="app.component"
        v-for="app in appList"
        :key="app.id"
        :style="app.style"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useElementSize } from '@vueuse/core'
import { clamp, firstBy, pipe } from 'remeda'
import { computed, reactive, useTemplateRef } from 'vue'
import { useAppStore } from '../stores/app-store'

interface Props { }
const props = withDefaults(defineProps<Props>(), {})

const appStore = useAppStore()

const containerRef = useTemplateRef('containerRef')
const containerSize = reactive(useElementSize(containerRef))

const appList = computed(() => {
  const list = appStore.appList

  const minFocusedAt = firstBy(
    list,
    ({ focusedAt }) => focusedAt,
  )?.focusedAt ?? 0

  return list.map((item) => {
    const { data } = item

    const x = pipe(
      data.x + data.offsetX,
      clamp({
        min: 0,
        max: containerSize.width - data.width,
      }),
    )
    const y = pipe(
      data.y + data.offsetY,
      clamp({
        min: 0,
        max: containerSize.height - data.height,
      }),
    )

    const style: CSSProperties = {
      translate: `${x}px ${y}px`,
      zIndex: item.focusedAt - minFocusedAt,
    }

    return {
      id: item.id,
      component: item.data.component,
      style,
    }
  })
})
</script>

<style scoped lang="sass">
</style>
