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

interface ActiveEmitter {
  definition: ResolvedEmitter;
  sound: StaticSound;
  timerId?: ReturnType<typeof setTimeout>;
  /** 上一次套用的遮蔽係數，沒變就不用再設定一次音量 */
  clarity: number;
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

  constructor(
    private audioEngine: AudioEngineV2,
    private emitterList: ResolvedEmitter[],
    private worldState: Uint8Array,
  ) {}

  /** 切換天氣，下雨時鳥與蟲會安靜下來 */
  public setWeather(weather: Weather): void {
    this.weather = weather
  }

  /** 目前聽得到的音源，響度由大到小 */
  public getAudibleList(): AudibleSound[] {
    return this.audibleList
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
  public update(listenerX: number, listenerY: number, listenerZ: number): void {
    if (this.isDisposed)
      return

    const audibleList: AudibleSound[] = []

    for (const definition of this.emitterList) {
      /** 躲雨的音源直接卸載，雨停了再回來 */
      if (this.weather === 'rain' && definition.silentInRain) {
        this.unload(definition.id)
        continue
      }

      const distance = Math.hypot(
        listenerX - definition.x,
        listenerY - definition.y,
        listenerZ - definition.z,
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

      const clarity = this.measureClarity(listenerX, listenerY, listenerZ, definition)
      this.applyClarity(active, clarity)

      const loudness = estimateLoudness(definition, distance) * clarity
      if (loudness > 0.02) {
        audibleList.push({
          id: definition.id,
          title: definition.title,
          zone: definition.zone,
          loudness,
          distance,
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
    definition: ResolvedEmitter,
  ): number {
    const deltaX = definition.x - listenerX
    const deltaY = definition.y - listenerY
    const deltaZ = definition.z - listenerZ
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

  /** 把清晰度換算成音量，差距夠大才重新設定，免得每次更新都在拉音量 */
  private applyClarity(active: ActiveEmitter, clarity: number): void {
    if (Math.abs(active.clarity - clarity) < 0.02)
      return

    active.clarity = clarity
    active.sound.setVolume(active.definition.volume * clarity, {
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
      const sound = await CreateSoundAsync(
        definition.id,
        buffer,
        {
          loop: isLoop,
          volume: definition.volume,
          spatialEnabled: true,
          spatialDistanceModel: 'linear',
          spatialMinDistance: definition.minDistance,
          spatialMaxDistance: definition.maxDistance,
          spatialRolloffFactor: 1,
          spatialPanningModel: 'HRTF',
          spatialPosition: new Vector3(definition.x, definition.y, definition.z),
        },
        this.audioEngine,
      )

      if (this.isDisposed) {
        sound.dispose()
        return
      }

      const active: ActiveEmitter = { definition, sound, clarity: 1 }
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
