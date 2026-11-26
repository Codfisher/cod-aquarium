import type {
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  Scene,
} from '@babylonjs/core'
import { Engine } from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { reportDiagnostic } from '../../composables/use-error-logger'

/**
 * 眼睛的適應：自動曝光與暗視覺偏藍
 *
 * 兩件事吃同一個輸入，所以放在同一支檔案：畫面此刻有多亮。
 *
 * ── 這個場景的色調映射不在後製，在每一份材質的著色器裡 ──
 *
 * 後製管線沒開 HDR（hdr = false），Babylon 這時根本不把影像處理接成後製，
 * 而是讓每一份 StandardMaterial 在自己的著色器裡做曝光、ACES、色調曲線與打散。
 * 這件事有三個後果，決定了這支檔案的做法：
 *
 * 一，畫面進到畫布時已經是調過色的八位元顯示值，沒有「調色前的線性影像」可量。
 * 量到的是顯示亮度，所以要用目前的曝光與 ACES 的反函數估回場景亮度，
 * 不然曝光一動、量到的值跟著動，會變成自己追自己的尾巴。
 *
 * 二，沒有後製的輸入貼圖可以取樣，畫面直接畫在畫布上。
 * 改用 blitFramebuffer 把畫布縮成 64×36 的小圖，再用像素緩衝區加柵欄非同步讀回，
 * 在 CPU 上平均。小圖只有九千個位元組，量不出成本，也不會卡住管線。
 *
 * 三，曝光是每材質各自綁定的 uniform，而改 exposure 屬性會通知所有材質重建
 * （見 use-day-night 的 applyToPipeline 那段註解，實測五毫秒）。
 * 自動曝光是每幀連續變動的值，絕對寫不得。
 * 這裡的做法是在影像處理設定「把 uniform 綁進著色器」的那一刻，
 * 把曝光乘上倍率再送——設定物件自己的屬性完全沒動，不會通知任何材質，是免費的。
 *
 * 教科書的做法是「降到 1×1 的亮度圖、用回饋貼圖慢慢追」，在這裡放不下：
 * 回饋貼圖的值要能被材質著色器讀到，得為每一份材質多一個取樣器；
 * 而量測與適應都只是純量運算，在 CPU 上做反而最省。
 * 讀回晚個幾幀沒有關係，適應本來就是以秒計的慢動作。
 *
 * ── 暗視覺偏藍（Purkinje shift）──
 *
 * 視網膜在暗處改由視桿細胞接手：看不到紅色、對藍綠最敏感，
 * 暗景因此往藍灰走。Photon 是在調色之前用視桿的光譜響應重算一次顏色；
 * 這裡借用色調曲線的「陰影」那一段——它本來就只作用在調色後偏暗的畫素上，
 * 與視桿只在暗處起作用的行為一致，而且寫進去是免費的（見 applyPurkinje）。
 * 日夜循環的色調分級已經把夜晚的整體色調調好了，
 * 這裡疊的是「這一刻真的有多暗」：洞裡、陰雨與黃昏都會有，
 * 不是只有深夜
 */

/**
 * 每一幀由眼睛適應寫入，其他系統讀取
 *
 * 與 aerial-perspective 的 airState 同一種寫法：模組層級、每條執行緒只有一份
 */
export const eyeAdaptationState = {
  /** 乘在日夜曝光上的倍率，1 為不動 */
  exposureBias: 1,
  /**
   * 自動曝光此刻是否在接手
   *
   * 日夜循環讀它來決定要不要保留舊的洞穴曝光加成——
   * 兩者做的是同一件事，疊在一起洞裡會被拉得太亮
   */
  isExposureActive: false,
  /** 暗視覺偏藍的程度，0 為不偏、1 為滿 */
  purkinjeRatio: 0,
}

/** 縮圖的尺寸，兩千三百個取樣點對一張畫面的平均綽綽有餘 */
const METER_WIDTH = 64
const METER_HEIGHT = 36
/** 兩次量測相隔幾秒 */
const METER_INTERVAL_SECOND = 0.2

/**
 * 晴天正午露天看出去的平均亮度（以二為底的對數，估回場景線性亮度後）
 *
 * 這是「曝光不必動」的那一點，由實測定出（見 development-notes）。
 * 實測值（出生點、平視）：上午 -2.5、正午 -2.2、午後 -2.1、日落 -3.9、
 * 暮色 -4.8、深夜 -7，洞裡 -4 ~ -5.3。基準取在正午抬頭看天的 -2.6 附近，
 * 正午各種視角都落在死區裡，倍率是一，調好的白沙那一套不會被動到
 */
const REFERENCE_LOG_LUMINANCE = -2.6

/**
 * 死區：與基準差幾檔以內不動
 *
 * 一路都在動的曝光讓人覺得畫面在呼吸。正午抬頭看天或低頭看沙，
 * 平均亮度實測會差到一檔半（天空是沒調過色的顯示值，比沙暗），那不是該被補償的事
 */
const DEAD_ZONE_STOP = 0.5

/**
 * 補償的強度
 *
 * 全補償（1）會把夜晚拉成白天。取半，暗了兩檔只補一檔：
 * 人眼適應之後暗處仍然「看起來暗」，只是看得清
 */
const COMPENSATION_STRENGTH = 0.5

/**
 * 最多提亮幾檔（洞裡、夜裡），對應舊的洞穴加成上限一點六倍
 *
 * 只往亮調、不往暗調。實測正午低頭看白沙比抬頭看天亮一檔半，
 * 往暗調的話，光是低下頭整片沙就灰了，調好的白沙那一套被動到。
 * 從洞裡走到洞外那一刻，倍率本來就是從一點六慢慢收回一，
 * 不需要壓到一以下才有「眼睛適應了亮」的感覺
 */
const MAX_BRIGHTEN_STOP = 0.6

/**
 * 適應的時間常數（秒）
 *
 * 眼睛亮適應快、暗適應慢：走出洞口幾乎一瞬間就適應了亮，
 * 走進洞裡要好幾秒才看得清。這兩個數字是遊戲手感，不是生理值（那要幾分鐘）
 */
const ADAPT_SECOND_TO_BRIGHTER = 1.1
const ADAPT_SECOND_TO_DARKER = 4

/**
 * 暗視覺偏藍開始與結束的亮度（以二為底的對數，指的是調過曝光之後的亮度）
 *
 * 比下限暗就滿檔，比上限亮就不偏
 */
const PURKINJE_FULL_LOG_LUMINANCE = -5.2
const PURKINJE_NONE_LOG_LUMINANCE = -3.2

/**
 * 暗視覺偏藍的色調曲線參數
 *
 * 色相 222 是偏青的藍（視桿對藍綠最敏感，不是純藍）。
 * 濃度與去飽和量都收得很小：日夜的色調分級已經在做同方向的事，
 * 這裡是疊加的，疊太多會變成一片藍濾鏡
 */
const PURKINJE_HUE = 222
const PURKINJE_DENSITY = 16
const PURKINJE_DESATURATION = 18

/** 寫進色調曲線的最小改動比例，低於它就不寫，每次寫入都會讓曲線重算一次 */
const PURKINJE_STEP = 0.01

/**
 * 畫布上的顯示值是 gamma 編碼的，量亮度要先轉回線性
 *
 * 用 2.2 的冪而不是分段的 sRGB 曲線：平均之後的誤差遠小於適應本身的死區
 */
const DISPLAY_GAMMA = 2.2

/** 顯示亮度高過這個值就不再往回推：ACES 的肩部在那裡已經壓扁，反函數會暴衝 */
const MAX_DISPLAY_LUMINANCE = 0.94

export interface EyeAdaptation {
  dispose: () => void;
}

function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))

  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * ACES 近似曲線的反函數（Narkowicz 版本）
 *
 * Babylon 用的是 Stephen Hill 的擬合，與這一版在中間調相差不到一成，
 * 夠用了：這裡只是要把「顯示出來的亮度」大致推回「場景有多亮」，
 * 基準值是在同一套估法下實測的，系統性的偏差會被它吃掉
 */
function inverseAcesLuminance(displayLuminance: number): number {
  const clamped = Math.min(MAX_DISPLAY_LUMINANCE, Math.max(0, displayLuminance))
  const quadratic = 2.43 * clamped - 2.51
  const linear = 0.59 * clamped - 0.03
  const constant = 0.14 * clamped
  const discriminant = Math.max(0, linear * linear - 4 * quadratic * constant)

  return (-linear - Math.sqrt(discriminant)) / (2 * quadratic)
}

/**
 * 依適應後的亮度算出曝光要補幾檔
 *
 * 用 tanh 把超出上限的部分收攏：
 * 硬夾的話，剛好撞到上限的那一刻曝光的變化率會突然歸零，看得出來一個折點
 */
function computeExposureStop(adaptedLogLuminance: number): number {
  const deficit = REFERENCE_LOG_LUMINANCE - adaptedLogLuminance
  const stop = Math.max(0, deficit - DEAD_ZONE_STOP) * COMPENSATION_STRENGTH

  return MAX_BRIGHTEN_STOP * Math.tanh(stop / MAX_BRIGHTEN_STOP)
}

/**
 * 把倍率接進影像處理設定的綁定
 *
 * 影像處理設定在每一份材質綁定時把 exposure 當 uniform 送進著色器。
 * 這裡在原本的綁定做完之後，再用「曝光乘上倍率」覆蓋同一個 uniform——
 * 設定物件自己的 exposure 屬性完全沒動，所以不會通知任何材質重建。
 *
 * 蓋在實例上而不是原型上：這份設定是這個場景的，不影響別的場景。
 * 回傳的函式把它拆掉，刪掉實例上的屬性，呼叫就回到原型的版本
 */
function overrideExposureBinding(configuration: ImageProcessingConfiguration): () => void {
  const originalBind = configuration.bind.bind(configuration)

  configuration.bind = (effect, overrideAspectRatio) => {
    originalBind(effect, overrideAspectRatio)
    effect.setFloat('exposureLinear', configuration.exposure * eyeAdaptationState.exposureBias)
  }

  return () => {
    Reflect.deleteProperty(configuration, 'bind')
  }
}

/** 縮圖與非同步讀回用的 GL 物件，上下文丟失後要重建 */
interface MeterResource {
  framebuffer: WebGLFramebuffer;
  renderbuffer: WebGLRenderbuffer;
  pixelBuffer: WebGLBuffer;
}

/**
 * 建立眼睛適應
 *
 * 在後製管線建好之後呼叫。兩個除錯開關都關著的時候量測整個不跑，
 * 倍率與偏藍程度都收回零
 */
export function createEyeAdaptation(scene: Scene, pipeline: DefaultRenderingPipeline): EyeAdaptation {
  const { state: devToggle } = useDevToggles()

  /** 縮圖與非同步讀回只有 Engine（WebGL2）做得到，別的引擎就不做這件事 */
  const sceneEngine = scene.getEngine()
  if (!(sceneEngine instanceof Engine)) {
    return { dispose: () => {} }
  }
  const engine: Engine = sceneEngine
  const gl = engine._gl
  const configuration = scene.imageProcessingConfiguration

  const pixelList = new Uint8Array(METER_WIDTH * METER_HEIGHT * 4)
  let resource: MeterResource | null = null
  /** 送出去還沒讀回的那份，同時最多只有一份在飛 */
  let pendingFence: WebGLSync | null = null
  /** 送出量測的那一刻的曝光，讀回時拿它把顯示亮度推回場景亮度 */
  let exposureAtRequest = 1
  let jitterIndex = 0
  let meterElapsed = METER_INTERVAL_SECOND
  let hasMeasurement = false
  let measuredLogLuminance = REFERENCE_LOG_LUMINANCE
  let adaptedLogLuminance = REFERENCE_LOG_LUMINANCE
  let appliedShadowsDensity = 0
  let appliedShadowsSaturation = 0
  let debugElapsed = 0

  function createResource(): MeterResource | null {
    const framebuffer = gl.createFramebuffer()
    const renderbuffer = gl.createRenderbuffer()
    const pixelBuffer = gl.createBuffer()
    if (!framebuffer || !renderbuffer || !pixelBuffer)
      return null

    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, METER_WIDTH, METER_HEIGHT)
    gl.bindRenderbuffer(gl.RENDERBUFFER, null)

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixelBuffer)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, pixelList.byteLength, gl.STREAM_READ)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)

    return { framebuffer, renderbuffer, pixelBuffer }
  }

  function disposeResource(): void {
    if (pendingFence) {
      gl.deleteSync(pendingFence)
      pendingFence = null
    }
    if (!resource)
      return

    gl.deleteFramebuffer(resource.framebuffer)
    gl.deleteRenderbuffer(resource.renderbuffer)
    gl.deleteBuffer(resource.pixelBuffer)
    resource = null
  }

  /**
   * 上下文丟失後，舊的 GL 物件全部作廢
   *
   * 不必去刪（刪的是已經不存在的東西），丟掉參照、下一次量測時重建
   */
  const contextLostObserver = engine.onContextLostObservable.add(() => {
    resource = null
    pendingFence = null
  })

  const restoreBinding = overrideExposureBinding(configuration)

  /**
   * 把這一幀的畫面縮成小圖，送出非同步讀回
   *
   * 掛在整個場景畫完之後：畫布上是這一幀完整的樣子，
   * 而且這一次的讀寫不會干擾任何還沒畫完的東西。
   *
   * 縮圖用 blit 的線性取樣，來源矩形每次偏移一點（黃金比例的低差異序列），
   * 連續幾次下來才覆蓋到取樣點之間的縫——不然草叢那種高頻的細節
   * 會讓固定的取樣點每次抽到同一批像素。
   *
   * blit 與剪裁測試有關：開著剪裁的話縮圖只會填到一個小角落，所以先關再還原
   */
  function requestMeter(): void {
    resource ??= createResource()
    if (!resource)
      return

    const sourceWidth = gl.drawingBufferWidth
    const sourceHeight = gl.drawingBufferHeight
    const cellWidth = Math.max(1, Math.floor(sourceWidth / METER_WIDTH))
    const cellHeight = Math.max(1, Math.floor(sourceHeight / METER_HEIGHT))

    jitterIndex++
    const offsetX = Math.floor(((jitterIndex * 0.7548776662) % 1) * cellWidth)
    const offsetY = Math.floor(((jitterIndex * 0.5698402909) % 1) * cellHeight)

    const wasScissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
    if (wasScissorEnabled)
      gl.disable(gl.SCISSOR_TEST)

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resource.framebuffer)
    gl.blitFramebuffer(
      offsetX,
      offsetY,
      offsetX + sourceWidth - cellWidth,
      offsetY + sourceHeight - cellHeight,
      0,
      0,
      METER_WIDTH,
      METER_HEIGHT,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR,
    )

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, resource.framebuffer)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, resource.pixelBuffer)
    gl.readPixels(0, 0, METER_WIDTH, METER_HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)

    /** 兩個綁定點一起還原成畫布，與 Babylon 快取的狀態一致 */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (wasScissorEnabled)
      gl.enable(gl.SCISSOR_TEST)

    pendingFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    exposureAtRequest = configuration.exposure * eyeAdaptationState.exposureBias
    gl.flush()
  }

  /**
   * 柵欄通過了就把小圖讀回來，估出場景亮度
   *
   * 每個畫素：gamma 轉線性、取亮度、ACES 反函數、除以送出時的曝光，
   * 再取對數平均（幾何平均）——一小塊極亮的天空不會把整張圖的平均拉走，
   * 與相機測光的習慣一致。畫面中央權重高一些（視線通常落在那裡），邊角收到四成
   */
  function collectMeter(): void {
    if (!pendingFence || !resource)
      return

    const status = gl.clientWaitSync(pendingFence, 0, 0)
    if (status === gl.TIMEOUT_EXPIRED)
      return

    gl.deleteSync(pendingFence)
    pendingFence = null
    if (status === gl.WAIT_FAILED)
      return

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, resource.pixelBuffer)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixelList)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)

    let logSum = 0
    let weightSum = 0
    for (let row = 0; row < METER_HEIGHT; row++) {
      const offsetY = (row + 0.5) / METER_HEIGHT - 0.5
      for (let column = 0; column < METER_WIDTH; column++) {
        const offsetX = (column + 0.5) / METER_WIDTH - 0.5
        const weight = 1 - 0.6 * Math.min(1, (offsetX * offsetX + offsetY * offsetY) * 3)
        const index = (row * METER_WIDTH + column) * 4

        const red = ((pixelList[index] ?? 0) / 255) ** DISPLAY_GAMMA
        const green = ((pixelList[index + 1] ?? 0) / 255) ** DISPLAY_GAMMA
        const blue = ((pixelList[index + 2] ?? 0) / 255) ** DISPLAY_GAMMA
        const displayLuminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        const sceneLuminance = Math.max(
          1 / 4096,
          inverseAcesLuminance(displayLuminance) / exposureAtRequest,
        )

        logSum += Math.log2(sceneLuminance) * weight
        weightSum += weight
      }
    }

    measuredLogLuminance = logSum / weightSum
    /** 第一筆量測直接當成適應後的值，不然開場會從基準慢慢爬到真實亮度 */
    if (!hasMeasurement) {
      hasMeasurement = true
      adaptedLogLuminance = measuredLogLuminance
    }
  }

  /**
   * 暗視覺偏藍寫進色調曲線的「陰影」那一段
   *
   * 色調曲線的三段（陰影、中間調、亮部）是依調色後的亮度加權混合的：
   * 暗的畫素吃陰影、亮的畫素吃亮部。日夜循環只用到「整體」那一組，
   * 陰影這一組是空的，剛好拿來放這件事。
   * 曲線的屬性只是設旗標，下一次綁定時才重算，沒有任何通知，
   * 與曝光那條路相反，這裡可以放心每幀寫（仍然用最小改動量擋掉無謂的重算）
   */
  function applyPurkinje(ratio: number): void {
    const colorCurves = pipeline.imageProcessing.colorCurves
    if (!colorCurves)
      return

    const density = PURKINJE_DENSITY * ratio
    const saturation = -PURKINJE_DESATURATION * ratio

    if (Math.abs(density - appliedShadowsDensity) < PURKINJE_STEP * PURKINJE_DENSITY
      && Math.abs(saturation - appliedShadowsSaturation) < PURKINJE_STEP * PURKINJE_DESATURATION) {
      return
    }

    appliedShadowsDensity = density
    appliedShadowsSaturation = saturation
    colorCurves.shadowsHue = PURKINJE_HUE
    colorCurves.shadowsDensity = density
    colorCurves.shadowsSaturation = saturation
  }

  const beforeObserver = scene.onBeforeRenderObservable.add(() => {
    const deltaTime = Math.min(0.1, engine.getDeltaTime() / 1000)
    const isExposureOn = devToggle.autoExposure
    const isPurkinjeOn = devToggle.purkinjeShift

    if (!isExposureOn && !isPurkinjeOn) {
      eyeAdaptationState.exposureBias = 1
      eyeAdaptationState.isExposureActive = false
      eyeAdaptationState.purkinjeRatio = 0
      applyPurkinje(0)
      /** 重新打開時要從當下量到的值開始，不拿關著那段時間的舊數字 */
      hasMeasurement = false
      return
    }

    collectMeter()

    if (hasMeasurement) {
      const isBrighter = measuredLogLuminance > adaptedLogLuminance
      const timeConstant = isBrighter ? ADAPT_SECOND_TO_BRIGHTER : ADAPT_SECOND_TO_DARKER
      adaptedLogLuminance += (measuredLogLuminance - adaptedLogLuminance) * (1 - Math.exp(-deltaTime / timeConstant))
    }

    const exposureStop = isExposureOn && hasMeasurement ? computeExposureStop(adaptedLogLuminance) : 0
    eyeAdaptationState.exposureBias = 2 ** exposureStop
    eyeAdaptationState.isExposureActive = isExposureOn && hasMeasurement

    /**
     * 偏藍看的是「調過曝光之後」的亮度
     *
     * 眼睛適應之後，同一片暗景看起來沒那麼暗，視桿也就沒那麼活躍。
     * 自動曝光把洞裡拉亮了，偏藍就該跟著收一點
     */
    const perceivedLogLuminance = adaptedLogLuminance + exposureStop
    eyeAdaptationState.purkinjeRatio = isPurkinjeOn && hasMeasurement
      ? 1 - smoothRange(perceivedLogLuminance, PURKINJE_FULL_LOG_LUMINANCE, PURKINJE_NONE_LOG_LUMINANCE)
      : 0
    applyPurkinje(eyeAdaptationState.purkinjeRatio)

    if (import.meta.env.DEV) {
      debugElapsed += deltaTime
      if (debugElapsed >= 0.5) {
        debugElapsed = 0
        reportDiagnostic(
          '眼睛適應',
          `量測 ${measuredLogLuminance.toFixed(2)}、適應 ${adaptedLogLuminance.toFixed(2)}`
          + ` → 曝光 ${eyeAdaptationState.exposureBias.toFixed(3)}、偏藍 ${eyeAdaptationState.purkinjeRatio.toFixed(2)}`,
        )
      }
    }
  })

  const afterObserver = scene.onAfterRenderObservable.add(() => {
    if (!devToggle.autoExposure && !devToggle.purkinjeShift)
      return

    meterElapsed += Math.min(0.1, engine.getDeltaTime() / 1000)
    if (meterElapsed < METER_INTERVAL_SECOND || pendingFence)
      return

    meterElapsed = 0
    requestMeter()
  })

  return {
    dispose: () => {
      scene.onBeforeRenderObservable.remove(beforeObserver)
      scene.onAfterRenderObservable.remove(afterObserver)
      engine.onContextLostObservable.remove(contextLostObserver)
      restoreBinding()
      disposeResource()
      eyeAdaptationState.exposureBias = 1
      eyeAdaptationState.isExposureActive = false
      eyeAdaptationState.purkinjeRatio = 0
    },
  }
}
