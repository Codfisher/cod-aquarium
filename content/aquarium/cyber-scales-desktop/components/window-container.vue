<template>
  <div class="window-container w-screen h-screen absolute top-0 left-0 pointer-events-none p-10">
    <div class="pointer-events-none  w-full h-full relative">
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
import { computed } from 'vue'
import { useAppStore } from '../stores/app-store'

interface Props { }
const props = withDefaults(defineProps<Props>(), {})

const appStore = useAppStore()

const appList = computed(() => appStore.appList.map((item) => {
  const { data } = item
  const style: CSSProperties = {
    translate: `${data.x}px ${data.y}px`,
  }

  return {
    id: item.id,
    component: item.data.component,
    style,
  }
}))
</script>

<style scoped lang="sass">
</style>
