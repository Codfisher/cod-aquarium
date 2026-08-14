import type { AudioEngineV2 } from '@babylonjs/core'
import { CreateAudioEngineAsync } from '@babylonjs/core'

let enginePromise: Promise<AudioEngineV2> | undefined

/**
 * 取得共用的 Babylon 音訊引擎
 *
 * 整個場景只會有一個 AudioContext，
 * 空間音景掛在它底下，主音量才好一起控制。
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
