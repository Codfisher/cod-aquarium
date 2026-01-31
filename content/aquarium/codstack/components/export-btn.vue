<template>
  <u-modal title="Export">
    <u-tooltip
      text="Export scene"
      :content="{ side: 'right' }"
    >
      <u-button
        icon="i-material-symbols:download-2-rounded"
        color="neutral"
        variant="subtle"
        size="xl"
      />
    </u-tooltip>

    <template #body>
      <div class="">
        安安
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import type { AbstractMesh } from '@babylonjs/core'
import { useMainStore } from '../stores/main-store'

interface Props {
  meshList?: AbstractMesh[];
}
const props = withDefaults(defineProps<Props>(), {})

const mainStore = useMainStore()
</script>

<style scoped lang="sass">
</style>
