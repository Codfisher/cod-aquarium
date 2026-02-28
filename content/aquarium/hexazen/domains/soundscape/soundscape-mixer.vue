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

      <span class="text-sm text-gray-600 flex-1 capitalize ">
        {{ item.player.title }}
      </span>

      <u-slider
        :model-value="volumeMap[item.id] ?? 1"
        :min="0"
        :max="2"
        :step="0.01"
        :ui="{
          track: 'bg-gray-300',
          range: 'bg-gray-500',
          thumb: 'ring-gray-600 bg-white',
        }"
        class="flex-1"
        @update:model-value="(value: number | undefined) => handleVolumeChange(item.id, value ?? 1)"
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
  frog: 'i-fa7-solid:frog',
  beast: 'i-mingcute:cat-fill',
  river: 'i-material-symbols:water',
  building: 'i-solar:buildings-2-bold',
  ocean: 'i-lucide-lab:waves-birds',
  alpine: 'i-mynaui:mountain-snow-solid',
  rain: 'i-material-symbols:rainy',
  campfire: 'i-mingcute:campfire-fill',
}

/** 每個 player 的音量乘數，key 為 soundscape id，1.0 = 原始音量 */
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

    if (!(id in volumeMap)) {
      volumeMap[id] = 1
    }
  }
  playerList.value = list
})

function handleVolumeChange(id: number, multiplier: number) {
  volumeMap[id] = multiplier
  const player = props.playerMap.get(id)
  player?.setVolume(multiplier)
}
</script>

<style scoped lang="sass">
</style>
