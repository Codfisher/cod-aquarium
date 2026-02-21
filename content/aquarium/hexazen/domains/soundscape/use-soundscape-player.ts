import { computed, watch } from "vue";
import { Block } from "../block/type";
import { calcTraitRegionList } from "../block/trait-region";
import { resolveSoundscape } from "./resolver";
import { SoundscapeType } from "./type";

const FADE_OUT_DURATION = 2000 

export function useSoundscapePlayer(
  blockMap: Map<string, Block>
) {

  const traitRegionList = computed(
    () => calcTraitRegionList(blockMap)
  )

  const soundscapeList = computed(
    () => resolveSoundscape(traitRegionList.value)
  )

  /** 目前正在播放的音效，key 為 SoundscapeType */
  const playingAudioMap = new Map<SoundscapeType, HTMLAudioElement>()


  function fadeOutAndStop(audio: HTMLAudioElement, duration: number) {
    const originalVolume = audio.volume
    const startTime = performance.now()

    function tick() {
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      audio.volume = originalVolume * (1 - progress)

      if (progress < 1) {
        requestAnimationFrame(tick)
      }
      else {
        audio.pause()
        audio.currentTime = 0
      }
    }

    requestAnimationFrame(tick)
  }

  watch(soundscapeList, (newList, oldList) => {
    const newTypeSet = new Set(newList.map(s => s.type))
    const oldTypeSet = new Set((oldList ?? []).map(s => s.type))

    // 淡出舊列表中有、新列表中沒有的音效
    for (const oldType of oldTypeSet) {
      if (!newTypeSet.has(oldType)) {
        const audio = playingAudioMap.get(oldType)
        if (audio) {
          fadeOutAndStop(audio, FADE_OUT_DURATION)
          playingAudioMap.delete(oldType)
        }
      }
    }

    // 播放新列表中有、舊列表中沒有的音效
    for (const scape of newList) {
      if (!oldTypeSet.has(scape.type)) {
        const sound = scape.soundList[0]
        if (!sound) continue

        const audio = new Audio(sound.src)
        audio.loop = true
        audio.volume = sound.volume ?? 1
        audio.play()
        playingAudioMap.set(scape.type, audio)
      }
    }
  })
}