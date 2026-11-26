import type { ParticleSystem } from '@babylonjs/core'
import { createSeededRandom } from '../../utils/noise'

/**
 * 落葉亂流用的噪音場，在 CPU 上算，不經過 GPU
 *
 * 原本用 Babylon 的 NoiseProceduralTexture 給粒子系統當亂流來源。
 * 粒子是在 CPU 上更新的，要讀噪音就得把貼圖讀回 CPU——
 * 粒子系統每一幀都呼叫 getContent()，而那是同步的 gl.readPixels：
 * CPU 得停下來等 GPU 把先前送出的整幀畫完才拿得到資料，
 * 等的這段時間 GPU 與 CPU 無法重疊，下一幀要等這一幀收尾才開始送。
 * 量到的代價是每幀約 9 毫秒（19 → 23 FPS，同一視角、關掉它前後各三輪），
 * 而 GPU 工序計時看不到它：同步讀回發生在算繪迴圈結束之後的微任務裡。
 *
 * 噪音場本身便宜得很：粒子只讀 R 通道，而且 Babylon 取樣時
 * 把座標映射到 [0.5, 1) 的範圍（_fetchR 的 abs(u) * 0.5 + 0.5），
 * 所以只有貼圖右上角四分之一用得到。在 CPU 上直接算那一塊就好。
 *
 * 公式照著 Babylon 的 noise 著色器：梯度噪音、每個格點的梯度向量隨時間轉動、
 * 四個倍頻、振幅按 persistence 的次方放大。隨機的格點梯度換成種子亂數產生，
 * 圖樣與原本不同，但統計性質一樣——落葉每片被推去哪邊本來就是亂數決定的
 */

/** 噪音場的邊長（像素），夠粒子在上面隨機取樣了 */
const FIELD_SIZE = 64
/** 用得到的那一塊從哪一格開始，見上面對 _fetchR 的說明 */
const SAMPLED_START = FIELD_SIZE / 2
const OCTAVE_COUNT = 4
/** 與原本的 NoiseProceduralTexture 設定相同：振幅逐倍頻放大 1.6 倍，所以場會大量飽和成 0 或 1 */
const PERSISTENCE = 1.6
const BRIGHTNESS = 0.5
/**
 * 每秒轉動的相位
 *
 * Babylon 是每個動畫比例單位（六十分之一秒）累加 animationSpeedFactor * 0.01，
 * 原本設的 0.35 換算下來是每秒約 0.21 弧度，約三十秒轉完一圈
 */
const TIME_SPEED = 0.21
/** 重算的間隔（秒），場一秒只轉 0.2 弧度，十分之一秒重算一次人眼分不出來 */
const REFRESH_INTERVAL = 0.1
/** 一次重算最多推進多久，分頁被擱置回來時不讓相位一口氣跳很遠 */
const MAX_ADVANCE = 0.25
/** 最高倍頻取樣到的格點數：頻率 2^(n-1) 的格子，加上最邊上那一格 */
const LATTICE_SIZE = 2 ** (OCTAVE_COUNT - 1) + 1

type ParticleNoiseTexture = NonNullable<ParticleSystem['noiseTexture']>

export interface LeafNoiseField {
  /**
   * 給 particleSystem.noiseTexture 用的物件
   *
   * 粒子系統只呼叫它的 getSize、getContent 與 dispose 三個方法，
   * 這裡就只實作這三個，不為了型別去建一張真的貼圖
   */
  texture: ParticleNoiseTexture;
}

export function createLeafNoiseField(): LeafNoiseField {
  const random = createSeededRandom('minespace-leaf-noise')
  const phaseXList = new Float32Array(LATTICE_SIZE * LATTICE_SIZE)
  const phaseYList = new Float32Array(LATTICE_SIZE * LATTICE_SIZE)
  for (let index = 0; index < phaseXList.length; index++) {
    phaseXList[index] = (-1 + 2 * random()) * Math.PI * 2
    phaseYList[index] = (-1 + 2 * random()) * Math.PI * 2
  }

  const gradientXList = new Float32Array(phaseXList.length)
  const gradientYList = new Float32Array(phaseXList.length)
  const pixelList = new Uint8Array(FIELD_SIZE * FIELD_SIZE * 4)

  /** 格點上的梯度向量：兩個分量各自是「固定相位加上時間」的正弦，與著色器的 hash22 同一招 */
  function updateGradient(phase: number): void {
    for (let index = 0; index < gradientXList.length; index++) {
      gradientXList[index] = Math.sin(phaseXList[index]! + phase)
      gradientYList[index] = Math.sin(phaseYList[index]! + phase)
    }
  }

  function dotGradient(latticeX: number, latticeY: number, offsetX: number, offsetY: number): number {
    const index = latticeY * LATTICE_SIZE + latticeX
    return gradientXList[index]! * offsetX + gradientYList[index]! * offsetY
  }

  function sampleGradientNoise(x: number, y: number): number {
    const cellX = Math.floor(x)
    const cellY = Math.floor(y)
    const fractionX = x - cellX
    const fractionY = y - cellY
    /** smoothstep 內插，與著色器相同 */
    const weightX = fractionX * fractionX * (3 - 2 * fractionX)
    const weightY = fractionY * fractionY * (3 - 2 * fractionY)

    const lowerX = dotGradient(cellX, cellY, fractionX, fractionY)
      + (dotGradient(cellX + 1, cellY, fractionX - 1, fractionY) - dotGradient(cellX, cellY, fractionX, fractionY)) * weightX
    const upperX = dotGradient(cellX, cellY + 1, fractionX, fractionY - 1)
      + (dotGradient(cellX + 1, cellY + 1, fractionX - 1, fractionY - 1) - dotGradient(cellX, cellY + 1, fractionX, fractionY - 1)) * weightX

    return lowerX + (upperX - lowerX) * weightY
  }

  function bake(phase: number): void {
    updateGradient(phase)

    for (let pixelY = SAMPLED_START; pixelY < FIELD_SIZE; pixelY++) {
      for (let pixelX = SAMPLED_START; pixelX < FIELD_SIZE; pixelX++) {
        const coordinateX = (pixelX + 0.5) / FIELD_SIZE
        const coordinateY = (pixelY + 0.5) / FIELD_SIZE

        let sum = 0
        for (let octave = 0; octave < OCTAVE_COUNT; octave++) {
          const frequency = 2 ** octave
          sum += sampleGradientNoise(coordinateX * frequency, coordinateY * frequency) * PERSISTENCE ** octave
        }

        const value = BRIGHTNESS + (1 - BRIGHTNESS) * sum
        pixelList[(pixelX + pixelY * FIELD_SIZE) * 4] = Math.round(Math.min(1, Math.max(0, value)) * 255)
      }
    }
  }

  let phase = 0
  let lastBakeSecond = -Infinity
  let hasBaked = false

  const noiseTexture = {
    getSize: () => ({ width: FIELD_SIZE, height: FIELD_SIZE }),
    /**
     * 粒子系統每幀呼叫一次，借這個時機決定要不要重算
     *
     * 不另外掛每幀的觀察者：沒有粒子在更新的時候，這個場也不必轉
     */
    getContent: () => {
      const nowSecond = performance.now() / 1000
      const elapsed = nowSecond - lastBakeSecond
      if (!hasBaked || elapsed >= REFRESH_INTERVAL) {
        phase += hasBaked ? Math.min(MAX_ADVANCE, elapsed) * TIME_SPEED : 0
        lastBakeSecond = nowSecond
        hasBaked = true
        bake(phase)
      }

      return Promise.resolve(pixelList)
    },
    dispose: () => {},
  }

  return { texture: noiseTexture as unknown as ParticleNoiseTexture }
}
