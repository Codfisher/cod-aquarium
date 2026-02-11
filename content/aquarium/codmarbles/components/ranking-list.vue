<template>
  <div class="">
    <transition-group
      name="list"
      tag="div"
      class="flex md:flex-col-reverse gap-2 max-md:gap-1 overflow-x-auto max-w-screen p-4 md:pr-20 max-md:pt-10"
    >
      <div
        v-for="(marble, index) in marbleList"
        :key="marble.mesh.name"
        class="cursor-pointer relative z-0"
        @click="handleFocusMarble(marble)"
      >
        <div
          class="text-yellow-500 text-xs bg-white duration-500
            absolute  whitespace-nowrap shadow -z-1
            text-ellipsis overflow-hidden py-1.5 px-4
            max-md:rounded-t
            md:rounded-r
            right-1/2 top-1/2 -translate-y-1/2 translate-x-1/2
            opacity-0
            transform
          "
          :class="marble.finishTime > 0 && recordVisible
            ? 'md:right-0 md:translate-x-full max-md:top-0 max-md:-translate-y-full opacity-100'
            : ''
          "
        >
          {{ (marble.finishTime / 1000).toFixed(2) }}s
        </div>

        <div
          class="flex items-center gap-1 p-2 rounded shadow-sm transition-all duration-300 border-2 cursor-pointer z-1 text-xs"
          :class="marble.className"
        >
          <div
            class="font-mono font-bold w-4 text-center transition-colors "
            :class="marble.finishTime > 0 ? 'text-yellow-700' : 'text-gray-500'"
          >
            {{ index + 1 }}
          </div>

          <div
            class="w-4 h-4 rounded-full border border-black/10 shadow-inner mr-1"
            :style="{ backgroundColor: marble.hexColor }"
          />

          <div class="text-xs text-gray-700 font-medium">
            #{{ marble.mesh.name.slice(-4) }}
          </div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import type { Marble } from '../types'
import { computed } from 'vue'

interface Props {
  gameState: 'idle' | 'preparing' | 'playing' | 'over';
  startTime: number;
  rankingList: Marble[];
}
const props = withDefaults(defineProps<Props>(), {
  rankingList: () => [],
})

const focusedMarble = defineModel<Marble>('focusedMarble')

function handleFocusMarble(marble: Marble) {
  if (focusedMarble.value?.mesh.name === marble.mesh.name) {
    focusedMarble.value = undefined
    return
  }
  focusedMarble.value = marble
}

const marbleList = computed(() => props.rankingList.map((marble) => {
  const className: string[] = []

  if (marble.finishTime > 0 && recordVisible.value) {
    className.push('bg-yellow-50 border-yellow-400 shadow-md')
  }
  else {
    className.push('bg-white border-transparent')
  }

  if (focusedMarble.value?.mesh.name === marble.mesh.name) {
    className.push('scale-105 ring-2 ring-red-500')
  }

  return {
    ...marble,
    finishTime: props.startTime > 0 ? marble.finishTime - props.startTime : 0,
    className,
  }
}))

const recordVisible = computed(() => props.gameState === 'over' || props.gameState === 'playing')
</script>

<style scoped lang="sass">
.list-move,
.list-enter-active,
.list-leave-active
  transition: all 0.5s cubic-bezier(0.800, 0.000, 0.000, 1.2)

.list-leave-active
  position: absolute

.list-enter-from,
.list-leave-to
  opacity: 0
  transform: translateX(-30px)
</style>
