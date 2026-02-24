import type { Soundscape } from '../type'

// --- 播放器實作 ---
export class SoundscapePlayer {
  private soundscape: Soundscape

  // 追蹤所有正在播放的 audio 元素，方便 destroy 時統一處理漸出
  private activeAudios: Set<HTMLAudioElement> = new Set()

  /** 記錄每個 audio 的基礎音量，用來搭配 globalVolume 做等比縮放 */
  private baseVolumeMap: Map<HTMLAudioElement, number> = new Map()

  /** 主控音量 (0~1)，作為所有音效基礎音量的乘數 */
  private globalVolume: number = 1
  private isMuted: boolean = false

  // 記錄目前的計時器，方便隨時中斷
  private timeoutIds: Set<ReturnType<typeof setTimeout>> = new Set()

  private isDestroying: boolean = false

  // Loop 模式下，提早交疊的秒數
  private readonly OVERLAP_SECONDS = 4

  constructor(soundscape: Soundscape) {
    if (!soundscape.soundList || soundscape.soundList.length === 0) {
      throw new Error('SoundList 不能為空')
    }
    this.soundscape = soundscape
  }

  /** 啟動播放器 */
  public play() {
    this.isDestroying = false
    if (this.soundscape.mode === 'loop') {
      this.playLoop()
    }
    else {
      this.playInterval()
    }
  }

  /** 註冊 audio 並套用 globalVolume */
  private registerAudio(audio: HTMLAudioElement, baseVolume: number) {
    audio.volume = baseVolume * this.globalVolume
    audio.muted = this.isMuted
    this.activeAudios.add(audio)
    this.baseVolumeMap.set(audio, baseVolume)
  }

  /** 移除 audio 追蹤 */
  private unregisterAudio(audio: HTMLAudioElement) {
    this.activeAudios.delete(audio)
    this.baseVolumeMap.delete(audio)
  }

  /**
   * Loop 模式：雙軌交疊播放第一個聲音
   */
  private playLoop() {
    const soundData = this.soundscape.soundList[0]
    if (!soundData)
      return
    const baseVolume = soundData.volume ?? 1

    // 建立雙音軌
    const audioA = new Audio(soundData.src)
    audioA.loop = true
    const audioB = new Audio(soundData.src)
    audioB.loop = true

    this.registerAudio(audioA, baseVolume)
    this.registerAudio(audioB, baseVolume)

    let useAudioA = true

    const scheduleNext = (currentAudio: HTMLAudioElement) => {
      if (this.isDestroying)
        return

      currentAudio.currentTime = 0
      currentAudio.play().catch((e) => console.warn(`[${this.soundscape.type}] 播放被阻擋:`, e))

      // 取得音檔總長度來計算交疊時間點
      const setupOverlap = () => {
        // 確保交疊時間不會大於音檔本身長度的一半
        const overlap = Math.min(this.OVERLAP_SECONDS, currentAudio.duration * 0.4)
        const triggerTimeMs = (currentAudio.duration - overlap) * 1000

        const timer = setTimeout(() => {
          this.timeoutIds.delete(timer)
          useAudioA = !useAudioA
          const nextAudio = useAudioA ? audioA : audioB
          scheduleNext(nextAudio)
        }, triggerTimeMs)

        this.timeoutIds.add(timer)
      }

      if (currentAudio.readyState >= 1) {
        setupOverlap()
      }
      else {
        currentAudio.onloadedmetadata = () => {
          setupOverlap()
          currentAudio.onloadedmetadata = null // 清除監聯
        }
      }
    }

    // 啟動第一軌
    scheduleNext(audioA)
  }

  /**
   * Interval 模式：隨機播放一個聲音，結束後等待 5~10 秒再播下一個
   */
  private playInterval() {
    if (this.isDestroying)
      return

    const list = this.soundscape.soundList
    const randomSound = list[Math.floor(Math.random() * list.length)]
    if (!randomSound)
      return
    const baseVolume = randomSound.volume ?? 1

    const audio = new Audio(randomSound.src)
    this.registerAudio(audio, baseVolume)

    audio.onended = () => {
      this.unregisterAudio(audio)
      if (this.isDestroying)
        return

      // 隨機等待 5000ms ~ 10000ms (5~10秒)
      const waitTime = Math.random() * (10000 - 5000) + 5000

      const timer = setTimeout(() => {
        this.timeoutIds.delete(timer)
        this.playInterval() // 遞迴呼叫下一輪
      }, waitTime)

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
    const fadePromises = Array.from(this.activeAudios).map((audio) =>
      this.fadeOutAudio(audio, fadeOutDurationMs),
    )

    await Promise.all(fadePromises)

    // 3. 徹底清理回收資源
    this.activeAudios.forEach((audio) => {
      audio.pause()
      audio.removeAttribute('src')
      audio.onloadedmetadata = null
      audio.onended = null
    })
    this.activeAudios.clear()
    this.baseVolumeMap.clear()
  }

  /**
   * 單一 Audio 元素的漸出邏輯
   */
  private fadeOutAudio(audio: HTMLAudioElement, duration: number): Promise<void> {
    return new Promise((resolve) => {
      if (audio.paused || audio.volume === 0) {
        resolve()
        return
      }

      const steps = 20 // 將漸出分為 20 個刻度
      const stepTime = duration / steps
      const volumeStep = audio.volume / steps // 根據當前實際音量(可能是使用者設定的 volume)來決定每步要降多少

      const fadeInterval = setInterval(() => {
        if (audio.volume - volumeStep > 0) {
          audio.volume -= volumeStep
        }
        else {
          audio.volume = 0
          clearInterval(fadeInterval)
          resolve()
        }
      }, stepTime)
    })
  }

  /**
   * 設定主控音量，按比例縮放所有正在播放的音效。
   *
   * 最終音量 = baseVolume × globalVolume
   */
  public setGlobalVolume(value: number) {
    this.globalVolume = value
    for (const [audio, baseVolume] of this.baseVolumeMap) {
      audio.volume = baseVolume * this.globalVolume
    }
  }

  public muted() {
    this.isMuted = true
    for (const audio of this.activeAudios) {
      audio.muted = true
    }
  }

  public unmuted() {
    this.isMuted = false
    for (const audio of this.activeAudios) {
      audio.muted = false
    }
  }
}
