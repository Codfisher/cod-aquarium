import type {
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  Material,
  Scene,
} from '@babylonjs/core'
import { Axis, Engine, MirrorTexture, StandardMaterial, Vector3 } from '@babylonjs/core'
import { clamp } from 'remeda'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { reportDiagnostic } from '../../composables/use-error-logger'
import { smoothRange } from '../weather/day-night'

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
 * 改用 blitFramebuffer 把畫布縮成 64×36 的小圖，再用像素緩衝區非同步讀回，
 * 在 CPU 上平均。小圖只有九千個位元組，量不出成本，也不會卡住管線。
 * 讀回不用柵欄，而是送出幾幀之後再讀：柵欄加上「同一塊緩衝區寫了又被寫」
 * 會讓 ANGLE 每次都吐一則效能警告（READ-usage buffer was written, then fenced,
 * but written again before being read back），晚幾幀讀就乾淨了
 *
 * 三，曝光是每材質各自綁定的 uniform，而改 exposure 屬性會通知所有材質重建
 * （見 use-day-night 的 applyToPipeline 那段註解，實測五毫秒）。
 * 自動曝光是每幀連續變動的值，絕對寫不得。
 * 這裡的做法是在影像處理設定「把 uniform 綁進著色器」的那一刻，
 * 把曝光乘上倍率再送——設定物件自己的屬性完全沒動，不會通知任何材質，是免費的。
 * 洞穴曝光加成也走同一條路（caveExposure），理由一樣：它每幀都在變。
 *
 * 四，天空與雲是 ShaderMaterial，沒有曝光與色調映射，不吃這個倍率。
 * 量測時把畫面分成兩類：視線射線高過地平線的畫素當天空，不除以曝光；
 * 其餘當地景，照除。水面倒影的鏡面材質也不吃倍率（見 excludeMirrorMaterials）
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
   * 洞穴曝光加成，由日夜循環每幀寫入，1 為不動
   *
   * 與自動曝光做的是同一件事（暗處拉亮），疊在一起洞裡會被拉得太亮，
   * 所以自動曝光接手的程度越高，這一份就收得越多（見 engagement）。
   * 它放在這裡而不是寫進 exposure 屬性，是因為洞穴深度每幀都在變，
   * 寫屬性會每次通知全場材質失效
   */
  caveExposure: 1,
  /** 暗視覺偏藍的程度，0 為不偏、1 為滿 */
  purkinjeRatio: 0,
}

/** 縮圖的尺寸，兩千三百個取樣點對一張畫面的平均綽綽有餘 */
const METER_WIDTH = 64
const METER_HEIGHT = 36
/** 兩次量測相隔幾秒 */
const METER_INTERVAL_SECOND = 0.2
/**
 * 送出量測後至少隔幾幀、幾秒才讀回
 *
 * 沒有柵欄可以問「好了沒」，靠時間保證 GPU 已經寫完，讀的時候才不會停下來等。
 * 幀數擋住低幀率以外的情況、秒數擋住高幀率（一百四十四赫茲下三幀只有二十毫秒）
 */
const READBACK_DELAY_FRAME = 3
const READBACK_DELAY_SECOND = 0.03

/**
 * 射線仰角（y 分量）高過這個值的畫素當天空
 *
 * 比地平線略高一點，遠景的地形剛好壓在地平線上，不要被誤判成天空
 */
const SKY_RAY_ELEVATION = 0.03

/**
 * 自動曝光接手與交還的時間常數（秒）
 *
 * 開關切換與第一筆量測出來的那一刻，倍率與洞穴加成不能一刀換手，
 * 兩邊用同一個權重交叉淡化，總亮度才不會跳
 */
const ENGAGE_SECOND = 0.5

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

/**
 * ACES 近似曲線的反函數（Narkowicz 版本）
 *
 * Babylon 用的是 Stephen Hill 的擬合，與這一版在中間調相差不到一成，
 * 夠用了：這裡只是要把「顯示出來的亮度」大致推回「場景有多亮」，
 * 基準值是在同一套估法下實測的，系統性的偏差會被它吃掉
 */
function inverseAcesLuminance(displayLuminance: number): number {
  const clamped = clamp(displayLuminance, { min: 0, max: MAX_DISPLAY_LUMINANCE })
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
 * 把倍率接進影像處理設定
 *
 * 影像處理設定在每一份材質綁定時把 exposure 當 uniform 送進著色器。
 * 這裡在原本的綁定做完之後，再用「曝光乘上倍率」覆蓋同一個 uniform——
 * 設定物件自己的 exposure 屬性完全沒動，所以不會通知任何材質重建。
 *
 * 同時蓋掉 prepareDefines，讓 EXPOSURE 這個旗標只要影像處理開著就恆為真。
 * Babylon 原本只在 exposure 不等於 1.0 時才開它：剛好等於 1.0 的那一刻，
 * 著色器裡沒有 exposureLinear 這個 uniform，倍率整個失效，
 * 而且 exposure 屬性每次跨過 1.0 都會讓全場材質重編一次
 *
 * 蓋在實例上而不是原型上：這份設定是這個場景的，不影響別的場景。
 * 回傳的函式把它們拆掉，刪掉實例上的屬性，呼叫就回到原型的版本
 */
function overrideExposureBinding(
  configuration: ImageProcessingConfiguration,
  getMultiplier: () => number,
): () => void {
  const originalBind = configuration.bind.bind(configuration)
  const originalPrepareDefines = configuration.prepareDefines.bind(configuration)

  configuration.bind = (effect, overrideAspectRatio) => {
    originalBind(effect, overrideAspectRatio)
    effect.setFloat('exposureLinear', configuration.exposure * getMultiplier())
  }

  configuration.prepareDefines = (defines, forPostProcess) => {
    originalPrepareDefines(defines, forPostProcess)
    if (defines.IMAGEPROCESSING)
      defines.EXPOSURE = true
  }

  return () => {
    Reflect.deleteProperty(configuration, 'bind')
    Reflect.deleteProperty(configuration, 'prepareDefines')
  }
}

/**
 * 水面倒影的鏡面材質不吃倍率
 *
 * 倒影的內容是在鏡面貼圖裡畫的，那一趟用的就是場景的材質，
 * 倍率已經乘進去了；鏡面材質自己是再畫一次這張貼圖，
 * 倍率若再乘一次，倒影會比它映的東西亮上一整份倍率。
 *
 * 鏡面材質剛建立時還沒有倒影貼圖，要等第一次綁定才看得出來是不是，
 * 所以每份材質只掛一次性的觀察，確認不是就收掉，一般材質之後完全沒有成本。
 * 在綁定之後把 exposureLinear 改回原本的曝光
 */
function excludeMirrorMaterials(scene: Scene, configuration: ImageProcessingConfiguration): () => void {
  function watchMaterial(material: Material): void {
    if (!(material instanceof StandardMaterial))
      return

    material.onBindObservable.add(() => {
      if (!(material.reflectionTexture instanceof MirrorTexture))
        return

      material.onBindObservable.add(() => {
        material.getEffect()?.setFloat('exposureLinear', configuration.exposure)
      })
    }, undefined, undefined, undefined, true)
  }

  for (const material of scene.materials)
    watchMaterial(material)

  const observer = scene.onNewMaterialAddedObservable.add(watchMaterial)

  return () => {
    scene.onNewMaterialAddedObservable.remove(observer)
  }
}

/** 縮圖與非同步讀回用的 GL 物件，上下文丟失後要重建 */
interface MeterResource {
  framebuffer: WebGLFramebuffer;
  renderbuffer: WebGLRenderbuffer;
  pixelBuffer: WebGLBuffer;
}

/** 畫布有多重取樣時，先原尺寸解析到這裡再縮圖（理由見 requestMeter） */
interface ResolveResource {
  framebuffer: WebGLFramebuffer;
  renderbuffer: WebGLRenderbuffer;
  width: number;
  height: number;
}

/** 送出量測那一刻的視線，讀回時用來分辨哪些畫素是天空 */
interface MeterView {
  forwardY: number;
  rightY: number;
  upY: number;
  tanVertical: number;
  tanHorizontal: number;
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
  const meterView: MeterView = { forwardY: 0, rightY: 0, upY: 1, tanVertical: 1, tanHorizontal: 1 }
  const forwardVector = new Vector3()
  const rightVector = new Vector3()
  const upVector = new Vector3()
  let resource: MeterResource | null = null
  let resolveResource: ResolveResource | null = null
  /** 畫布的多重取樣是建立上下文時決定的，之後不會變 */
  const contextAttributes = gl.getContextAttributes()
  const isCanvasMultisampled = contextAttributes?.antialias === true
  /**
   * 解析的目的格式必須與畫布完全一致，不然一樣是 INVALID_OPERATION
   *
   * 畫布關了 alpha，背後是 RGB8；拿 RGBA8 去接會被拒絕（實測過）
   */
  const resolveFormat = contextAttributes?.alpha === false ? gl.RGB8 : gl.RGBA8
  /** 送出去還沒讀回的那份是第幾幀送的，沒有就是 null。同時最多只有一份在飛 */
  let pendingFrame: number | null = null
  let pendingSecond = 0
  let frameCount = 0
  /** 送出量測的那一刻，場景實際吃到的曝光，讀回時拿它把顯示亮度推回場景亮度 */
  let exposureAtRequest = 1
  let jitterIndex = 0
  let meterElapsed = METER_INTERVAL_SECOND
  let hasMeasurement = false
  let measuredLogLuminance = REFERENCE_LOG_LUMINANCE
  let adaptedLogLuminance = REFERENCE_LOG_LUMINANCE
  /** 自動曝光接手的程度，0 為沒接手、1 為完全接手 */
  let engagement = 0
  /** 洞穴加成收掉自動曝光接手的那一份之後的值 */
  let caveBias = 1
  let appliedShadowsDensity = 0
  let appliedShadowsSaturation = 0
  let debugElapsed = 0

  function getTotalBias(): number {
    return eyeAdaptationState.exposureBias * caveBias
  }

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

  /** 尺寸跟著畫布走，視窗縮放或換解析度時重建 */
  function prepareResolveResource(width: number, height: number): ResolveResource | null {
    if (resolveResource?.width === width && resolveResource.height === height)
      return resolveResource

    disposeResolveResource()
    const framebuffer = gl.createFramebuffer()
    const renderbuffer = gl.createRenderbuffer()
    if (!framebuffer || !renderbuffer)
      return null

    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer)
    gl.renderbufferStorage(gl.RENDERBUFFER, resolveFormat, width, height)
    gl.bindRenderbuffer(gl.RENDERBUFFER, null)

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    resolveResource = { framebuffer, renderbuffer, width, height }
    return resolveResource
  }

  function disposeResolveResource(): void {
    if (!resolveResource)
      return

    gl.deleteFramebuffer(resolveResource.framebuffer)
    gl.deleteRenderbuffer(resolveResource.renderbuffer)
    resolveResource = null
  }

  function disposeResource(): void {
    disposeResolveResource()
    pendingFrame = null
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
    resolveResource = null
    pendingFrame = null
  })

  const restoreBinding = overrideExposureBinding(configuration, getTotalBias)
  const restoreMirror = excludeMirrorMaterials(scene, configuration)

  /** 記下這一刻的鏡頭朝向，讀回時用它判斷每個畫素的射線是朝天還是朝地 */
  function captureMeterView(): void {
    const camera = scene.activeCamera
    if (!camera) {
      meterView.forwardY = 1
      meterView.rightY = 0
      meterView.upY = 0
      return
    }

    camera.getDirectionToRef(Axis.Z, forwardVector)
    camera.getDirectionToRef(Axis.X, rightVector)
    camera.getDirectionToRef(Axis.Y, upVector)
    meterView.forwardY = forwardVector.y
    meterView.rightY = rightVector.y
    meterView.upY = upVector.y
    /** 這個場景的鏡頭用預設的垂直視角，fov 指的是垂直方向 */
    meterView.tanVertical = Math.tan(camera.fov / 2)
    meterView.tanHorizontal = meterView.tanVertical * (gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight))
  }

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
   *
   * 畫布開了多重取樣時不能直接縮：WebGL2 規定來源是多重取樣的 blit
   * 來源與目的矩形必須一樣大，縮放會丟 INVALID_OPERATION，
   * 什麼都沒寫進小圖，自動曝光就安靜地停在舊值。
   * 所以先原尺寸解析到一張普通緩衝區，再從那張縮。
   * 多出的那次全畫面複製每 0.2 秒才一次，攤到每幀量不出來
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

    const isScissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
    if (isScissorEnabled)
      gl.disable(gl.SCISSOR_TEST)

    let sourceFramebuffer: WebGLFramebuffer | null = null
    if (isCanvasMultisampled) {
      const resolve = prepareResolveResource(sourceWidth, sourceHeight)
      if (resolve) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolve.framebuffer)
        gl.blitFramebuffer(
          0,
          0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          sourceWidth,
          sourceHeight,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        )
        sourceFramebuffer = resolve.framebuffer
      }
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceFramebuffer)
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
    if (isScissorEnabled)
      gl.enable(gl.SCISSOR_TEST)

    captureMeterView()
    pendingFrame = frameCount
    pendingSecond = 0
    exposureAtRequest = configuration.exposure * getTotalBias()
  }

  /**
   * 送出夠久了就把小圖讀回來，估出場景亮度
   *
   * 每個畫素：gamma 轉線性、取亮度、ACES 反函數、除以送出時的曝光，
   * 再取對數平均（幾何平均）——一小塊極亮的天空不會把整張圖的平均拉走，
   * 與相機測光的習慣一致。畫面中央權重高一些（視線通常落在那裡），邊角收到四成。
   *
   * 天空與雲是沒有曝光的 ShaderMaterial，它們的顯示值與曝光無關，
   * 所以天空畫素不除曝光。分辨的辦法是看射線：這個畫素的視線方向高過地平線，
   * 就當天空（洞頂與山壁偶爾會被誤判成天空，只是少除了一次倍率，影響限於那幾格）。
   * 不用深度圖，是因為畫布上只有顏色，深度要另外再讀回一次
   */
  function collectMeter(): void {
    if (pendingFrame === null || !resource)
      return
    if (frameCount - pendingFrame < READBACK_DELAY_FRAME || pendingSecond < READBACK_DELAY_SECOND)
      return

    pendingFrame = null

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, resource.pixelBuffer)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixelList)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)

    let logSum = 0
    let weightSum = 0
    for (let row = 0; row < METER_HEIGHT; row++) {
      /** 讀回的第零列是畫面最下面，所以往上為正 */
      const screenY = ((row + 0.5) / METER_HEIGHT) * 2 - 1
      const offsetY = (row + 0.5) / METER_HEIGHT - 0.5
      for (let column = 0; column < METER_WIDTH; column++) {
        const screenX = ((column + 0.5) / METER_WIDTH) * 2 - 1
        const offsetX = (column + 0.5) / METER_WIDTH - 0.5
        const weight = 1 - 0.6 * Math.min(1, (offsetX * offsetX + offsetY * offsetY) * 3)
        const index = (row * METER_WIDTH + column) * 4

        const rayX = screenX * meterView.tanHorizontal
        const rayY = screenY * meterView.tanVertical
        const rayElevation = (meterView.forwardY + rayX * meterView.rightY + rayY * meterView.upY)
          / Math.sqrt(1 + rayX * rayX + rayY * rayY)
        const isSky = rayElevation > SKY_RAY_ELEVATION

        const red = ((pixelList[index] ?? 0) / 255) ** DISPLAY_GAMMA
        const green = ((pixelList[index + 1] ?? 0) / 255) ** DISPLAY_GAMMA
        const blue = ((pixelList[index + 2] ?? 0) / 255) ** DISPLAY_GAMMA
        const displayLuminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        const sceneLuminance = Math.max(
          1 / 4096,
          inverseAcesLuminance(displayLuminance) / (isSky ? 1 : exposureAtRequest),
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

  /**
   * 自動曝光倍率與洞穴加成交叉淡化
   *
   * 兩者都是「暗處拉亮」，不能同時全開。接手程度 engagement 往目標靠，
   * 自動曝光的倍率乘上它（取對數域，檔數線性縮放）、洞穴加成用它淡出，
   * 開關切換或第一筆量測出來時，總曝光是平順過渡而不是跳一下
   */
  function updateBias(deltaTime: number, isEngaged: boolean, exposureStop: number): void {
    engagement += ((isEngaged ? 1 : 0) - engagement) * (1 - Math.exp(-deltaTime / ENGAGE_SECOND))
    eyeAdaptationState.exposureBias = 2 ** (exposureStop * engagement)
    caveBias = eyeAdaptationState.caveExposure + (1 - eyeAdaptationState.caveExposure) * engagement
  }

  const beforeObserver = scene.onBeforeRenderObservable.add(() => {
    const deltaTime = Math.min(0.1, engine.getDeltaTime() / 1000)
    const isExposureOn = devToggle.autoExposure
    const isPurkinjeOn = devToggle.purkinjeShift

    frameCount++
    pendingSecond += deltaTime

    if (!isExposureOn && !isPurkinjeOn) {
      updateBias(deltaTime, false, 0)
      eyeAdaptationState.purkinjeRatio = 0
      applyPurkinje(0)
      /**
       * 重新打開時要從當下量到的值開始，不拿關著那段時間的舊數字，
       * 送出去還沒讀回的那份也一起丟：它是關著之前拍的，讀回來就是舊畫面
       */
      hasMeasurement = false
      pendingFrame = null
      return
    }

    collectMeter()

    if (hasMeasurement) {
      const isBrighter = measuredLogLuminance > adaptedLogLuminance
      const timeConstant = isBrighter ? ADAPT_SECOND_TO_BRIGHTER : ADAPT_SECOND_TO_DARKER
      adaptedLogLuminance += (measuredLogLuminance - adaptedLogLuminance) * (1 - Math.exp(-deltaTime / timeConstant))
    }

    const exposureStop = isExposureOn && hasMeasurement ? computeExposureStop(adaptedLogLuminance) : 0
    updateBias(deltaTime, isExposureOn && hasMeasurement, exposureStop)

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
    if (meterElapsed < METER_INTERVAL_SECOND || pendingFrame !== null)
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
      restoreMirror()
      disposeResource()
      eyeAdaptationState.exposureBias = 1
      eyeAdaptationState.caveExposure = 1
      eyeAdaptationState.purkinjeRatio = 0
    },
  }
}
