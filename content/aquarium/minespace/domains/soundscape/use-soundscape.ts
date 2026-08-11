import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { AudibleSound, Weather } from './type'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { getAudioEngine } from '../../composables/use-audio-engine'
import { createEmitterList } from './sound-data'
import { SpatialSoundscape } from './spatial-soundscape'

/** 音源載入狀態的更新間隔（秒），不需要每幀重算 */
const UPDATE_INTERVAL = 0.25

interface StartParams {
  scene: Scene;
  camera: UniversalCamera;
  worldState: Uint8Array;
}

/**
 * 空間音景
 *
 * 把 Babylon 的空間音效包成 Vue 用得順手的樣子：
 * 聽者跟著攝影機走，音源依距離自動進出，
 * 並回報目前聽得到哪些聲音給 HUD 顯示。
 */
export function useSoundscape() {
  const audibleList = shallowRef<AudibleSound[]>([])
  const isReady = ref(false)
  const masterVolume = ref(0.8)
  const isMuted = ref(false)

  let soundscape: SpatialSoundscape | null = null
  let elapsed = 0
  let currentWeather: Weather = 'clear'

  watch([masterVolume, isMuted], () => {
    soundscape?.setMasterVolume(isMuted.value ? 0 : masterVolume.value)
  })

  /** 天氣會影響哪些音源該發聲，下雨時鳥與蟲會躲起來 */
  function setWeather(weather: Weather) {
    currentWeather = weather
    soundscape?.setWeather(weather)
  }

  /**
   * 啟動音景
   *
   * 必須在使用者互動後呼叫，瀏覽器才允許播放聲音。
   */
  async function start({ scene, camera, worldState }: StartParams): Promise<void> {
    if (soundscape)
      return

    const audioEngine = await getAudioEngine()
    await audioEngine.unlockAsync()

    /** 聽者跟著攝影機移動與轉向，聲音的方位感才會正確 */
    audioEngine.listener.attach(camera)

    soundscape = new SpatialSoundscape(audioEngine, createEmitterList(worldState), worldState)
    soundscape.setMasterVolume(isMuted.value ? 0 : masterVolume.value, 0.01)
    soundscape.setWeather(currentWeather)
    isReady.value = true

    scene.onBeforeRenderObservable.add(() => {
      if (!soundscape)
        return

      elapsed += scene.getEngine().getDeltaTime() / 1000
      if (elapsed < UPDATE_INTERVAL)
        return

      elapsed = 0
      soundscape.update(camera.position.x, camera.position.y, camera.position.z)
      audibleList.value = soundscape.getAudibleList()
    })
  }

  onBeforeUnmount(() => {
    soundscape?.dispose()
    soundscape = null
  })

  return {
    start,
    setWeather,
    audibleList,
    isReady,
    masterVolume,
    isMuted,
  }
}
