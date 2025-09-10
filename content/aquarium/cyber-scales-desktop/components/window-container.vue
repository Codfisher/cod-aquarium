<template>
  <div class="window-container w-screen h-screen absolute top-0 left-0 pointer-events-none p-[6rem]">
    <div class="pointer-events-none absolute left-0 top-0 w-full h-full">
      <component
        :is="app.data.component"
        v-for="app in appStore.appList"
        :key="app.id"
        class=" "
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from '../stores/app-store'

interface Props {
  modelValue?: string;
}
const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})

const appStore = useAppStore()
</script>

<style scoped lang="sass">
</style>
