import type { AudioEngineV2, StaticSound } from '@babylonjs/core'
import type { RealmId } from '../realm/realm-definition'
import type { RenderPoseMessage } from '../render-host/protocol'
import type { AudibleSound, Weather } from './type'
import { CreateSoundAsync } from '@babylonjs/core'
import { useIntervalFn, useStorage } from '@vueuse/core'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { getAudioEngine } from '../../composables/use-audio-engine'
import { createEmitterList, getSoundUrl } from './sound-data'
import { SpatialSoundscape } from './spatial-soundscape'

/** 音源載入狀態的更新間隔（秒），不需要每幀重算 */
const UPDATE_INTERVAL = 0.25

/** 轉場音效最大聲到多少，它是過門那一下的陪襯，不該蓋過到了之後的音景 */
const TRANSITION_SOUND_VOLUME = 0.55
/** 轉場音效淡出要幾秒，與霧散開的時間差不多 */
const TRANSITION_SOUND_FADE_SECOND = 2.4
/** 轉場音效最多響多久：換場景失敗時沒有 setWorld 來收，靠這個保底 */
const TRANSITION_SOUND_LIMIT_SECOND = 10

interface StartParams {
  /** 渲染端生成的世界，音源要貼著地面種、遮蔽要沿路取樣，都得讀它 */
  worldState: Uint8Array;
  /** 目前在哪一個場景，音源清單依場景挑 */
  realmId: RealmId;
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
 *
 * 音訊留在主執行緒，因為 worker 裡沒有 AudioContext。
 * 渲染端每隔一小段時間送來鏡頭的位置與朝向（pose 訊息），
 * 聽者與音源的載入、卸載都跟著它走，不再掛在場景的算繪迴圈上
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
  /**
   * 被單獨關掉的音源
   *
   * 整片音景是十七座箱庭疊出來的，走到中間會同時聽見四五種聲音。
   * 有人是為了聽風來的，那幾聲蟬就成了雜訊——
   * 讓他關掉那一個，其餘的照舊。
   *
   * 存的是開關鍵（同名的音源共用一個，見 getSoundMuteKey）；
   * 舊版存的是一顆一顆的音源 id，音景照樣認得。
   * 存成陣列而不是 Set：useStorage 要序列化成 JSON，Set 存不進去
   */
  const mutedSoundIdList = useStorage<string[]>('minespace-muted-sounds', [])

  let soundscape: SpatialSoundscape | null = null
  let audioEngine: AudioEngineV2 | null = null
  let getDayRatio: (() => number) | undefined
  /** 最近一次收到的鏡頭位姿，定時更新用它算 */
  let lastPose: RenderPoseMessage | null = null
  /** 上一次定時更新的時間（毫秒），拿來換算每次更新之間隔了幾秒 */
  let lastUpdateAt = 0
  /**
   * 從開始到現在總共過了幾秒
   *
   * 會移動的音源要的是一條不會斷的時間軸，不能每次更新就歸零，
   * 否則海鷗會每四分之一秒回到原地一次
   */
  let totalElapsedSecond = 0
  let currentWeather: Weather = 'clear'
  /** 正在響的轉場音效，見 playTransitionSound */
  let transitionSound: StaticSound | null = null
  let transitionTimerId: ReturnType<typeof setTimeout> | undefined

  watch([masterVolume, isMuted], () => {
    soundscape?.setMasterVolume(isMuted.value ? 0 : masterVolume.value)
  })

  watch(mutedSoundIdList, (idList) => {
    soundscape?.setMutedIdList(idList)
  }, { deep: true })

  /**
   * 開關清單上的一條
   *
   * 一條是同名的一整組音源（見 AudibleSound），按一下整組一起開關。
   * 淡入淡出交給音景那邊既有的音量斜坡，
   * 按下去不是「啪」一聲斷掉，而是那個聲音慢慢退出去。
   *
   * 打開時連舊版逐顆存下來的 id 一起清掉，不然那幾顆會繼續關著
   */
  function toggleSoundMute(muteKey: string): void {
    const legacyIdList = soundscape?.getEmitterIdList(muteKey) ?? []
    const relatedSet = new Set([muteKey, ...legacyIdList])
    const isMutedNow = mutedSoundIdList.value.some((id) => relatedSet.has(id))

    if (!isMutedNow) {
      mutedSoundIdList.value = [...mutedSoundIdList.value, muteKey]
      return
    }

    mutedSoundIdList.value = mutedSoundIdList.value.filter((id) => !relatedSet.has(id))
  }

  /** 天氣會影響哪些音源該發聲，下雨時鳥與蟲會躲起來 */
  function setWeather(weather: Weather) {
    currentWeather = weather
    soundscape?.setWeather(weather)
  }

  /**
   * 觸發一個 trigger 模式的音源
   *
   * 天氣系統的閃電靠它把聽雨亭那道雷叫出來。
   * 聲音本身種在 sound-data，天氣只負責決定什麼時候響
   */
  function triggerSound(id: string, volume?: number) {
    soundscape?.trigger(id, volume)
  }

  /**
   * 啟動音景
   *
   * 必須在使用者互動後呼叫，瀏覽器才允許播放聲音。
   */
  async function start({ worldState, realmId, getDayRatio: readDayRatio }: StartParams): Promise<void> {
    if (soundscape)
      return

    audioEngine = await getAudioEngine()
    await audioEngine.unlockAsync()

    getDayRatio = readDayRatio
    soundscape = createSoundscape(audioEngine, worldState, realmId)
    isReady.value = true
    applyListenerPose()
    resumeUpdate()
  }

  function createSoundscape(engine: AudioEngineV2, worldState: Uint8Array, realmId: RealmId): SpatialSoundscape {
    const next = new SpatialSoundscape(engine, createEmitterList(worldState, realmId), worldState)
    next.setMasterVolume(isMuted.value ? 0 : masterVolume.value, 0.01)
    next.setWeather(currentWeather)
    /** 上次關掉的那幾個要一開始就是關著的，不能先響一聲再收掉 */
    next.setMutedIdList(mutedSoundIdList.value)
    return next
  }

  /**
   * 換場景之後照新的地形重種音源
   *
   * 音源要貼著地面種、遮蔽要沿路讀方塊，舊的那一份對不上新的世界，只能整份重建。
   * 音源清單依場景挑（見 sound-data 的 createEmitterList）。
   * 還沒開始漫遊就不必理：開始時 start 會拿到當下的世界
   */
  function setWorld(worldState: Uint8Array, realmId: RealmId): void {
    if (!soundscape || !audioEngine)
      return

    soundscape.dispose()
    soundscape = createSoundscape(audioEngine, worldState, realmId)
    audibleList.value = []
    /** 新場景到了，霧正要散開，過門的那一陣聲音跟著退 */
    fadeOutTransitionSound()
  }

  /**
   * 轉場音效
   *
   * 霧湧上來的那一刻淡入，換好場景（setWorld）時淡出，不跟著任何位置（不是空間音源）。
   * 每次都新建一個、播完就丟：一趟旅程只響一次，沒有必要留著。
   * 換場景失敗時不會有 setWorld，靠保底的計時器收掉。
   * 音景還沒啟動（瀏覽器還不准出聲）就不響
   */
  async function playTransitionSound(sound: string, durationSecond: number): Promise<void> {
    if (!audioEngine)
      return

    fadeOutTransitionSound(0.3)
    try {
      const nextSound = await CreateSoundAsync(`transition-${sound}`, getSoundUrl(sound), {
        volume: 0,
        spatialEnabled: false,
      }, audioEngine)

      transitionSound = nextSound
      nextSound.play()
      nextSound.setVolume(TRANSITION_SOUND_VOLUME, { duration: durationSecond * 0.4 })
      transitionTimerId = setTimeout(() => fadeOutTransitionSound(), TRANSITION_SOUND_LIMIT_SECOND * 1000)
    }
    catch (error) {
      console.warn('[Soundscape] 轉場音效載入失敗:', error)
    }
  }

  /** 把轉場音效淡出並丟掉 */
  function fadeOutTransitionSound(fadeSecond = TRANSITION_SOUND_FADE_SECOND): void {
    clearTimeout(transitionTimerId)
    const fadingSound = transitionSound
    transitionSound = null
    if (!fadingSound)
      return

    fadingSound.setVolume(0, { duration: fadeSecond })
    setTimeout(() => {
      fadingSound.stop()
      fadingSound.dispose()
    }, fadeSecond * 1000 + 200)
  }

  /**
   * 收到鏡頭的位姿
   *
   * 聽者跟著攝影機移動與轉向，聲音的方位感才會正確。
   * 原本是 listener.attach(camera)，由引擎每幀去讀鏡頭的世界矩陣；
   * 鏡頭現在在 worker 裡，摸不到，改成直接寫聽者的位置與歐拉角
   * （鏡頭的朝向就是 x 俯仰、y 偏航，與聽者吃的旋轉是同一套）。
   * 人站著不動時渲染端不會送，這裡只負責聽者與記下最近的位姿
   */
  function updatePose(pose: RenderPoseMessage): void {
    /** 音訊還沒啟動時（開始漫遊之前）也要記著：人站著不動的話，之後不會再有新的位姿 */
    lastPose = pose
    applyListenerPose()
  }

  function applyListenerPose(): void {
    if (!audioEngine || !lastPose)
      return

    audioEngine.listener.position.set(lastPose.x, lastPose.y, lastPose.z)
    audioEngine.listener.rotation.set(lastPose.pitch, lastPose.yaw, 0)
  }

  /**
   * 音源的載入、卸載與音量，每四分之一秒看一次
   *
   * 這件事原本掛在鏡頭位姿的訊息上，位姿一來就順便算。
   * 現在人站著不動時渲染端不送位姿，但音景還得繼續更新——
   * 日夜在換、天氣在變、海鷗還在繞圈，這些都不靠人移動。
   * 所以改成自己的計時器，拿最近一次的位姿去算
   */
  const { pause: pauseUpdate, resume: resumeUpdate } = useIntervalFn(() => {
    if (!soundscape || !lastPose)
      return

    const now = performance.now()
    const deltaSecond = lastUpdateAt === 0 ? 0 : (now - lastUpdateAt) / 1000
    lastUpdateAt = now
    totalElapsedSecond += deltaSecond

    soundscape.update(
      lastPose.x,
      lastPose.y,
      lastPose.z,
      getDayRatio?.() ?? 1,
      totalElapsedSecond,
    )
    audibleList.value = soundscape.getAudibleList()
  }, UPDATE_INTERVAL * 1000, { immediate: false })

  onBeforeUnmount(() => {
    fadeOutTransitionSound(0)
    pauseUpdate()
    soundscape?.dispose()
    soundscape = null
  })

  return {
    start,
    setWorld,
    playTransitionSound,
    updatePose,
    setWeather,
    triggerSound,
    toggleSoundMute,
    audibleList,
    isReady,
    masterVolume,
    isMuted,
  }
}
