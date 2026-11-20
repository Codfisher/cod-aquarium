<script lang="ts" setup>
import { useMounted } from '@vueuse/core'
import { computed, inject, ref, watchPostEffect } from 'vue'
import { useData } from '../composables/data'
import VPSwitch from './VPSwitch.vue'

const { isDark, theme } = useData()

const toggleAppearance = inject('toggle-appearance', () => {
  isDark.value = !isDark.value
})

const switchTitle = ref('')

/** 伺服器不知道使用者偏好，掛載前一律輸出 false，避免暗色模式下 hydration 不一致；開關外觀由 .dark class 決定，不受影響 */
const isMounted = useMounted()
const isChecked = computed(() => isMounted.value && isDark.value)

watchPostEffect(() => {
  switchTitle.value = isDark.value
    ? theme.value.lightModeSwitchTitle || 'Switch to light theme'
    : theme.value.darkModeSwitchTitle || 'Switch to dark theme'
})
</script>

<template>
  <VPSwitch
    :title="switchTitle"
    class="VPSwitchAppearance"
    :aria-checked="isChecked"
    @click="toggleAppearance"
  >
    <span class="vpi-sun sun" />
    <span class="vpi-moon moon" />
  </VPSwitch>
</template>

<style scoped>
.sun {
  opacity: 1;
}

.moon {
  opacity: 0;
}

.dark .sun {
  opacity: 0;
}

.dark .moon {
  opacity: 1;
}

.dark .VPSwitchAppearance :deep(.check) {
  /*rtl:ignore*/
  transform: translateX(18px);
}
</style>
