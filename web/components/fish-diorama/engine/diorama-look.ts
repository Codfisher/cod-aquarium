/** 箱庭視覺風格的後製管線：色調、抗鋸齒、環境遮蔽與移軸微縮。
 *
 * 這是整個魚缸世界「紙工藝低多邊」質感的配方所在。每個獨立遊戲場景建立後
 * 套用同一支函式，六個世界的色調與微縮景深就自動一致，不必逐一比對調參。
 */
import type { Camera } from '@babylonjs/core/Cameras/camera'
import type { Scene } from '@babylonjs/core/scene'
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves'
import { Effect } from '@babylonjs/core/Materials/effect'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline'
import { isCoarsePointerDevice } from '../shared/device-tier'
import {
  buildTiltShiftShaderSource,
  DEFAULT_TILT_SHIFT,
  getTiltShiftTapCount,
  type TiltShiftOptions,
} from './tilt-shift-shader'

export type { TiltShiftOptions }

export interface DioramaLookOptions {
  /** 管線名稱前綴，多場景共存時避免撞名 */
  namePrefix: string;
  /** 移軸微縮；傳 null 完全關閉（適合需要全畫面清晰的遊戲） */
  tiltShift?: TiltShiftOptions | null;
  /** 環境遮蔽的取樣半徑上限，依場景尺度調整。傳 null 關閉 SSAO */
  ambientOcclusion?: { radius: number; strength: number; maxZ: number } | null;
  /** 曝光。預設略低於 1，把淺色紙材從溢出邊緣收回來 */
  exposure?: number;
  /** 場景個性偏移：六個世界共用同一配方，但同一組數值套六次會有
   * 「同一個 preset 濾鏡」的均質感。每個世界在 split toning 色相與
   * 暗角上帶一點自己的偏移，配方一致、性格不同。
   */
  toneVariation?: {
    /** 亮部色相偏移量（度，加在預設 32 上） */
    highlightsHueOffset?: number;
    /** 暗部色相偏移量（度，加在預設 264 上） */
    shadowsHueOffset?: number;
    /** 暗部染色濃度倍率（乘在預設 38 上） */
    shadowsDensityScale?: number;
    /** 暗角強度倍率（乘在預設 1.1 上） */
    vignetteWeightScale?: number;
  };
}

export interface DioramaLook {
  pipeline: DefaultRenderingPipeline;
  dispose: () => void;
}

/** 移軸模糊的 shader 已註冊過的名稱集合。
 * ShadersStore 是全域的，同名重複寫入會讓先前建立的 PostProcess 取到不同參數，
 * 故每組參數各自一個 shader 名
 */
const registeredShaderNameSet = new Set<string>()

/** 依清晰帶參數註冊（或取用既有的）移軸 shader，回傳 shader 名 */
function ensureTiltShiftShader(options: TiltShiftOptions): string {
  const tapCount = getTiltShiftTapCount()
  const shaderName = [
    'tiltShift',
    options.focusCenterY.toFixed(3),
    options.focusHalfHeight.toFixed(3),
    options.focusFalloff.toFixed(3),
    options.maxBlurRadius.toFixed(1),
    String(tapCount),
  ].join('_').replace(/\./g, 'p')

  if (registeredShaderNameSet.has(shaderName)) {
    return shaderName
  }

  Effect.ShadersStore[`${shaderName}FragmentShader`] = buildTiltShiftShaderSource(options, tapCount)
  registeredShaderNameSet.add(shaderName)
  return shaderName
}

/** 套用箱庭風格的後製管線。回傳的 dispose 只收自己建立的資源，不動 scene */
export function applyDioramaLook(
  scene: Scene,
  camera: Camera,
  options: DioramaLookOptions,
): DioramaLook {
  const {
    namePrefix,
    tiltShift = DEFAULT_TILT_SHIFT,
    ambientOcclusion = { radius: 0.8, strength: 0.68, maxZ: 45 },
    exposure = 0.92,
    toneVariation = {},
  } = options
  const {
    highlightsHueOffset = 0,
    shadowsHueOffset = 0,
    shadowsDensityScale = 1,
    vignetteWeightScale = 1,
  } = toneVariation
  // 手機（觸控為主要輸入）GPU／記憶體有限，MSAA＋SSAO 疊在一起容易在場景初始化時
  // 把 WebGL context 擠爆；六個世界共用這支函式，這裡降級才會全部一起生效
  const isLowPowerDevice = isCoarsePointerDevice()

  // 影像處理：對比微調 + FXAA。
  // 景深（DOF）刻意停用：失焦溢光會在高對比物體邊緣產生明顯白色光暈。
  //
  // 第二個參數是 HDR。開啟後管線每一張 render target 都改用 half-float，
  // 每像素 8 bytes、是 8-bit 的兩倍，MSAA 緩衝也跟著加倍。它換來的是
  // bloom 與色調映射的亮部餘裕——六個世界都沒開這兩者，畫面差異只剩
  // 漸層的細微色階。手機關掉，建立場景瞬間要配置的顯存直接砍半
  const pipeline = new DefaultRenderingPipeline(`${namePrefix}Pipeline`, !isLowPowerDevice, scene, [camera])
  pipeline.depthOfFieldEnabled = false
  pipeline.imageProcessingEnabled = true
  // 對比刻意收斂：柔和陰天感，不要正午烈日
  pipeline.imageProcessing.contrast = 1.05
  pipeline.imageProcessing.exposure = exposure
  // 後處理管線會繞過 canvas 原生 MSAA：改開管線自身的 MSAA（WebGL2，幾何硬邊主力），
  // 再疊 FXAA 收掉殘餘閃爍。只靠 FXAA 對低多邊形硬邊效果很差、鋸齒明顯。
  // 手機降到 2 samples：仍有 MSAA 兜底，但顯存與頻寬成本減半
  pipeline.samples = isLowPowerDevice ? 2 : 4
  pipeline.fxaaEnabled = true

  // 質感細調只留暗角：聚焦視線，染暗藍紫呼應 split toning。
  // 它是 imageProcessing 內建的，不額外增加 pass。
  // 色散、顆粒、銳化三者已全面移除，理由同 diorama-scene.ts：
  // 光學瑕疵不屬於紙與蠟筆的世界，而各自一整個全螢幕 pass 的成本正是發熱主因
  pipeline.imageProcessing.vignetteEnabled = true
  pipeline.imageProcessing.vignetteWeight = 1.1 * vignetteWeightScale
  pipeline.imageProcessing.vignetteColor = new Color4(0.09, 0.08, 0.18, 0)

  // Split toning：亮部染暖橘、暗部染藍紫，整體光影冷暖對比更豐富。
  // 用後製 ColorCurves 統一處理，日夜模式都吃得到，不用逐一調材質
  const splitToningCurves = new ColorCurves()
  splitToningCurves.highlightsHue = 32 + highlightsHueOffset
  splitToningCurves.highlightsDensity = 20
  splitToningCurves.highlightsSaturation = 14
  // 染色會推高亮部亮度，曝光往回收避免過曝
  splitToningCurves.highlightsExposure = -14
  splitToningCurves.shadowsHue = 264 + shadowsHueOffset
  splitToningCurves.shadowsDensity = 38 * shadowsDensityScale
  splitToningCurves.shadowsSaturation = 28
  pipeline.imageProcessing.colorCurvesEnabled = true
  pipeline.imageProcessing.colorCurves = splitToningCurves

  // SSAO：物體接縫、凹角與貼地處產生柔和環境遮蔽，接地感與體積感明顯提升。
  // 走 geometry buffer（非 prepass），避開透明 canvas＋MSAA 管線的相容性問題。
  // WebGL1 不支援就跳過，畫面只是少了 AO。
  // 手機也直接跳過：SSAO 是這整條管線裡最吃顯存的部分（額外 render target 加模糊 pass），
  // 犧牲這裡的陰影細節、換超取樣解析度不縮水，畫面清晰度的取捨更划算
  let ssaoPipeline: SSAO2RenderingPipeline | undefined
  if (ambientOcclusion && SSAO2RenderingPipeline.IsSupported && !isLowPowerDevice) {
    ssaoPipeline = new SSAO2RenderingPipeline(
      `${namePrefix}SsaoPipeline`,
      scene,
      { ssaoRatio: 0.5, blurRatio: 1 },
      [camera],
      true,
    )
    // 低多邊小場景：取樣半徑貼近物件尺度，強度壓在陰影提示而非髒污的程度
    ssaoPipeline.radius = ambientOcclusion.radius
    ssaoPipeline.totalStrength = ambientOcclusion.strength
    ssaoPipeline.samples = 12
    ssaoPipeline.expensiveBlur = true
    ssaoPipeline.maxZ = ambientOcclusion.maxZ
  }

  // 移軸微縮（tilt-shift）：畫面上下緣漸進模糊、中央保持清晰帶。
  // 微縮感 = 俯視＋淺景深＋高對比（後兩者已有），這裡補上模糊。
  // 用螢幕空間垂直漸層而非深度 DOF，避開失焦溢光的邊緣光暈問題
  let tiltShiftPostProcess: PostProcess | undefined
  if (tiltShift) {
    const shaderName = ensureTiltShiftShader(tiltShift)
    tiltShiftPostProcess = new PostProcess(
      `${namePrefix}TiltShift`,
      shaderName,
      ['texelSize'],
      null,
      1,
      camera,
    )
    const postProcess = tiltShiftPostProcess
    postProcess.onApply = (effect) => {
      effect.setFloat2(
        'texelSize',
        1 / Math.max(1, postProcess.width),
        1 / Math.max(1, postProcess.height),
      )
    }
  }

  return {
    pipeline,
    dispose() {
      tiltShiftPostProcess?.dispose()
      ssaoPipeline?.dispose()
      pipeline.dispose()
    },
  }
}
