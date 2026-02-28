<template>
  <div class="space-y-4 p-2">
    <div
      v-if="playerList.length === 0"
      class="text-center text-gray-400 py-4"
    >
      No active soundscapes
    </div>

    <div
      v-for="item in playerList"
      :key="item.id"
      class="flex items-center gap-3"
    >
      <u-icon
        :name="soundscapeIconMap[item.type] ?? 'i-mingcute:music-2-fill'"
        class="text-xl text-gray-500 shrink-0"
      />

      <span class="text-sm text-gray-600 w-20 shrink-0 capitalize">
        {{ item.player.soundscape.title }}
      </span>

      <u-slider
        :model-value="volumeMap[item.id] ?? 3"
        :min="0"
        :max="10"
        :step="0.1"
        :ui="{
          track: 'bg-gray-300',
          range: 'bg-gray-500',
          thumb: 'ring-gray-600 bg-white',
        }"
        class="flex-1"
        @update:model-value="(value: number | undefined) => handleVolumeChange(item.id, value ?? 3)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ShallowReactive } from 'vue'
import type { SoundscapePlayer } from './player/player'
import type { SoundscapeType } from './type'
import { reactive, ref, watchEffect } from 'vue'

const props = defineProps<{
  playerMap: ShallowReactive<Map<number, SoundscapePlayer>>;
}>()

const soundscapeIconMap: Record<SoundscapeType, string> = {
  rustle: 'i-mingcute:leaf-fill',
  insect: 'i-mingcute:bug-fill',
  bird: 'i-material-symbols:raven',
  frog: 'i-mingcute:mushroom-fill',
  beast: 'i-mingcute:cat-fill',
  river: 'i-mingcute:water-fill',
  building: 'i-mingcute:building-4-fill',
  ocean: 'i-material-symbols:waves',
  alpine: 'i-mingcute:mountain-2-fill',
  rain: 'i-material-symbols:rainy',
  campfire: 'i-mingcute:fire-fill',
}

/** 每個 player 的個別音量，key 為 soundscape id */
const volumeMap = reactive<Record<number, number>>({})

interface PlayerListItem {
  id: number;
  type: SoundscapeType;
  player: SoundscapePlayer;
}

const playerList = ref<PlayerListItem[]>([])

watchEffect(() => {
  const list: PlayerListItem[] = []
  for (const [id, player] of props.playerMap) {
    list.push({ id, type: player.type, player })

    // 初始化音量（預設 3，與 globalVolume 一致）
    if (!(id in volumeMap)) {
      volumeMap[id] = 3
    }
  }
  playerList.value = list
})

function handleVolumeChange(id: number, value: number) {
  volumeMap[id] = value
  const player = props.playerMap.get(id)
  player?.setVolume(value)
}
</script>

<style scoped lang="sass">
</style>
