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

/** 移軸微縮的清晰帶設定。垂直捲動類遊戲把 halfHeight 放大，
 * 才不會把玩家正在操作的上下區域糊掉
 */
export interface TiltShiftOptions {
  /** 清晰帶中心（0 = 畫面底、1 = 頂） */
  focusCenterY: number;
  /** 清晰帶半高（畫面高度比例） */
  focusHalfHeight: number;
  /** 由清晰到最模糊的過渡帶寬度 */
  focusFalloff: number;
  /** 最大模糊半徑（px） */
  maxBlurRadius: number;
}

export interface DioramaLookOptions {
  /** 管線名稱前綴，多場景共存時避免撞名 */
  namePrefix: string;
  /** 移軸微縮；傳 null 完全關閉（適合需要全畫面清晰的遊戲） */
  tiltShift?: TiltShiftOptions | null;
  /** 環境遮蔽的取樣半徑上限，依場景尺度調整。傳 null 關閉 SSAO */
  ambientOcclusion?: { radius: number; strength: number; maxZ: number } | null;
  /** 膠片顆粒強度。大場景可調低，避免遠景雜訊 */
  grainIntensity?: number;
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

const DEFAULT_TILT_SHIFT: TiltShiftOptions = {
  focusCenterY: 0.52,
  focusHalfHeight: 0.12,
  focusFalloff: 0.3,
  maxBlurRadius: 10,
}

/** 移軸模糊的 shader 已註冊過的名稱集合。
 * ShadersStore 是全域的，同名重複寫入會讓先前建立的 PostProcess 取到不同參數，
 * 故每組參數各自一個 shader 名
 */
const registeredShaderNameSet = new Set<string>()

/** 依清晰帶參數註冊（或取用既有的）移軸 shader，回傳 shader 名 */
function ensureTiltShiftShader(options: TiltShiftOptions): string {
  const shaderName = [
    'tiltShift',
    options.focusCenterY.toFixed(3),
    options.focusHalfHeight.toFixed(3),
    options.focusFalloff.toFixed(3),
    options.maxBlurRadius.toFixed(1),
  ].join('_').replace(/\./g, 'p')

  if (registeredShaderNameSet.has(shaderName)) {
    return shaderName
  }

  Effect.ShadersStore[`${shaderName}FragmentShader`] = /* glsl */ `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 texelSize;

    const float FOCUS_CENTER_Y = ${options.focusCenterY.toFixed(4)};
    const float FOCUS_HALF_HEIGHT = ${options.focusHalfHeight.toFixed(4)};
    const float FOCUS_FALLOFF = ${options.focusFalloff.toFixed(4)};
    const float MAX_BLUR_RADIUS = ${options.maxBlurRadius.toFixed(2)};

    void main(void) {
      vec4 centerColor = texture2D(textureSampler, vUV);
      float bandDistance = max(0.0, abs(vUV.y - FOCUS_CENTER_Y) - FOCUS_HALF_HEIGHT);
      float blurStrength = smoothstep(0.0, FOCUS_FALLOFF, bandDistance);
      if (blurStrength < 0.02) {
        gl_FragColor = centerColor;
        return;
      }
      float radius = blurStrength * MAX_BLUR_RADIUS;
      // 12 向盤形取樣的簡化模糊，半徑交錯避免環狀感
      vec4 accumulated = centerColor;
      for (int index = 0; index < 12; index++) {
        float angle = float(index) * 0.5236;
        float sampleRadius = radius * (0.45 + 0.55 * fract(float(index) * 0.618));
        vec2 sampleOffset = vec2(cos(angle), sin(angle)) * texelSize * sampleRadius;
        accumulated += texture2D(textureSampler, vUV + sampleOffset);
      }
      gl_FragColor = accumulated / 13.0;
    }
  `
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
    grainIntensity = 6,
    exposure = 0.92,
    toneVariation = {},
  } = options
  const {
    highlightsHueOffset = 0,
    shadowsHueOffset = 0,
    shadowsDensityScale = 1,
    vignetteWeightScale = 1,
  } = toneVariation

  // 影像處理：對比微調 + FXAA。
  // 景深（DOF）刻意停用：失焦溢光會在高對比物體邊緣產生明顯白色光暈
  const pipeline = new DefaultRenderingPipeline(`${namePrefix}Pipeline`, true, scene, [camera])
  pipeline.depthOfFieldEnabled = false
  pipeline.imageProcessingEnabled = true
  // 對比刻意收斂：柔和陰天感，不要正午烈日
  pipeline.imageProcessing.contrast = 1.05
  pipeline.imageProcessing.exposure = exposure
  // 後處理管線會繞過 canvas 原生 MSAA：改開管線自身的 MSAA（WebGL2，幾何硬邊主力），
  // 再疊 FXAA 收掉殘餘閃爍。只靠 FXAA 對低多邊形硬邊效果很差、鋸齒明顯
  pipeline.samples = 4
  pipeline.fxaaEnabled = true

  // 質感細調：暗角聚焦視線（染暗藍紫呼應 split toning）、
  // 輕微動態膠片顆粒（與紙紋同語彙）、銳化補償 FXAA 的細節損失、
  // 邊緣極輕色散帶出鏡頭感
  pipeline.imageProcessing.vignetteEnabled = true
  pipeline.imageProcessing.vignetteWeight = 1.1 * vignetteWeightScale
  pipeline.imageProcessing.vignetteColor = new Color4(0.09, 0.08, 0.18, 0)
  // 銳化壓到極輕：高對比邊緣過銳會產生白暈（像烈日反光）
  pipeline.sharpenEnabled = true
  pipeline.sharpen.edgeAmount = 0.06
  pipeline.grainEnabled = grainIntensity > 0
  pipeline.grain.intensity = grainIntensity
  pipeline.grain.animated = true
  pipeline.chromaticAberrationEnabled = true
  pipeline.chromaticAberration.aberrationAmount = 6
  pipeline.chromaticAberration.radialIntensity = 0.85

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
  // WebGL1 不支援就跳過，畫面只是少了 AO
  let ssaoPipeline: SSAO2RenderingPipeline | undefined
  if (ambientOcclusion && SSAO2RenderingPipeline.IsSupported) {
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
