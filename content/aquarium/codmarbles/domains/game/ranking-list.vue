<template>
  <div class="">
    <transition-group
      name="list"
      tag="div"
      class="flex md:justify-end md:flex-col gap-2 overflow-x-auto max-w-screen p-4 md:pr-20 max-md:pt-10 md:h-dvh"
    >
      <div
        v-for="(marble, index) in marbleList"
        :key="marble.mesh.name"
        class="cursor-pointer relative z-0"
        @click="handleFocusMarble(marble)"
      >
        <div
          class="text-yellow-500 text-xs bg-white duration-500!
            absolute  whitespace-nowrap shadow -z-1
            text-ellipsis overflow-hidden py-1.5 px-4
            md:-mx-2 max-md:-my-1
            rounded-full
            right-1/2 top-1/2 -translate-y-1/2 translate-x-1/2
            opacity-0
            transform
          "
          :class="marble.finishedAt > 0 && recordVisible
            ? 'md:right-0 md:translate-x-full max-md:top-0 max-md:-translate-y-full opacity-100'
            : ''
            "
        >
          {{ (marble.finishedAt / 1000).toFixed(2) }}s
        </div>

        <div
          class=" absolute -top-1 -right-1 size-3 rounded-full border-2 border-white z-2 shadow-inner"
          :style="{ backgroundColor: marble.hexColor }"
        />

        <div
          class="flex rounded-lg transition-all duration-300 border-2 box-content cursor-pointer z-1 overflow-hidden relative"
          :class="marble.className"
        >
          <div class="text-xs text-gray-700 font-medium text-nowrap p-2 flex-1">
            {{ marble.name }}
          </div>

          <transition
            name="opacity"
            mode="out-in"
          >
            <div
              :key="index"
              class="font-mono font-bold translate-y-[70%] w-8 flex justify-end leading-0 text-yellow-700/30 text-[3rem]"
            >
              {{ index + 1 }}
            </div>
          </transition>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { pipe } from 'zod/v4';
import { useClientPlayer } from './use-client-player';
import { useHostPlayer } from './use-host-player';
import type { Marble } from '../../types'
import { computed } from 'vue'

interface Props {
  gameState: 'idle' | 'preparing' | 'playing' | 'over';
  startTime: number;
  rankingList: Marble[];
}
const props = withDefaults(defineProps<Props>(), {
  rankingList: () => [],
})

const clientPlayer = useClientPlayer()
const hostPlayer = useHostPlayer()
const focusedMarble = defineModel<Marble>('focusedMarble')

function handleFocusMarble(marble: Marble) {
  if (focusedMarble.value?.mesh.name === marble.mesh.name) {
    focusedMarble.value = undefined
    return
  }
  focusedMarble.value = marble
}

const validList = computed(() => props.rankingList.filter(({ mesh, index }) => {
  if (!clientPlayer.isPartyClient.value) {
    return mesh.isEnabled()
  }

  const player = hostPlayer.playerList.value.find((item) => item.index === index)
  return !!player
}))

const marbleList = computed(() => validList.value.map((marble) => {
  const className: string[] = []

  if (marble.finishedAt > 0 && recordVisible.value) {
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
    finishedAt: props.startTime > 0 ? marble.finishedAt - props.startTime : 0,
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
