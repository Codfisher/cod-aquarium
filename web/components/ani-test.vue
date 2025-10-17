<template>
  <div class="w-[50vw] border rounded">
    <div class=" aspect-square relative">
      <motion.div
        class="ball absolute bg-red-500"
        :style="{ left, top }"
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
import { useMotionValue, useSpring, motion } from 'motion-v'
import { computed, reactive, ref, watch } from 'vue'

const index = ref(0)
const dataList = [
  [0, 0],
  [500, 0],
  [500, 500],
  [0, 500],
] as const
function move() {
  index.value = (index.value + 1) % dataList.length
}

const leftValue = useMotionValue(0)
const topValue = useMotionValue(0)
const left = useSpring(leftValue, { mass: 0.5 })
const top = useSpring(topValue, { mass: 0.5 })

watch(index, () => {
  const data = dataList[index.value] ?? [0, 0]
  console.log('🚀 ~ data:', data);

  leftValue.set(data[0])
  topValue.set(data[1])
})
</script>

<style scoped lang="sass">
.ball
  width: 20px
  height: 20px
  border-radius: 50%
</style>
