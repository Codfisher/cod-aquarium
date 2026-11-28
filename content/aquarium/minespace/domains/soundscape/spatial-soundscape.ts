import type { AudioEngineV2, StaticSound, StaticSoundBuffer } from '@babylonjs/core'
import type { ResolvedEmitter } from './sound-data'
import type { SoundPoint } from './sound-occlusion'
import type { AudibleSound, LocalizedText, Weather } from './type'
import { CreateSoundAsync, CreateSoundBufferAsync, Vector3 } from '@babylonjs/core'
import { getSoundUrl } from './sound-data'
import { measureSoundClarity } from './sound-occlusion'
import { measureIdUnit, measureTimeGate, measureWeatherGain, pickPlayVariation } from './sound-shaping'

/**
 * 進入 maxDistance 的幾倍就預先載入
 *
 * 載入與卸載門檻刻意錯開，玩家在邊界來回走動時才不會反覆載入
 */
const LOAD_MARGIN = 1.1
const UNLOAD_MARGIN = 1.4

/** 音量變化的過渡時間（秒），瞬間切換會有爆音 */
const OCCLUSION_RAMP_SECOND = 0.35

/**
 * 低於這個音量比例就整個卸載
 *
 * 日夜切換是靠音量交叉淡出的，淡到聽不見之後沒有必要繼續播——
 * 白天有一半的音源是啞的，全部留著只是白白佔著解碼與混音的資源
 */
const SILENT_UNLOAD_THRESHOLD = 0.02

interface ActiveEmitter {
  definition: ResolvedEmitter;
  sound: StaticSound;
  timerId?: ReturnType<typeof setTimeout>;
  /** 上一次套用的音量比例，沒變就不用再設定一次音量 */
  gainRatio: number;
  /**
   * 觸發時外面指定的位置，給了之後這顆音源就待在那裡，直到下一次觸發換地方
   *
   * 只有 trigger 音源會有：雷從這一次閃電的方位來、噴發從火口來
   */
  eventPosition?: SoundPosition;
}

/** 空間中的一個點 */
type SoundPosition = SoundPoint

/** 此刻的時刻與雨雪強弱，見 SpatialSoundscape 的 setEnvironment */
export interface SoundscapeEnvironment {
  /** 一天的時刻，0 為子夜、0.5 為正午 */
  timeOfDay: number;
  rainRatio: number;
  snowRatio: number;
}

/** 觸發一個音源時可以給的條件 */
export interface SoundTriggerOption {
  /** 這一次多大聲（乘在音源自己的音量上），不給就是滿的 */
  volume?: number;
  /** 這一次從哪裡響，不給就留在音源原本的位置 */
  position?: SoundPosition;
}

/** 此刻佔了多少聲部，開發時看負擔用 */
export interface SoundVoiceStat {
  /** 已載入（建了 Babylon 音源）的數量 */
  loadedCount: number;
  /** 其中正在出聲的數量：循環音載入就算，間歇音只算正在響的那幾顆 */
  playingCount: number;
}

/**
 * 讓每個音源有自己的起跑點
 *
 * 兩隻海鷗若從同一個角度起飛，會永遠疊在一起繞同一個圈。
 * 拿 id 的字元湊一個看起來隨機、但每次執行都一樣的相位——
 * 不能用亂數：音源會反覆載入卸載，每次回來都跳到新位置就成了瞬移。
 *
 * 用攪過的雜湊（measureIdUnit）：原本是乘三十一再取餘數，id 只差結尾編號的音源
 * （大場景一排七隻的鳥：blackbird-0、blackbird-1…）算出來的相位只差零點一度，
 * 整排鳥各繞各的錨點、卻是同一個節拍在動
 */
function measureIdPhase(id: string): number {
  return (measureIdUnit(id) + 1) * Math.PI
}

/**
 * 算出音源此刻在哪
 *
 * 不會動的就是它自己的座標。會動的則以那個座標為錨點，
 * 依軌跡繞著它跑——錨點本身仍然是「這個聲音屬於哪裡」，
 * 載入與卸載的判斷也還是照實際位置算，
 * 所以一隻飄遠的鳥會自己淡出，不必另外處理
 */
export function measureEmitterPosition(
  definition: ResolvedEmitter,
  elapsedSecond: number,
): SoundPosition {
  const { motion } = definition
  if (!motion)
    return { x: definition.x, y: definition.y, z: definition.z }

  const phase = measureIdPhase(definition.id)
  const turn = (elapsedSecond / motion.periodSecond) * Math.PI * 2 + phase

  if (motion.type === 'orbit') {
    return {
      x: definition.x + Math.cos(turn) * motion.radius,
      /** 一圈之內起伏兩次，盤旋才有上下的層次 */
      y: definition.y + Math.sin(turn * 2) * (motion.riseHeight ?? 0),
      z: definition.z + Math.sin(turn) * motion.radius,
    }
  }

  /**
   * 兩個軸用互質的頻率
   *
   * 比例取黃金比例的倒數，兩條正弦永遠對不回同一個相位，
   * 走出來的利薩茹曲線因此不會重複。
   * 若兩軸同頻，畫出來的只是一個歪掉的圓——那又變回繞圈了
   */
  const crossRatio = 0.618

  return {
    x: definition.x + Math.sin(turn) * motion.radius,
    y: definition.y + Math.sin(turn * 1.37) * (motion.riseHeight ?? 0),
    z: definition.z + Math.sin(turn * crossRatio + phase) * motion.radius,
  }
}

/**
 * 清單上一條的開關鍵
 *
 * 由名稱算，同名的音源共用一個鍵。開頭加上前綴，與舊版存在瀏覽器裡的音源 id 分得開
 */
export function getSoundMuteKey(title: LocalizedText): string {
  return `title:${title['zh-hant']}|${title.en}`
}

/**
 * 空間音景管理器
 *
 * 世界裡的音源有四十幾個，全部載入會吃掉大量記憶體，
 * 因此改成依玩家位置動態載入 / 卸載，
 * 每個音源都是 Babylon 的 Spatial Sound，音量與方位交給 Web Audio 的 PannerNode 處理。
 */
export class SpatialSoundscape {
  private bufferMap = new Map<string, Promise<StaticSoundBuffer>>()
  private activeMap = new Map<string, ActiveEmitter>()
  private loadingSet = new Set<string>()
  private audibleList: AudibleSound[] = []
  private isDisposed = false
  private weather: Weather = 'clear'
  /** 白晝的程度，0 為全暗、1 為大白天 */
  private dayRatio = 1
  /**
   * 被單獨關掉的音源
   *
   * 這與主音量是兩件事。整片音景是十八座箱庭疊出來的，
   * 有人只想聽風、有人受不了蟬——關掉一個音源不該連帶關掉別的。
   *
   * 裡面放的是開關鍵（getSoundMuteKey，同名一起關），
   * 也認舊版一顆一顆存下來的音源 id，之前關掉的不會被打開
   */
  private mutedIdSet = new Set<string>()
  /** 世界開始到現在幾秒，會動的音源靠它推 */
  private elapsedSecond = 0
  /** 一天的時刻，0 為子夜、0.5 為正午；拂曉、薄暮這類時段看它 */
  private timeOfDay = 0.5
  /** 此刻的雨勢與雪勢 0 ～ 1，音量跟著天氣強弱走的音源看它 */
  private rainRatio = 0
  private snowRatio = 0
  /** 量遮蔽時裝聽者位置用的，每次更新重複用同一個，不一路生垃圾 */
  private listenerPoint: SoundPosition = { x: 0, y: 0, z: 0 }

  constructor(
    private audioEngine: AudioEngineV2,
    private emitterList: ResolvedEmitter[],
    private worldState: Uint8Array,
  ) {}

  /** 切換天氣，下雨時鳥與蟲會安靜下來 */
  public setWeather(weather: Weather): void {
    this.weather = weather
  }

  /**
   * 此刻的時刻與雨雪強弱
   *
   * 與 setWeather 分開：那個是「在不在雨裡」的開關，鳥蟲靠它噤聲；
   * 這裡是連續的量，拂曉薄暮的時段與跟著雨勢起落的音量看它
   */
  public setEnvironment(environment: SoundscapeEnvironment): void {
    this.timeOfDay = environment.timeOfDay
    this.rainRatio = environment.rainRatio
    this.snowRatio = environment.snowRatio
  }

  /** 時段與天氣強弱合起來，這顆音源此刻該出幾成力 */
  private measureAmbientGate(definition: ResolvedEmitter): number {
    return measureTimeGate(definition.activeAt, this.dayRatio, this.timeOfDay)
      * measureWeatherGain(definition.weatherGain, this.rainRatio, this.snowRatio)
  }

  /**
   * 指定哪些音源被單獨關掉
   *
   * 關掉的音源照樣留在記憶體裡，只是音量歸零。
   * 卸載掉會省一點記憶體，但重新打開時得再等它載入一次——
   * 開關本來就該是即時的
   */
  public setMutedIdList(idList: readonly string[]): void {
    this.mutedIdSet = new Set(idList)
  }

  /** 目前聽得到的音源，同名併成一條，響度由大到小 */
  public getAudibleList(): AudibleSound[] {
    return this.audibleList
  }

  /** 這個場景裡掛在某個開關鍵底下的音源 id，打開時要連舊版存下來的 id 一起清掉 */
  public getEmitterIdList(muteKey: string): string[] {
    return this.emitterList
      .filter((definition) => getSoundMuteKey(definition.title) === muteKey)
      .map((definition) => definition.id)
  }

  private checkMuted(definition: ResolvedEmitter): boolean {
    return this.mutedIdSet.has(getSoundMuteKey(definition.title)) || this.mutedIdSet.has(definition.id)
  }

  /**
   * 觸發一個 trigger 模式的音源
   *
   * 玩家離得太遠時音源根本沒載入，這時什麼也不做——
   * 那正是想要的：聽不到的地方就不該有聲音。
   *
   * volume 每次都可以不一樣，遠方的雷本來就比頭頂的悶。
   * position 給了就先把音源搬過去再響：畫面上的事件（閃電、噴發、濺起來的熔岩）在哪裡，
   * 聲音就從哪裡來；音源會留在那裡，之後的遮蔽也照新位置算。
   * 音高每次隨機差一點（照音源的 variation），同一段雷聲才不會每一道都一樣
   */
  public trigger(id: string, option: SoundTriggerOption = {}): void {
    const active = this.activeMap.get(id)
    if (!active || active.definition.mode.type !== 'trigger')
      return

    const { volume, position } = option
    if (position) {
      active.eventPosition = { x: position.x, y: position.y, z: position.z }
      active.sound.spatial.position.set(position.x, position.y, position.z)
    }
    if (volume !== undefined) {
      active.sound.volume = volume * active.gainRatio
    }
    active.sound.pitch = pickPlayVariation(active.definition.variation, 'trigger', id, Math.random).pitchCent
    active.sound.play()
  }

  /** 已載入的音源數量 */
  public get activeCount(): number {
    return this.activeMap.size
  }

  /**
   * 此刻佔了多少聲部
   *
   * 每一顆載入的音源都是一條 HRTF 的空間聲部，雪原九十一顆、風露原八十二顆，
   * 要不要設上限得先知道實際同時有幾顆。開發時由 use-soundscape 定時印出來
   */
  public getVoiceStat(): SoundVoiceStat {
    let playingCount = 0
    for (const active of this.activeMap.values()) {
      playingCount += active.sound.activeInstancesCount
    }

    return { loadedCount: this.activeMap.size, playingCount }
  }

  /**
   * 依聽者位置更新音源的載入狀態
   *
   * 音量本身由 Web Audio 依距離自動計算，這裡只負責決定誰該存在。
   */
  public update(
    listenerX: number,
    listenerY: number,
    listenerZ: number,
    dayRatio = this.dayRatio,
    elapsedSecond = 0,
  ): void {
    if (this.isDisposed)
      return

    this.dayRatio = dayRatio
    this.elapsedSecond = elapsedSecond
    /** 以開關鍵併起來，同名的只留一條 */
    const audibleMap = new Map<string, AudibleSound>()

    for (const definition of this.emitterList) {
      /**
       * 躲雨的音源直接卸載，雨停了再回來
       *
       * 暴風雪一樣算。會躲雨的是鳥與蟲，而牠們在雪裡躲得比雨裡更徹底
       */
      if ((this.weather === 'rain' || this.weather === 'snow') && definition.silentInRain) {
        this.unload(definition.id)
        continue
      }

      /**
       * 只在某個時段的音源，過了那段時間就卸載
       *
       * 雨（雪）勢的係數一起乘進來，兩者走同一條淡入淡出的路
       */
      const ambientGate = this.measureAmbientGate(definition)
      if (ambientGate < SILENT_UNLOAD_THRESHOLD) {
        this.unload(definition.id)
        continue
      }

      /**
       * 一律照「此刻在哪」算
       *
       * 會動的音源若拿錨點算距離，飛到你頭上的海鷗會維持原本的音量，
       * 而載入與卸載的邊界也會歪掉
       */
      const position = this.activeMap.get(definition.id)?.eventPosition
        ?? measureEmitterPosition(definition, elapsedSecond)
      const distance = Math.hypot(
        listenerX - position.x,
        listenerY - position.y,
        listenerZ - position.z,
      )

      if (distance <= definition.maxDistance * LOAD_MARGIN) {
        void this.load(definition)
      }
      else if (distance > definition.maxDistance * UNLOAD_MARGIN) {
        this.unload(definition.id)
      }

      const active = this.activeMap.get(definition.id)
      if (!active)
        continue

      /**
       * 位置每次都要推給 Web Audio，否則聲音會留在載入時的那一點
       *
       * 直接改既有的向量而不是配一個新的：這段每四分之一秒
       * 對每個會動的音源跑一次，沒必要一路生垃圾出來
       */
      if (definition.motion) {
        active.sound.spatial.position.set(position.x, position.y, position.z)
      }

      const clarity = this.measureClarity(listenerX, listenerY, listenerZ, position, definition.canCarryOverEdge)
      const gainRatio = clarity * ambientGate
      const isMuted = this.checkMuted(definition)
      this.applyGain(active, isMuted ? 0 : gainRatio)

      /**
       * 響度照原本的算，不管有沒有被關掉
       *
       * 關掉之後若連清單上那一條也消失，就再也沒有地方可以把它打開了。
       * 這個值代表的是「它就在附近，只是被你關著」
       */
      const loudness = estimateLoudness(definition, distance) * gainRatio
      if (loudness <= 0.02)
        continue

      const muteKey = getSoundMuteKey(definition.title)
      const merged = audibleMap.get(muteKey)
      if (!merged) {
        audibleMap.set(muteKey, {
          id: muteKey,
          title: definition.title,
          zone: definition.zone,
          loudness,
          distance,
          isMuted,
        })
        continue
      }
      /** 同名的取最響、最近的；有一顆是關著的就整條算關著（舊版逐顆關過的 id 才會出現這種情形） */
      merged.loudness = Math.max(merged.loudness, loudness)
      merged.distance = Math.min(merged.distance, distance)
      merged.isMuted = merged.isMuted || isMuted
    }

    this.audibleList = [...audibleMap.values()].sort((a, b) => b.loudness - a.loudness)
  }

  /**
   * 量測聽者與音源之間隔了多少實心地形，回傳 0 ～ 1 的清晰度
   *
   * 只用距離判斷的話，站在山腹裡照樣聽得到頭頂那片森林的鳥叫，
   * 因為聲音直接穿過了整座山。
   * 這裡沿著兩點連線一路取樣，數中間卡了幾格岩石，
   * 隔得越厚聲音越悶，走進洞口的過程也就自然而然安靜下來
   */
  private measureClarity(
    listenerX: number,
    listenerY: number,
    listenerZ: number,
    position: SoundPosition,
    canCarryOverEdge = false,
  ): number {
    this.listenerPoint.x = listenerX
    this.listenerPoint.y = listenerY
    this.listenerPoint.z = listenerZ

    return measureSoundClarity(this.worldState, this.listenerPoint, position, canCarryOverEdge)
  }

  /**
   * 套用音量比例，差距夠大才重新設定，免得每次更新都在拉音量
   *
   * 比例是遮蔽與日夜兩個係數相乘：隔著山腹會悶掉，
   * 天亮了夜行的聲音也會跟著退場，兩者走同一條淡入淡出的路徑
   */
  private applyGain(active: ActiveEmitter, gainRatio: number): void {
    if (Math.abs(active.gainRatio - gainRatio) < 0.02)
      return

    active.gainRatio = gainRatio
    active.sound.setVolume(active.definition.volume * gainRatio, {
      duration: OCCLUSION_RAMP_SECOND,
    })
  }

  /** 主音量，0 ~ 1 */
  public setMasterVolume(volume: number, durationSecond = 0.4): void {
    this.audioEngine.setVolume(volume, { duration: durationSecond })
  }

  public dispose(): void {
    this.isDisposed = true
    for (const id of [...this.activeMap.keys()]) {
      this.unload(id)
    }
    this.bufferMap.clear()
    this.audibleList = []
  }

  /** 音檔以 buffer 為單位快取，同一個音檔的多個音源共用解碼結果 */
  private loadBuffer(sound: string): Promise<StaticSoundBuffer> {
    const cached = this.bufferMap.get(sound)
    if (cached)
      return cached

    const task = CreateSoundBufferAsync(getSoundUrl(sound), {}, this.audioEngine)
    this.bufferMap.set(sound, task)
    return task
  }

  private async load(definition: ResolvedEmitter): Promise<void> {
    if (this.activeMap.has(definition.id) || this.loadingSet.has(definition.id))
      return

    this.loadingSet.add(definition.id)

    try {
      const buffer = await this.loadBuffer(definition.sound)
      if (this.isDisposed)
        return

      const isLoop = definition.mode.type === 'loop'
      /**
       * 一開聲就照當下的日夜比例
       *
       * 用滿音量建立再等下一次更新去拉的話，
       * 破曉時剛載入的鳥會先整隻叫一聲才淡下去
       */
      const gainRatio = this.measureAmbientGate(definition)
      /** 循環音的音高在這裡定下來，之後不變；間歇音每次播放前再取（見 playOnce） */
      const pitchCent = pickPlayVariation(definition.variation, definition.mode.type, definition.id, Math.random).pitchCent
      /** 從它此刻該在的地方開聲，不是從錨點——會動的音源否則會先閃現一下 */
      const origin = measureEmitterPosition(definition, this.elapsedSecond)
      const sound = await CreateSoundAsync(
        definition.id,
        buffer,
        {
          loop: isLoop,
          volume: definition.volume * gainRatio,
          spatialEnabled: true,
          spatialDistanceModel: 'linear',
          spatialMinDistance: definition.minDistance,
          spatialMaxDistance: definition.maxDistance,
          spatialRolloffFactor: 1,
          spatialPanningModel: 'HRTF',
          spatialPosition: new Vector3(origin.x, origin.y, origin.z),
          pitch: pitchCent,
        },
        this.audioEngine,
      )

      if (this.isDisposed) {
        sound.dispose()
        return
      }

      const active: ActiveEmitter = { definition, sound, gainRatio }
      this.activeMap.set(definition.id, active)

      if (isLoop) {
        /** 循環音從隨機位置切入，多個相同音檔的音源才不會完全同步 */
        sound.play({ startOffset: Math.random() * sound.buffer.duration })
      }
      else {
        sound.onEndedObservable.add(() => this.scheduleNextPlay(active))
        this.scheduleNextPlay(active, true)
      }
    }
    catch (error) {
      console.warn(`[Soundscape] 載入 ${definition.id} 失敗:`, error)
    }
    finally {
      this.loadingSet.delete(definition.id)
    }
  }

  /** 安排下一次播放（間隔模式） */
  private scheduleNextPlay(active: ActiveEmitter, isFirstTime = false): void {
    if (this.isDisposed || !this.activeMap.has(active.definition.id))
      return
    if (active.definition.mode.type !== 'interval')
      return

    const [min, max] = active.definition.mode.rangeSecond
    /** 第一次縮短等待時間，走進範圍後不用乾等 */
    const waitSecond = isFirstTime
      ? Math.random() * 6
      : min + Math.random() * (max - min)

    clearTimeout(active.timerId)
    active.timerId = setTimeout(() => {
      if (this.isDisposed || !this.activeMap.has(active.definition.id))
        return
      this.playOnce(active)
    }, waitSecond * 1000)
  }

  /**
   * 播一次間歇音，音高與音量每次都差一點
   *
   * 音高寫在音源上（下一個播放實例建立時讀它），音量走這一次播放自己的增益，
   * 不碰音源的音量：那一條留給遮蔽與日夜的淡入淡出，兩邊各管各的不會互相蓋掉
   */
  private playOnce(active: ActiveEmitter): void {
    const { definition, sound } = active
    const variation = pickPlayVariation(definition.variation, definition.mode.type, definition.id, Math.random)

    sound.pitch = variation.pitchCent
    sound.play({ volume: variation.volumeRatio })
  }

  private unload(id: string): void {
    const active = this.activeMap.get(id)
    if (!active)
      return

    this.activeMap.delete(id)
    clearTimeout(active.timerId)
    active.sound.onEndedObservable.clear()
    active.sound.stop()
    active.sound.dispose()
  }
}

/**
 * 估算音源在該距離下的響度
 *
 * 與 Web Audio 的 linear distance model 同公式，
 * 純粹給 HUD 畫音量條用，不影響實際播放。
 */
export function estimateLoudness(
  definition: Pick<ResolvedEmitter, 'volume' | 'minDistance' | 'maxDistance'>,
  distance: number,
): number {
  if (distance >= definition.maxDistance)
    return 0
  if (distance <= definition.minDistance)
    return definition.volume

  const range = definition.maxDistance - definition.minDistance
  const attenuation = 1 - (distance - definition.minDistance) / range

  return definition.volume * Math.max(0, attenuation)
}
