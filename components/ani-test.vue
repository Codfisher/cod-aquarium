<template>
  <div class="w-[50vw] border rounded">
    <div class=" aspect-square relative">
      <div
        class="ball absolute bg-red-500"
        :style="ballStyle"
      />
    </div>

    <div
      class="p-4 cursor-pointer select-none bg-slate-50 text-center"
      @click="move()"
    >
      移動
    </div>
  </div>
</template>

<script setup lang="ts">
import { animate, createSpring } from 'animejs'
import { computed, reactive, ref, watch } from 'vue'

const index = ref(0)
const dataList = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
] as const
function move() {
  index.value = (index.value + 1) % dataList.length
}

const ballData = reactive({
  left: 0,
  top: 0,
})

const ballStyle = computed(() => ({
  left: `${ballData.left}%`,
  top: `${ballData.top}%`,
}))

watch(index, () => {
  const data = dataList[index.value] ?? [0, 0]

  animate(ballData, {
    left: data[0],
    top: data[1],
  })
})
</script>

<style scoped lang="sass">
.ball
  width: 20px
  height: 20px
  border-radius: 50%
</style>
