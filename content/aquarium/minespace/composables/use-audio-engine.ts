import type { AudioEngineV2, StaticSound } from '@babylonjs/core-v9'
import type { StepMaterial } from '../domains/block/block-constants'
import { CreateAudioEngineAsync, CreateSoundAsync } from '@babylonjs/core-v9'

let enginePromise: Promise<AudioEngineV2> | undefined

/**
 * 取得共用的 Babylon 音訊引擎
 *
 * 整個場景只會有一個 AudioContext，
 * 空間音景與腳步聲都掛在它底下，主音量才好一起控制。
 */
export function getAudioEngine(): Promise<AudioEngineV2> {
  if (!enginePromise) {
    enginePromise = CreateAudioEngineAsync({
      volume: 1,
      /** 解鎖提示改由專案自己的 UI 處理 */
      disableDefaultUI: true,
      resumeOnInteraction: true,
    })
  }

  return enginePromise
}

const STEP_SOUND_BASE = '/assets/minecraft/sounds/step'

/** 各材質的腳步聲數量 */
const STEP_SOUND_COUNT: Record<StepMaterial, number> = {
  grass: 6,
  stone: 6,
  wood: 6,
  gravel: 4,
  sand: 5,
  snow: 4,
  cloth: 4,
  coral: 6,
  wet_grass: 6,
}

/**
 * 腳步聲播放器
 *
 * 音檔很短，第一次踩到才載入並快取，
 * 每次播放隨機調整音高，避免聽起來像複製貼上。
 */
export function useStepSound() {
  const soundMap = new Map<string, StaticSound>()
  const loadingSet = new Set<string>()

  async function playStep(material: StepMaterial, volume = 0.35): Promise<void> {
    const index = Math.floor(Math.random() * STEP_SOUND_COUNT[material]) + 1
    const key = `${material}${index}`

    let sound = soundMap.get(key)

    if (!sound) {
      if (loadingSet.has(key))
        return

      loadingSet.add(key)
      try {
        const audioEngine = await getAudioEngine()
        sound = await CreateSoundAsync(
          `step-${key}`,
          `${STEP_SOUND_BASE}/${key}.ogg`,
          { volume, maxInstances: 3 },
          audioEngine,
        )
        soundMap.set(key, sound)
      }
      catch (error) {
        console.warn('[StepSound] 載入失敗:', error)
        return
      }
      finally {
        loadingSet.delete(key)
      }
    }

    sound.volume = volume
    sound.playbackRate = 0.85 + Math.random() * 0.3
    sound.play()
  }

  function dispose(): void {
    for (const sound of soundMap.values()) {
      sound.dispose()
    }
    soundMap.clear()
  }

  return { playStep, dispose }
}
