<template>
  <div class="space-y-4 p-2">
    <div
      v-if="playerList.length === 0"
      class="text-center text-gray-400 py-4"
    >
      {{ t('noActiveSoundscapes') }}
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
        {{ t(item.player.title as any) }}
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
import { useSimpleI18n } from '../../composables/use-simple-i18n'

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

const { t } = useSimpleI18n({
  'zh-hant': {
    'noActiveSoundscapes': '目前沒有播放中的音景',
    'The Whisper of the Treetops': '樹梢的細語',
    'The Crackle of the Campfire': '營火的劈啪聲',
    'The Chorus of Crickets': '蟋蟀的合唱',
    'The Song of the Birds': '鳥兒的歌聲',
    'The Thrum of Frogs': '蛙鳴',
    'The Call of the Pika': '鼠兔的叫聲',
    'The Rush of the River': '河流的奔騰',
    'The Bustle of the Market': '市集的喧囂',
    'The Swell of the Ocean': '海洋的湧動',
    'The Crash of the Tide': '潮汐的拍打',
    'The Call of the Dolphins': '海豚的呼喚',
    'The Howl of the Alpine Wind': '高山的風嘯',
    'The Cry of the Snowcock': '雪雞的鳴叫',
    'The Rain on the Rooftop': '屋頂上的雨聲',
    'The Rain in the Meadow': '草地上的雨聲',
    'The Rain in the Forest': '森林中的雨聲',
    'The Rumble of Thunder': '雷聲隆隆',
  },
  'en': {
    'noActiveSoundscapes': 'No active soundscapes',
    'The Whisper of the Treetops': 'The Whisper of the Treetops',
    'The Crackle of the Campfire': 'The Crackle of the Campfire',
    'The Chorus of Crickets': 'The Chorus of Crickets',
    'The Song of the Birds': 'The Song of the Birds',
    'The Thrum of Frogs': 'The Thrum of Frogs',
    'The Call of the Pika': 'The Call of the Pika',
    'The Rush of the River': 'The Rush of the River',
    'The Bustle of the Market': 'The Bustle of the Market',
    'The Swell of the Ocean': 'The Swell of the Ocean',
    'The Crash of the Tide': 'The Crash of the Tide',
    'The Call of the Dolphins': 'The Call of the Dolphins',
    'The Howl of the Alpine Wind': 'The Howl of the Alpine Wind',
    'The Cry of the Snowcock': 'The Cry of the Snowcock',
    'The Rain on the Rooftop': 'The Rain on the Rooftop',
    'The Rain in the Meadow': 'The Rain in the Meadow',
    'The Rain in the Forest': 'The Rain in the Forest',
    'The Rumble of Thunder': 'The Rumble of Thunder',
  },
} as const)
</script>

<style scoped lang="sass">
</style>
