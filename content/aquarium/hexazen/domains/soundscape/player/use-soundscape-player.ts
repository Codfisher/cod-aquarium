import type { Ref, ShallowReactive } from 'vue'
import type { Block } from '../../block/type'
import type { SoundscapeType } from '../type'
import { computed, watch } from 'vue'
import { resolveSoundscape } from '../resolver'
import { SoundscapePlayer } from './player'

export function useSoundscapePlayer(
  blockMap: ShallowReactive<Map<string, Block>>,
  options: {
    muted?: Ref<boolean>;
  } = {},
) {
  const muted = computed(() => options.muted?.value ?? true)

  const soundscapeList = computed(
    () => resolveSoundscape(blockMap),
  )

  /** 目前正在播放的音效，key 為 SoundscapeType */
  const activePlayerMap = new Map<SoundscapeType, SoundscapePlayer>()

  watch(soundscapeList, (newList, oldList) => {
    const newTypeSet = new Set(newList.map((s) => s.type))
    const oldTypeSet = new Set((oldList ?? []).map((s) => s.type))

    // 淡出舊列表中有、新列表中沒有的音效
    for (const oldType of oldTypeSet) {
      if (!newTypeSet.has(oldType)) {
        const player = activePlayerMap.get(oldType)
        if (player) {
          player.destroy()
          activePlayerMap.delete(oldType)
        }
      }
    }

    // 播放新列表中有、舊列表中沒有的音效
    for (const scape of newList) {
      if (!oldTypeSet.has(scape.type)) {
        const player = new SoundscapePlayer(scape)
        player.play()
        if (muted.value) {
          player.muted()
        }
        activePlayerMap.set(scape.type, player)
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
      }
    }
  })
}
