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
import type { AppType } from '../stores/app-store'
import { useElementSize } from '@vueuse/core'
import { clamp, firstBy, pipe } from 'remeda'
import { computed, defineAsyncComponent, reactive, useTemplateRef } from 'vue'
import { useAppStore } from '../stores/app-store'

const appComponentMap: Record<AppType, ReturnType<typeof defineAsyncComponent>> = {
  'about': defineAsyncComponent(() => import('./app-about/app-about.vue')),
  'center': defineAsyncComponent(() => import('./app-center/app-center.vue')),
  'note': defineAsyncComponent(() => import('./app-note/app-note.vue')),
  'portfolio': defineAsyncComponent(() => import('./app-portfolio/app-portfolio.vue')),
  'chat-llm': defineAsyncComponent(() => import('./app-chat-llm/app-chat-llm.vue')),
}

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

    const component = appComponentMap[item.type]
    if (!component) {
      throw new Error(`Unknown component type: ${item.type}`)
    }

    return {
      id: item.id,
      component,
      style,
    }
  })
})
</script>

<style scoped lang="sass">
</style>
