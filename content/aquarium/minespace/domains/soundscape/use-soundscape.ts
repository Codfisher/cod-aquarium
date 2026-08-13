import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { AudibleSound, Weather } from './type'
import { useStorage } from '@vueuse/core'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { getAudioEngine } from '../../composables/use-audio-engine'
import { measureSection } from '../../composables/use-performance-probe'
import { createEmitterList } from './sound-data'
import { SpatialSoundscape } from './spatial-soundscape'

/** 音源載入狀態的更新間隔（秒），不需要每幀重算 */
const UPDATE_INTERVAL = 0.25

interface StartParams {
  scene: Scene;
  camera: UniversalCamera;
  worldState: Uint8Array;
  /**
   * 目前的白晝程度，0 為全暗、1 為大白天
   *
   * 夜行的聲音靠它淡入、日行的靠它淡出。
   * 傳函數而不是傳值：這個數字每一幀都在變，
   * 走反應式的話會每幀觸發一次更新，而音景其實四分之一秒才需要看一次
   */
  getDayRatio?: () => number;
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
  /**
   * 音量與靜音記在瀏覽器裡
   *
   * 這是一個聽覺的作品，音量是使用者第一件會調的事。
   * 每次重新整理都要再調一次很煩，尤其是把它靜音之後——
   * 重載又整個播出來，在辦公室會嚇到人
   */
  const masterVolume = useStorage('minespace-volume', 0.8)
  const isMuted = useStorage('minespace-muted', false)

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
  async function start({ scene, camera, worldState, getDayRatio }: StartParams): Promise<void> {
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
      measureSection('音景', () => {
        if (!soundscape)
          return

        elapsed += scene.getEngine().getDeltaTime() / 1000
        if (elapsed < UPDATE_INTERVAL)
          return

        elapsed = 0
        soundscape.update(
          camera.position.x,
          camera.position.y,
          camera.position.z,
          getDayRatio?.() ?? 1,
        )
        audibleList.value = soundscape.getAudibleList()
      })
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
