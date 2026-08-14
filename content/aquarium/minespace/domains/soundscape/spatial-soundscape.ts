import type { AudioEngineV2, StaticSound, StaticSoundBuffer } from '@babylonjs/core'
import type { ResolvedEmitter } from './sound-data'
import type { AudibleSound, Weather } from './type'
import { CreateSoundAsync, CreateSoundBufferAsync, Vector3 } from '@babylonjs/core'
import { BlockId, isPassableBlock } from '../block/block-constants'
import { readBlock } from '../player/collision'
import { getSoundUrl } from './sound-data'

/**
 * 進入 maxDistance 的幾倍就預先載入
 *
 * 載入與卸載門檻刻意錯開，玩家在邊界來回走動時才不會反覆載入
 */
const LOAD_MARGIN = 1.1
const UNLOAD_MARGIN = 1.4

/** 遮蔽取樣的間隔（格），太密只是白算 */
const OCCLUSION_SAMPLE_STEP = 0.8
/** 中間隔了幾格實心方塊就算完全被擋住 */
const OCCLUSION_FULL_THICKNESS = 7
/** 完全被擋住時還聽得到多少，留一點才不會像突然拔掉耳機 */
const OCCLUSION_FLOOR = 0.06
/** 音量變化的過渡時間（秒），瞬間切換會有爆音 */
const OCCLUSION_RAMP_SECOND = 0.35

/**
 * 擋不住聲音的方塊
 *
 * 樹葉、玻璃、柵欄雖然是實心方塊，卻不該讓森林的鳥叫整個消音；
 * 真正會把聲音悶掉的是岩層與土層
 */
const SOUND_TRANSPARENT_SET = new Set<BlockId>([
  BlockId.OAK_LEAVES,
  BlockId.PINE_LEAVES,
  BlockId.GLASS,
  BlockId.GLASS_PANE,
  BlockId.FENCE,
  BlockId.ICE,
])

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
}

/** 空間中的一個點 */
interface SoundPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * 讓每個音源有自己的起跑點
 *
 * 兩隻海鷗若從同一個角度起飛，會永遠疊在一起繞同一個圈。
 * 拿 id 的字元湊一個看起來隨機、但每次執行都一樣的相位——
 * 不能用亂數：音源會反覆載入卸載，每次回來都跳到新位置就成了瞬移
 */
function measureIdPhase(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) % 3600
  }

  return (hash / 3600) * Math.PI * 2
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
   * 這與主音量是兩件事。整片音景是十七座箱庭疊出來的，
   * 有人只想聽風、有人受不了蟬——關掉一個音源不該連帶關掉別的
   */
  private mutedIdSet = new Set<string>()
  /** 世界開始到現在幾秒，會動的音源靠它推 */
  private elapsedSecond = 0

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
   * 指定哪些音源被單獨關掉
   *
   * 關掉的音源照樣留在記憶體裡，只是音量歸零。
   * 卸載掉會省一點記憶體，但重新打開時得再等它載入一次——
   * 開關本來就該是即時的
   */
  public setMutedIdList(idList: readonly string[]): void {
    this.mutedIdSet = new Set(idList)
  }

  /** 目前聽得到的音源，響度由大到小 */
  public getAudibleList(): AudibleSound[] {
    return this.audibleList
  }

  /**
   * 觸發一個 trigger 模式的音源
   *
   * 玩家離得太遠時音源根本沒載入，這時什麼也不做——
   * 那正是想要的：聽不到的地方就不該有聲音。
   *
   * volume 每次都可以不一樣，遠方的雷本來就比頭頂的悶
   */
  public trigger(id: string, volume?: number): void {
    const active = this.activeMap.get(id)
    if (!active || active.definition.mode.type !== 'trigger')
      return

    if (volume !== undefined) {
      active.sound.volume = volume * active.gainRatio
    }
    active.sound.play()
  }

  /** 已載入的音源數量 */
  public get activeCount(): number {
    return this.activeMap.size
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
    const audibleList: AudibleSound[] = []

    for (const definition of this.emitterList) {
      /** 躲雨的音源直接卸載，雨停了再回來 */
      if (this.weather === 'rain' && definition.silentInRain) {
        this.unload(definition.id)
        continue
      }

      /** 只在白天或只在夜裡的音源，過了那段時間就卸載 */
      const timeGate = measureTimeGate(definition, dayRatio)
      if (timeGate < SILENT_UNLOAD_THRESHOLD) {
        this.unload(definition.id)
        continue
      }

      /**
       * 一律照「此刻在哪」算
       *
       * 會動的音源若拿錨點算距離，飛到你頭上的海鷗會維持原本的音量，
       * 而載入與卸載的邊界也會歪掉
       */
      const position = measureEmitterPosition(definition, elapsedSecond)
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

      const clarity = this.measureClarity(listenerX, listenerY, listenerZ, position)
      const gainRatio = clarity * timeGate
      const isMuted = this.mutedIdSet.has(definition.id)
      this.applyGain(active, isMuted ? 0 : gainRatio)

      /**
       * 響度照原本的算，不管有沒有被關掉
       *
       * 關掉之後若連清單上那一條也消失，就再也沒有地方可以把它打開了。
       * 這個值代表的是「它就在附近，只是被你關著」
       */
      const loudness = estimateLoudness(definition, distance) * gainRatio
      if (loudness > 0.02) {
        audibleList.push({
          id: definition.id,
          title: definition.title,
          zone: definition.zone,
          loudness,
          distance,
          isMuted,
        })
      }
    }

    this.audibleList = audibleList.sort((a, b) => b.loudness - a.loudness)
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
  ): number {
    const deltaX = position.x - listenerX
    const deltaY = position.y - listenerY
    const deltaZ = position.z - listenerZ
    const distance = Math.hypot(deltaX, deltaY, deltaZ)
    if (distance < 1)
      return 1

    const sampleCount = Math.min(64, Math.ceil(distance / OCCLUSION_SAMPLE_STEP))
    let blockedCount = 0

    for (let index = 1; index < sampleCount; index++) {
      const blend = index / sampleCount
      const blockId = readBlock(
        this.worldState,
        Math.floor(listenerX + deltaX * blend + 0.5),
        Math.floor(listenerY + deltaY * blend + 0.5),
        Math.floor(listenerZ + deltaZ * blend + 0.5),
      )

      if (!SOUND_TRANSPARENT_SET.has(blockId) && !isPassableBlock(blockId)) {
        blockedCount++
      }
    }

    /** 取樣間隔換算回格數，才不會因為取樣密度不同而改變手感 */
    const thickness = blockedCount * (distance / sampleCount)
    const occlusion = Math.min(1, thickness / OCCLUSION_FULL_THICKNESS)

    return 1 - occlusion * (1 - OCCLUSION_FLOOR)
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
      const gainRatio = measureTimeGate(definition, this.dayRatio)
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
      active.sound.play()
    }, waitSecond * 1000)
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
 * 依日夜取得音源該有的音量比例
 *
 * 沒有指定時段的音源整天都是滿的。
 * 指定了的話直接跟著白晝程度走：天亮到一半，蟬與蟋蟀就各出一半的力，
 * 那正是黎明時兩種聲音疊在一起的樣子——不是到點換班
 */
function measureTimeGate(
  definition: Pick<ResolvedEmitter, 'activeAt'>,
  dayRatio: number,
): number {
  if (!definition.activeAt)
    return 1

  return definition.activeAt === 'day' ? dayRatio : 1 - dayRatio
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
