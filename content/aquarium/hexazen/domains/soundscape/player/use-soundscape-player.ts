import type { Ref, ShallowReactive } from 'vue'
import type { Weather } from '../../../types'
import type { Block } from '../../block/type'
import type { SoundscapeType } from '../type'
import { reactiveComputed } from '@vueuse/core'
import { prop } from 'remeda'
import { computed, shallowReactive, watch } from 'vue'
import { calcTraitRegionList } from '../../block/trait-region'
import { resolveSoundscape } from '../resolver'
import { SoundscapePlayer } from './player'

export function useSoundscapePlayer(
  blockMap: ShallowReactive<Map<string, Block>>,
  options: {
    muted?: Ref<boolean>;
    volume?: Ref<number>;
    weather?: Ref<Weather | undefined>;
  } = {},
) {
  const muted = computed(() => options.muted?.value ?? true)
  const volume = computed(() => options.volume?.value ?? 1)
  const weather = computed(() => options.weather?.value)

  const traitRegionList = computed(() => calcTraitRegionList(blockMap))
  const soundscapeList = computed(() => resolveSoundscape({
    traitRegionList: traitRegionList.value,
    blockMap,
    weather: weather.value,
  }))

  /** 目前正在播放的音效，key 為 id */
  const activePlayerMap = shallowReactive(new Map<number, SoundscapePlayer>())

  watch(soundscapeList, (newList) => {
    const newIdSet = new Set(newList.map(prop('id')))

    // 讓原本有在播放但現在不在新列表中的音效靜音，但不刪除，保留其音量設定
    for (const [id, player] of activePlayerMap) {
      if (!newIdSet.has(id)) {
        player.muted()
      }
    }

    // 播放新列表中的音效
    for (const scape of newList) {
      if (!activePlayerMap.has(scape.id)) {
        const player = new SoundscapePlayer(scape)
        player.setGlobalVolume(volume.value)
        player.play()
        if (muted.value) {
          player.muted()
        }
        activePlayerMap.set(scape.id, player)
      }
      else {
        const player = activePlayerMap.get(scape.id)!
        if (!muted.value) {
          player.unmuted()
        }
        player.setGlobalVolume(volume.value)
      }
    }
  })

  watch(muted, (newMuted) => {
    if (newMuted) {
      for (const [_, player] of activePlayerMap) {
        player.muted()
      }
    }
    else {
      const activeIds = new Set(soundscapeList.value.map(prop('id')))
      for (const [id, player] of activePlayerMap) {
        if (activeIds.has(id)) {
          player.unmuted()
          // 重新播放，避免被瀏覽器阻擋
          player.play()
        }
      }
    }
  }, {
    immediate: true,
  })

  watch(volume, (newVolume) => {
    for (const [_, player] of activePlayerMap) {
      player.setGlobalVolume(newVolume)
    }
  }, {
    immediate: true,
  })

  return {
    traitRegionList,
    soundscapeList,
    activePlayerMap,
  }
}
