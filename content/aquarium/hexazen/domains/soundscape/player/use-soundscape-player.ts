import type { Ref, ShallowReactive } from 'vue'
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
  } = {},
) {
  const muted = computed(() => options.muted?.value ?? true)
  const volume = computed(() => options.volume?.value ?? 1)

  const traitRegionList = computed(() => calcTraitRegionList(blockMap))
  const soundscapeList = computed(() => resolveSoundscape(traitRegionList.value, blockMap))

  /** 目前正在播放的音效，key 為 SoundscapeType */
  const activePlayerMap = shallowReactive(new Map<number, SoundscapePlayer>())

  watch(soundscapeList, (newList, oldList) => {
    const newIdSet = new Set(newList.map(prop('id')))
    const oldIdSet = new Set((oldList ?? []).map(prop('id')))

    // 淡出舊列表中有、新列表中沒有的音效
    for (const oldId of oldIdSet) {
      if (!newIdSet.has(oldId)) {
        const player = activePlayerMap.get(oldId)
        if (player) {
          player.destroy()
          activePlayerMap.delete(oldId)
        }
      }
    }

    // 播放新列表中有、舊列表中沒有的音效
    for (const scape of newList) {
      if (!oldIdSet.has(scape.id)) {
        const player = new SoundscapePlayer(scape)
        console.log(`🚀 ~ player:`, player)
        player.setGlobalVolume(volume.value)
        player.play()
        if (muted.value) {
          player.muted()
        }
        activePlayerMap.set(scape.id, player)
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
      for (const [_, player] of activePlayerMap) {
        player.unmuted()
        // 重新播放，避免被瀏覽器阻擋
        player.play()
      }
    }
  })

  watch(volume, (newVolume) => {
    for (const [_, player] of activePlayerMap) {
      player.setGlobalVolume(newVolume)
    }
  })

  return {
    traitRegionList,
    soundscapeList,
    activePlayerMap,
  }
}
