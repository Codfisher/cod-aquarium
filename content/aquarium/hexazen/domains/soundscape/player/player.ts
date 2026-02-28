import type { Soundscape, SoundscapeType } from '../type'
import { sample } from 'remeda'

const DEFAULT_BASE_VOLUME = 0.5

/** 所有 SoundscapePlayer 共用同一個 AudioContext */
let sharedAudioContext: AudioContext | undefined
function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext()
  }
  return sharedAudioContext
}

interface AudioTrack {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  /** 控制單軌基礎音量 */
  trackGain: GainNode;
}

export class SoundscapePlayer {
  readonly soundscape: Soundscape
  private audioContext: AudioContext

  /** 混音器音量 GainNode，由 setVolume 控制 */
  private baseGainNode: GainNode
  /** 主控音量 GainNode，由 setGlobalVolume 控制 */
  private globalGainNode: GainNode
  /** 靜音用 GainNode */
  private muteGainNode: GainNode

  /** 追蹤所有正在播放的音軌 */
  private activeTracks: Set<AudioTrack> = new Set()

  /** 記錄目前的計時器，方便隨時中斷 */
  private timeoutIds: Set<ReturnType<typeof setTimeout>> = new Set()

  private isDestroying: boolean = false

  /** Loop 模式下，提早交疊的秒數 */
  private readonly OVERLAP_SECONDS = 4

  public get type(): SoundscapeType {
    return this.soundscape.type
  }

  public get title(): string {
    return this.soundscape.title
  }

  public get baseVolume(): number {
    return this.soundscape.soundList[0]?.volume ?? DEFAULT_BASE_VOLUME
  }

  constructor(soundscape: Soundscape) {
    if (!soundscape.soundList || soundscape.soundList.length === 0) {
      throw new Error('SoundList 不能為空')
    }
    this.soundscape = soundscape
    this.audioContext = getAudioContext()

    // 建立 GainNode 鏈：trackGain → baseGain → globalGain → muteGain → destination
    this.baseGainNode = this.audioContext.createGain()
    this.globalGainNode = this.audioContext.createGain()
    this.muteGainNode = this.audioContext.createGain()

    this.baseGainNode.connect(this.globalGainNode)
    this.globalGainNode.connect(this.muteGainNode)
    this.muteGainNode.connect(this.audioContext.destination)
  }

  /** 啟動播放器 */
  public play() {
    this.isDestroying = false

    // 確保 AudioContext 處於 running 狀態（瀏覽器可能 suspend）
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }

    if (this.soundscape.mode.value === 'loop') {
      this.playLoop()
    }
    else {
      this.playInterval()
    }
  }

  /** 建立音軌並連接到 GainNode 鏈 */
  private createTrack(audio: HTMLAudioElement, baseVolume: number): AudioTrack {
    const source = this.audioContext.createMediaElementSource(audio)
    const trackGain = this.audioContext.createGain()
    trackGain.gain.value = baseVolume

    source.connect(trackGain)
    trackGain.connect(this.baseGainNode)

    const track: AudioTrack = { audio, source, trackGain }
    this.activeTracks.add(track)
    return track
  }

  /** 移除音軌追蹤並斷開連接 */
  private removeTrack(track: AudioTrack) {
    track.trackGain.disconnect()
    track.source.disconnect()
    this.activeTracks.delete(track)
  }

  /**
   * Loop 模式：雙軌交疊播放第一個聲音
   */
  private playLoop() {
    const soundData = this.soundscape.soundList[0]
    if (!soundData)
      return
    const baseVolume = soundData.volume ?? DEFAULT_BASE_VOLUME

    // 建立雙音軌
    const audioA = new Audio(soundData.src)
    audioA.crossOrigin = 'anonymous'
    audioA.loop = true
    const audioB = new Audio(soundData.src)
    audioB.crossOrigin = 'anonymous'
    audioB.loop = true

    const trackA = this.createTrack(audioA, baseVolume)
    const trackB = this.createTrack(audioB, baseVolume)

    let useTrackA = true

    const scheduleNext = (track: AudioTrack) => {
      if (this.isDestroying)
        return

      track.audio.currentTime = 0
      track.audio.play().catch((e) => console.warn(`[${this.soundscape.type}] 播放被阻擋:`, e))

      // 取得音檔總長度來計算交疊時間點
      const setupOverlap = () => {
        // 確保交疊時間不會大於音檔本身長度的一半
        const overlap = Math.min(this.OVERLAP_SECONDS, track.audio.duration * 0.4)
        const triggerTimeMs = (track.audio.duration - overlap) * 1000

        const timer = setTimeout(() => {
          this.timeoutIds.delete(timer)
          useTrackA = !useTrackA
          const nextTrack = useTrackA ? trackA : trackB
          scheduleNext(nextTrack)
        }, triggerTimeMs)

        this.timeoutIds.add(timer)
      }

      if (track.audio.readyState >= 1) {
        setupOverlap()
      }
      else {
        track.audio.onloadedmetadata = () => {
          setupOverlap()
          track.audio.onloadedmetadata = null
        }
      }
    }

    // 啟動第一軌
    scheduleNext(trackA)
  }

  /**
   * Interval 模式：隨機播放一個聲音，結束後等待隨機秒數再播下一個
   */
  private playInterval() {
    if (this.isDestroying)
      return

    const [randomSound] = sample(this.soundscape.soundList, 1)
    if (!randomSound)
      return
    const baseVolume = randomSound.volume ?? DEFAULT_BASE_VOLUME

    const audio = new Audio(randomSound.src)
    audio.crossOrigin = 'anonymous'
    const track = this.createTrack(audio, baseVolume)

    audio.onended = () => {
      this.removeTrack(track)
      if (this.isDestroying)
        return

      const { mode } = this.soundscape
      const [min, max] = mode.value === 'interval' && mode.range
        ? [Math.min(...mode.range), Math.max(...mode.range)]
        : [5, 10]
      const waitSec = Math.random() * (max - min) + min

      const timer = setTimeout(() => {
        this.timeoutIds.delete(timer)
        this.playInterval()
      }, waitSec * 1000)

      this.timeoutIds.add(timer)
    }

    audio.play().catch((e) => {
      console.warn(`[${this.soundscape.type}] 播放被阻擋:`, e)
    })
  }

  /**
   * 銷毀播放器：觸發漸出效果，並在歸零後釋放所有資源
   */
  public async destroy(fadeOutDurationMs = 2000): Promise<void> {
    if (this.isDestroying)
      return
    this.isDestroying = true

    // 1. 清除所有等待中的計時器，阻止未來的播放排程
    this.timeoutIds.forEach((timer) => clearTimeout(timer))
    this.timeoutIds.clear()

    // 2. 對所有正在播放的音軌執行漸出
    const currentTime = this.audioContext.currentTime
    const fadeEndTime = currentTime + fadeOutDurationMs / 1000

    for (const track of this.activeTracks) {
      track.trackGain.gain.setValueAtTime(
        track.trackGain.gain.value,
        currentTime,
      )
      track.trackGain.gain.linearRampToValueAtTime(0, fadeEndTime)
    }

    // 等待漸出完成
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, fadeOutDurationMs)
      this.timeoutIds.add(timer)
    })

    // 3. 徹底清理回收資源
    for (const track of this.activeTracks) {
      track.audio.pause()
      track.audio.removeAttribute('src')
      track.audio.onloadedmetadata = null
      track.audio.onended = null
      track.trackGain.disconnect()
      track.source.disconnect()
    }
    this.activeTracks.clear()

    this.baseGainNode.disconnect()
    this.globalGainNode.disconnect()
    this.muteGainNode.disconnect()
  }

  /**
   * 設定混音器音量（baseGainNode）。
   *
   * 最終音量 = trackGain × baseGain × globalGain
   *
   * @param value - 1.0 為原始音量
   */
  public setVolume(value: number) {
    this.baseGainNode.gain.setValueAtTime(
      value,
      this.audioContext.currentTime,
    )
  }

  /**
   * 設定主控音量，可超過 1.0 來放大音量。
   *
   * 最終音量 = baseVolume × globalVolume
   */
  public setGlobalVolume(value: number) {
    this.globalGainNode.gain.setValueAtTime(
      value,
      this.audioContext.currentTime,
    )
  }

  public muted() {
    this.muteGainNode.gain.setValueAtTime(
      0,
      this.audioContext.currentTime,
    )
  }

  public unmuted() {
    this.muteGainNode.gain.setValueAtTime(
      1,
      this.audioContext.currentTime,
    )
  }
}
