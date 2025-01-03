<template>
  <div class="">
    <canvas
      ref="canvasRef"
      class=" w-full h-full"
    />
  </div>
</template>

<script setup lang="ts">
import { useBabylonScene } from './use-babylon-scene'

const {
  canvasRef,
} = useBabylonScene({
  async init(param) {

  },
})
</script>
