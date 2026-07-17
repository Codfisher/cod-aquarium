/** 挑戰小遊戲的輕量音效：以 WebAudio 合成短促音色，不載入任何音檔。
 *
 * 音量刻意壓低（點綴用），AudioContext 延遲到第一次播放（必為使用者手勢後）才建立，
 * 不會被瀏覽器自動播放政策擋下；任何失敗都靜默略過，音效永遠不影響遊戲流程。
 */

let audioContext: AudioContext | undefined

function getAudioContext(): AudioContext | undefined {
  try {
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }
    return audioContext
  }
  catch {
    return undefined
  }
}

interface ToneOptions {
  frequency: number;
  durationSeconds: number;
  type?: OscillatorType;
  volume?: number;
  /** 頻率滑落的目標（做出「叩」「咔」的下沉感） */
  slideToFrequency?: number;
}

function playTone({ frequency, durationSeconds, type = 'sine', volume = 0.035, slideToFrequency }: ToneOptions) {
  const context = getAudioContext()
  if (!context) {
    return
  }
  try {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, context.currentTime)
    if (slideToFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, slideToFrequency),
        context.currentTime + durationSeconds,
      )
    }
    gain.gain.setValueAtTime(volume, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationSeconds)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + durationSeconds)
  }
  catch {
    // 音效失敗直接忽略
  }
}

/** 打字機按鍵：短促的「嗒」 */
export function playKeyClickSound() {
  playTone({ frequency: 1900, durationSeconds: 0.045, type: 'square', volume: 0.018 })
  playTone({ frequency: 640, durationSeconds: 0.05, type: 'triangle', volume: 0.03, slideToFrequency: 320 })
}

/** 打錯字卡紙：低沉的「咚」 */
export function playJamSound() {
  playTone({ frequency: 220, durationSeconds: 0.16, type: 'sawtooth', volume: 0.025, slideToFrequency: 110 })
}

/** 完成一句換行：打字機的「叮」 */
export function playDingSound() {
  playTone({ frequency: 1568, durationSeconds: 0.45, type: 'sine', volume: 0.04 })
  playTone({ frequency: 3136, durationSeconds: 0.3, type: 'sine', volume: 0.015 })
}

/** 節拍器：低音量的「嗒」，幫玩家抓拍點 */
export function playMetronomeTickSound() {
  playTone({ frequency: 1100, durationSeconds: 0.035, type: 'square', volume: 0.012 })
}

/** 相機快門：清脆的「咔嚓」兩段 */
export function playShutterSound() {
  playTone({ frequency: 2400, durationSeconds: 0.03, type: 'square', volume: 0.02 })
  setTimeout(() => {
    playTone({ frequency: 1200, durationSeconds: 0.05, type: 'square', volume: 0.025, slideToFrequency: 500 })
  }, 55)
}

/** 對焦提示：細小的「嗶」 */
export function playFocusBeepSound() {
  playTone({ frequency: 2093, durationSeconds: 0.07, type: 'sine', volume: 0.02 })
}

/** 過關成功：上行三連音 */
export function playSuccessSound() {
  const noteList = [784, 988, 1319]
  noteList.forEach((frequency, index) => {
    setTimeout(() => {
      playTone({ frequency, durationSeconds: 0.22, type: 'triangle', volume: 0.035 })
    }, index * 110)
  })
}
