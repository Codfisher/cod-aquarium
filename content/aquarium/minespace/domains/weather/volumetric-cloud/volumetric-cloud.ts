import type { Effect, Mesh, Scene } from '@babylonjs/core'
import type { CloudNoiseSet } from './cloud-noise'
import {
  Color3,
  Constants,
  EffectRenderer,
  Effect as EffectStore,
  EffectWrapper,
  Matrix,
  MeshBuilder,
  RawTexture,
  RawTexture3D,
  RenderTargetTexture,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
} from '@babylonjs/core'
import { watch } from 'vue'
import { useDevToggles } from '../../../composables/use-dev-toggles'
import { reportDiagnostic } from '../../../composables/use-error-logger'
import { useGraphicsQuality } from '../../../composables/use-graphics-quality'
import { measureSection } from '../../../composables/use-performance-probe'
import { optOutOfFog } from '../../renderer/fog-opt-out'
import { WORLD_SIZE } from '../../world/world-constants'
import { getCloudShadowLightDirection, setCloudShadowMap } from '../cloud-shadow'
import {
  CLOUD_COMPOSITE_FRAGMENT,
  CLOUD_DOME_VERTEX,
  CLOUD_FULLSCREEN_VERTEX,
  CLOUD_MARCH_FRAGMENT,
  CLOUD_REFLECTION_FRAGMENT,
  CLOUD_RESOLVE_FRAGMENT,
  CLOUD_SAMPLER_NAME_LIST,
  CLOUD_SHADOW_FRAGMENT,
  CLOUD_UNIFORM_NAME_LIST,
} from './cloud-glsl'
import { requestCloudNoise } from './use-cloud-noise-worker'

/**
 * 體積雲
 *
 * 原本的雲是一整片方塊網格：一百格高、五格厚，每朵雲是幾格十四格寬的扁盒子。
 * 那是 Minecraft 的雲，看得到厚度與側面，但它永遠是一塊平頂平底的白色積木——
 * 沒有雲底的陰影、沒有逆光的銀邊、日落時也不會只有雲頂被染紅。
 *
 * 這一支換成真正的參與介質：從鏡頭往每個像素射一條線，沿路一步一步問
 * 「這裡的空氣裡有多少水氣、照得到多少太陽」，把散射進眼睛的光一路累加起來。
 * 雲長什麼樣、怎麼被照亮，全部是算出來的，不是畫出來的。
 * 密度與光照的模型寫在 cloud-glsl，這裡管的是「怎麼在一幀之內付得起」。
 *
 * ── 一幀之內付得起：四件事 ──
 *
 * 一、降解析度。雲是柔的，半解析度看不出差別，像素數卻只剩四分之一。
 *
 * 二、時間累積。每一幀的行進起點各自抖動一點，單看一幀是顆粒狀的雜訊；
 *     把上一幀的結果投影回來混在一起，十幾幀累積下來就等於走了十幾倍的步數。
 *     這是 Nubis 能在 PS4 上跑兩毫秒的關鍵，也是這裡步數敢壓到幾十步的理由。
 *
 * 三、深度不用算。合成那一趟是一個貼著遠平面的天空罩，
 *     地形本來就寫了深度，擋得住它；雲根本不必知道地上有什麼。
 *     所以最省的那一級沒開場景深度圖也照樣能用。
 *
 * 四、雲看不見就整個不跑。陰天罩蓋滿、走到世界邊界、除錯開關關掉，
 *     三種情況都直接跳過所有趟數——不留一趟「跑了但什麼都沒畫」的全螢幕
 *
 * ── 合成順序 ──
 *
 * 天空罩、日月、星空畫在第零層；雲畫在第一層的半透明佇列，
 * alphaIndex 比陰天罩小，所以陰天罩永遠蓋在雲上面。
 * 舊的方塊雲要寫深度才不會自己疊自己，於是會在陰天罩上挖出一個洞
 * （use-weather 裡 CLOUD_VANISH_AT_OVERCAST 那段的來由）；
 * 這裡一筆深度都不寫，那個洞不會再出現
 */

/** 雲底與雲頂的高度（格），世界最高四十格，鏡頭永遠在雲層底下 */
const CLOUD_BOTTOM = 115
const CLOUD_TOP = 205

/**
 * 星球半徑（格）
 *
 * 不是地球的比例，是「天邊的雲沉下去」需要的曲率。
 * 一萬二的時候，望向正前方水平線的視線大約在一千六百格處碰到雲底、
 * 兩千兩百格處穿出雲頂——遠方的雲在這個距離內自然地降到地平線，
 * 而霧與大氣透視也剛好在那附近把它化進天色
 */
const PLANET_RADIUS = 12000

/**
 * 三張雜訊攤在天上多大（格）
 *
 * 基底一個週期四百八十格：一朵積雲一兩百格寬，一個週期裡容得下幾朵，
 * 又不會小到同一個形狀在視野裡重複出現。
 * 細節七十二格：雲邊那些捲曲的缺口大約是幾格到十幾格。
 * 天氣圖三千兩百格：決定「這一大片天比較多雲」的尺度，
 * 比視野裡看得到的範圍還大，抬頭轉一圈看不出重複
 */
const BASE_NOISE_PERIOD = 300
const DETAIL_NOISE_PERIOD = 46
const WEATHER_MAP_PERIOD = 3200

/** 天氣圖與兩張雜訊的邊長，取捨見 cloud-noise 的 CloudNoiseSizeOption */
const NOISE_SIZE_OPTION = { baseSize: 64, detailSize: 32, weatherSize: 256 }
const NOISE_SEED = 'minespace-cloud'

/**
 * 晴天的覆蓋率
 *
 * 天氣圖的紅色通道已經拉成均勻分布，所以這個數字大約就是
 * 「天空有幾成的地方可能長雲」。實際看得到的雲比這個少，
 * 因為基底雜訊還會在雲團裡面挖洞。禪庭要的是晴天裡幾朵散開的積雲
 */
const CLEAR_COVERAGE = 0.46

/** 下雨時覆蓋率往上加多少，雲先變多變暗，陰天罩才接手 */
const RAIN_COVERAGE_BOOST = 0.32

/**
 * 消光係數（每格）
 *
 * 密度一的雲每走一格擋掉這麼多光。一朵一百格厚、平均密度一半的積雲，
 * 光學厚度大約是五，正中間幾乎不透光，邊緣則還看得到後面的天
 */
const EXTINCTION = 0.14

/** 反照率：雲幾乎不吸收光，散射掉的就是全部 */
const ALBEDO = 0.96

/** 雲頂往下風處歪多少格，高的積雲會被高空的風推斜 */
const CLOUD_SKEW = 40

/** 細節侵蝕的強度，大了雲邊會被啃得很碎 */
const DETAIL_EROSION = 0.5

/**
 * 風（格 / 秒）與方向
 *
 * 舊雲層是 0.6，那是一整片硬塊在平移。體積雲的細節自己還會翻滾，
 * 主體可以飄得快一點，天空才有在動的感覺
 */
const WIND_SPEED = 2.2
const WIND_DIRECTION = new Vector3(1, 0, 0.34).normalize()
/** 細節雜訊自己翻滾的速度，與風無關，是雲邊在長、在散 */
const DETAIL_EVOLVE_SPEED = 0.018

/**
 * 遠方化進天色的距離與淡出範圍（格）
 *
 * 化進天色用指數：一千兩百格外的雲剩三成七的原色，其餘是天邊的霧色。
 * 淡出則是在穿出雲頂的那附近把不透明度收到零，
 * 不讓雲層在某個距離被一刀切掉
 */
const HAZE_DISTANCE = 1200
const FADE_START = 1700
const FADE_END = 2300

/** 卷雲：高度、覆蓋率、最濃時的不透明度、天氣圖藍色通道攤多大 */
const CIRRUS_HEIGHT = 420
const CIRRUS_COVERAGE = 0.42
const CIRRUS_OPACITY = 0.4
const CIRRUS_PERIOD = 5200

/**
 * 光照的兩個增益
 *
 * 相位函數是正規化過的（對整個球面積分是一），所以側光下的單次散射
 * 本身只有零點零幾。乘上這個數字，正午側光下厚雲的亮面才會落在一附近——
 * 與舊雲層的 cloudBrightness 同一個亮度，畫面不會因為換了雲整個變亮或變暗。
 *
 * 環境光那一份是天空從四面八方打進來的光，雲底幾乎全靠它
 */
const SUN_GAIN = 14
const AMBIENT_GAIN = 0.72

/** 粉末效應的強度，零是不做，一是 Schneider 原式的濃度 */
const POWDER_STRENGTH = 0.55

/** 閃電一閃時雲被照亮多少，雷雨裡整片雲從裡面亮一下 */
const FLASH_GAIN = 0.9

/**
 * 最短步距（格）
 *
 * 望向天頂時整段只有九十格，給滿步數會切成一格多一步，
 * 遠超過雲的細節需要的密度。步數改成「路徑長除以這個距離」，
 * 上下限是畫質給的步數的四成到全部：天頂省下一半以上，望向天邊時照樣走滿
 */
const MIN_STEP_LENGTH = 2.2

/**
 * 多遠以外省略細節雜訊與一半的光線步數（格）
 *
 * 九百格外一朵雲只剩幾個像素，邊緣被啃出來的缺口根本看不見，
 * 又已經化進天色一大半。那裡每一步都少兩次三維取樣，
 * 而望向天邊的射線大部分的步數正好都落在這一段
 */
const FAR_DETAIL_DISTANCE = 900

/**
 * 時間累積每一幀採用多少新值
 *
 * 越小越平滑、但雲變形時的拖影越長。一成大約是十幀的記憶，
 * 雲飄得很慢，拖影看不出來
 */
const HISTORY_CURRENT_WEIGHT = 0.1

/** 變異數裁切的寬度，越大越平滑、越容易留下拖影 */
const HISTORY_CLIP_GAMMA = 1.25

/** 鏡頭一幀跳超過這麼遠就當成傳送，舊的累積整個丟掉 */
const TELEPORT_DISTANCE = 30

/**
 * 地面雲影那張俯視圖
 *
 * 罩住鏡頭附近四百五十格見方，霧在兩百多格就收滿，再遠的影子看不到。
 * 兩百五十六格的圖，一格不到兩格寬，影子的邊本來就是軟的，夠用
 */
const SHADOW_MAP_SIZE = 256
const SHADOW_MAP_SPAN = 448
/** 雲影的光學厚度打幾折，雲影比照著看到的雲淡一點才不會像墨跡 */
const SHADOW_DENSITY_SCALE = 0.75

/** 天空罩的邊長，要比陰天罩（250）小，排序時才不會被誤判成在它外面 */
const DOME_SIZE = 230

/**
 * 這一刻的雲該怎麼被照亮、天氣如何
 *
 * 與 aerial-perspective 的 airState 同一種寫法：放在模組上，
 * 日夜循環寫光、天氣系統寫天氣，算繪那一趟自己來讀。
 * 兩邊各寫各的欄位，誰先跑都不會互相蓋掉
 */
export const volumetricCloudState = {
  /** 光從哪裡來（指向光源），白天是太陽、夜裡是月亮 */
  lightDirection: new Vector3(0, 1, 0),
  /** 光的顏色，已經乘過這個時刻的亮度 */
  lightColor: new Color3(1, 1, 1),
  /** 雲頂吃到的天光 */
  ambientTop: new Color3(0.6, 0.7, 0.9),
  /** 雲底吃到的光：天空的側光與地面反上來的光 */
  ambientBottom: new Color3(0.5, 0.5, 0.5),
  /** 遠方化進去的顏色，用霧的基準色 */
  hazeColor: new Color3(0.9, 0.9, 0.9),
  /** 整片雲該露出多少，陰天罩與世界邊界會把它收到零 */
  visibleRatio: 1,
  /** 下雨的程度，雲變多、變暗 */
  rainRatio: 0,
  /** 閃電那一下有多亮 */
  flashRatio: 0,
}

/** 倒影材質的名字，水鏡靠它把材質找出來 */
export const CLOUD_REFLECTION_MATERIAL_NAME = 'cloud-reflection-material'

export interface VolumetricCloud {
  /** 水鏡倒影用的材質，見 water-mirror */
  reflectionMaterial: ShaderMaterial;
  dispose: () => void;
}

interface NoiseTextureSet {
  base: RawTexture3D;
  detail: RawTexture3D;
  weather: RawTexture;
}

/** 這一幀要寫進著色器的值，三支效果與倒影材質共用同一份 */
interface FrameUniform {
  coverage: number;
  origin: Vector3;
  detailTime: number;
  cameraPosition: Vector3;
  lightDirection: Vector3;
  lightColor: Color3;
  ambientTop: Color3;
  ambientBottom: Color3;
  flash: number;
  visibleRatio: number;
}

function createNoiseTextureSet(scene: Scene, noiseSet: CloudNoiseSet): NoiseTextureSet {
  /**
   * 三維貼圖在這裡是安全的
   *
   * voxel-gi 當年改用二維圖集，是因為 sampler3D 撞上了
   * 「兩種型別的貼圖用到同一個材質單元」：那是一個掛在 StandardMaterial 上的外掛，
   * 有的材質綁了它、有的沒有，沒綁的取樣器預設落在零號單元，與別的二維貼圖相撞。
   *
   * 這裡的三支效果與兩份材質都是自己寫的，每一個取樣器每一次都綁齊，
   * 不存在「宣告了卻沒綁」的取樣器。而三維貼圖換到的是硬體的三線性內插
   * 與三軸重複定址——攤成圖集的話每次取樣要兩次讀取再自己內插，
   * 這裡一條射線要取上百次，差別是實打實的
   */
  const createVolume = (name: string, volume: CloudNoiseSet['base']) => {
    const texture = new RawTexture3D(
      volume.data,
      volume.size,
      volume.size,
      volume.size,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    )
    texture.name = name
    texture.wrapU = Texture.WRAP_ADDRESSMODE
    texture.wrapV = Texture.WRAP_ADDRESSMODE
    texture.wrapR = Texture.WRAP_ADDRESSMODE
    return texture
  }

  const weather = RawTexture.CreateRGBATexture(
    noiseSet.weather.data,
    noiseSet.weather.size,
    noiseSet.weather.size,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  weather.name = 'cloud-weather-map'
  weather.wrapU = Texture.WRAP_ADDRESSMODE
  weather.wrapV = Texture.WRAP_ADDRESSMODE

  return {
    base: createVolume('cloud-base-noise', noiseSet.base),
    detail: createVolume('cloud-detail-noise', noiseSet.detail),
    weather,
  }
}

function createTarget(scene: Scene, name: string, width: number, height: number, type: number): RenderTargetTexture {
  const target = new RenderTargetTexture(
    name,
    { width, height },
    scene,
    false,
    true,
    type,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    false,
    false,
  )
  target.wrapU = Texture.CLAMP_ADDRESSMODE
  target.wrapV = Texture.CLAMP_ADDRESSMODE
  return target
}

/**
 * 建立體積雲
 *
 * 在場景建立時呼叫：天空罩要跟著其他天空的東西一起排好位置。
 * 雜訊要在 worker 裡算一秒多，那之前天空罩先關著，
 * 算好之後雲直接淡入，不會有一幀是壞的
 */
export function createVolumetricCloud(scene: Scene, skyOverlayGroup: number, domeName: string): VolumetricCloud {
  const engine = scene.getEngine()
  const { preset } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()

  /** 半浮點的目標不是每台機器都能畫，畫不了就退回八位元，銀邊那一點過曝會被截掉而已 */
  const targetType = engine.getCaps().textureHalfFloatRender
    ? Constants.TEXTURETYPE_HALF_FLOAT
    : Constants.TEXTURETYPE_UNSIGNED_BYTE
  reportDiagnostic('體積雲/目標格式', targetType === Constants.TEXTURETYPE_HALF_FLOAT ? '半浮點' : '八位元')

  let noiseTextureSet: NoiseTextureSet | null = null
  const noiseRequest = requestCloudNoise(NOISE_SIZE_OPTION, NOISE_SEED)
  noiseRequest.promise
    .then((noiseSet) => {
      if (scene.isDisposed)
        return
      noiseTextureSet = createNoiseTextureSet(scene, noiseSet)
    })
    .catch((error: unknown) => {
      reportDiagnostic('體積雲/雜訊生成', `失敗：${error instanceof Error ? error.message : String(error)}`)
    })

  const frame: FrameUniform = {
    coverage: CLEAR_COVERAGE,
    origin: new Vector3(),
    detailTime: 0,
    cameraPosition: new Vector3(),
    lightDirection: new Vector3(0, 1, 0),
    lightColor: new Color3(),
    ambientTop: new Color3(),
    ambientBottom: new Color3(),
    flash: 0,
    visibleRatio: 1,
  }

  function applyCloudUniforms(effect: Effect, lightDirection: Vector3 = frame.lightDirection): void {
    if (!noiseTextureSet)
      return

    effect.setTexture('cloudBaseSampler', noiseTextureSet.base)
    effect.setTexture('cloudDetailSampler', noiseTextureSet.detail)
    effect.setTexture('cloudWeatherSampler', noiseTextureSet.weather)
    effect.setFloat4('cloudLayer', CLOUD_BOTTOM, CLOUD_TOP, PLANET_RADIUS, 0)
    effect.setFloat4('cloudShape', frame.coverage, EXTINCTION, ALBEDO, CLOUD_SKEW)
    effect.setFloat4(
      'cloudScale',
      1 / BASE_NOISE_PERIOD,
      1 / DETAIL_NOISE_PERIOD,
      1 / WEATHER_MAP_PERIOD,
      DETAIL_EROSION,
    )
    effect.setFloat4('cloudOrigin', frame.origin.x, frame.origin.y, frame.origin.z, frame.detailTime)
    effect.setVector3('cloudSunDirection', lightDirection)
    effect.setColor3('cloudSunColor', frame.lightColor)
    effect.setColor3('cloudAmbientTop', frame.ambientTop)
    effect.setColor3('cloudAmbientBottom', frame.ambientBottom)
    effect.setColor3('cloudHazeColor', volumetricCloudState.hazeColor)
    effect.setFloat4('cloudHaze', HAZE_DISTANCE, FADE_START, FADE_END, 1)
    effect.setFloat4('cloudCirrus', CIRRUS_HEIGHT, CIRRUS_COVERAGE, CIRRUS_OPACITY, 1 / CIRRUS_PERIOD)
    effect.setFloat4('cloudLighting', SUN_GAIN, AMBIENT_GAIN, POWDER_STRENGTH, frame.flash)
    effect.setVector3('cloudCameraPosition', frame.cameraPosition)
    effect.setFloat2('cloudWindDirection', WIND_DIRECTION.x, WIND_DIRECTION.z)
    effect.setFloat4('cloudMarchSetting', MIN_STEP_LENGTH, FAR_DETAIL_DISTANCE, 0, 0)
  }

  const effectRenderer = new EffectRenderer(engine)
  const createWrapper = (name: string, fragmentShader: string, uniformNameList: string[], samplerNameList: string[]) =>
    new EffectWrapper({
      engine,
      name,
      vertexShader: CLOUD_FULLSCREEN_VERTEX,
      fragmentShader,
      attributeNames: ['position'],
      uniformNames: [...CLOUD_UNIFORM_NAME_LIST, ...uniformNameList],
      samplerNames: [...CLOUD_SAMPLER_NAME_LIST, ...samplerNameList],
    })

  const marchWrapper = createWrapper('minespace-cloud-march', CLOUD_MARCH_FRAGMENT, ['inverseViewProjection', 'marchSetting'], [])
  const resolveWrapper = createWrapper(
    'minespace-cloud-resolve',
    CLOUD_RESOLVE_FRAGMENT,
    ['inverseViewProjection', 'previousViewProjection', 'cloudShift', 'resolveSetting'],
    ['currentSampler', 'historySampler'],
  )
  const shadowWrapper = createWrapper('minespace-cloud-shadow', CLOUD_SHADOW_FRAGMENT, ['shadowArea'], [])

  /** 三張降解析度的圖：這一幀的行進結果，以及輪流讀寫的兩張累積 */
  let targetWidth = 1
  let targetHeight = 1
  const currentTarget = createTarget(scene, 'cloud-current', targetWidth, targetHeight, targetType)
  let historyRead = createTarget(scene, 'cloud-history-a', targetWidth, targetHeight, targetType)
  let historyWrite = createTarget(scene, 'cloud-history-b', targetWidth, targetHeight, targetType)
  const shadowTarget = createTarget(scene, 'cloud-shadow-map', SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, Constants.TEXTURETYPE_UNSIGNED_BYTE)

  const compositeSetting = new Vector4()
  const compositeTexelSize = new Vector2()
  const inverseViewProjection = new Matrix()
  const previousViewProjection = new Matrix()
  const previousCameraPosition = new Vector3()
  const previousOrigin = new Vector3()
  const cloudShift = new Vector3()
  /** 循環世界的平移累積，雲的座標靠它才是連續的 */
  const worldShift = new Vector3()
  let hasPreviousFrame = false
  let shouldResetHistory = true
  let elapsed = 0
  let frameIndex = 0

  /** 雲影俯視圖這一幀罩在哪裡，綁定時讀 */
  const shadowArea = { centerX: 0, centerZ: 0 }

  /**
   * 三支效果的綁定各掛一次
   *
   * 每一幀要換的值都從閉包裡的狀態讀。不要每幀清掉觀察者再重掛：
   * EffectWrapper 自己在 onApplyObservable 上掛了預設的綁定，一清就一起清掉了
   */
  marchWrapper.onApplyObservable.add(() => {
    const effect = marchWrapper.effect
    applyCloudUniforms(effect)
    effect.setMatrix('inverseViewProjection', inverseViewProjection)
    effect.setFloat4('marchSetting', preset.value.cloudStepCount, preset.value.cloudLightStepCount, frameIndex, 0)
  })
  resolveWrapper.onApplyObservable.add(() => {
    const effect = resolveWrapper.effect
    applyCloudUniforms(effect)
    effect.setTexture('currentSampler', currentTarget)
    effect.setTexture('historySampler', historyRead)
    effect.setMatrix('inverseViewProjection', inverseViewProjection)
    effect.setMatrix('previousViewProjection', previousViewProjection)
    effect.setVector3('cloudShift', cloudShift)
    effect.setFloat4(
      'resolveSetting',
      shouldResetHistory ? 1 : HISTORY_CURRENT_WEIGHT,
      1 / targetWidth,
      1 / targetHeight,
      HISTORY_CLIP_GAMMA,
    )
  })
  shadowWrapper.onApplyObservable.add(() => {
    const effect = shadowWrapper.effect
    applyCloudUniforms(effect, getCloudShadowLightDirection())
    effect.setFloat4('shadowArea', shadowArea.centerX, shadowArea.centerZ, SHADOW_MAP_SPAN, SHADOW_DENSITY_SCALE)
  })

  /** 天空罩：把累積好的雲貼回主畫面 */
  EffectStore.ShadersStore.minespaceCloudDomeVertexShader = CLOUD_DOME_VERTEX
  EffectStore.ShadersStore.minespaceCloudCompositeFragmentShader = CLOUD_COMPOSITE_FRAGMENT
  EffectStore.ShadersStore.minespaceCloudReflectionFragmentShader = CLOUD_REFLECTION_FRAGMENT

  const compositeMaterial = new ShaderMaterial(
    'cloud-composite-material',
    scene,
    { vertex: 'minespaceCloudDome', fragment: 'minespaceCloudComposite' },
    {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'compositeSetting', 'cloudTexelSize'],
      samplers: ['cloudSampler'],
      needAlphaBlending: true,
    },
  )
  const reflectionMaterial = new ShaderMaterial(
    CLOUD_REFLECTION_MATERIAL_NAME,
    scene,
    { vertex: 'minespaceCloudDome', fragment: 'minespaceCloudReflection' },
    {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'compositeSetting', ...CLOUD_UNIFORM_NAME_LIST],
      samplers: [...CLOUD_SAMPLER_NAME_LIST],
      needAlphaBlending: true,
    },
  )

  for (const material of [compositeMaterial, reflectionMaterial]) {
    /** 輸出是預乘過的顏色，見 CLOUD_COMPOSITE_FRAGMENT */
    material.alphaMode = Constants.ALPHA_PREMULTIPLIED
    material.backFaceCulling = false
    material.disableDepthWrite = true
    /** 頂點把深度壓在遠平面上（剛好等於一），要用小於等於才過得了清除後的深度 */
    material.depthFunction = Constants.LEQUAL
    material.fogEnabled = false
  }

  reflectionMaterial.onBindObservable.add(() => {
    const effect = reflectionMaterial.getEffect()
    if (!effect)
      return
    applyCloudUniforms(effect)
    effect.setFloat4('compositeSetting', 0, 0, frame.visibleRatio, 0)
  })

  const dome: Mesh = MeshBuilder.CreateBox(domeName, { size: DOME_SIZE }, scene)
  dome.material = compositeMaterial
  dome.infiniteDistance = true
  dome.isPickable = false
  dome.receiveShadows = false
  dome.renderingGroupId = skyOverlayGroup
  /** 排在陰天罩前面畫，陰天時灰罩才蓋得住雲（陰天罩的 alphaIndex 是預設的最大值） */
  dome.alphaIndex = 0
  dome.setEnabled(false)
  optOutOfFog(dome, '自己在著色器裡化進天色，再由 use-weather 的 visibleRatio 淡到全透明')

  /** 解析度跟著畫質與視窗大小走，換了就把累積丟掉 */
  function syncTargetSize(): void {
    const ratio = preset.value.cloudResolutionRatio
    const width = Math.max(1, Math.round(engine.getRenderWidth() * ratio))
    const height = Math.max(1, Math.round(engine.getRenderHeight() * ratio))
    if (width === targetWidth && height === targetHeight)
      return

    targetWidth = width
    targetHeight = height
    for (const target of [currentTarget, historyRead, historyWrite]) {
      target.resize({ width, height })
    }
    shouldResetHistory = true
    reportDiagnostic('體積雲/行進解析度', `${width}×${height}`)
  }

  /**
   * 追蹤循環世界的平移
   *
   * 走出邊界時鏡頭會被平移一整個世界寬（見 use-fps-controller 的 wrapAxis）。
   * 雲的週期與世界無關，不跟著補回來的話，那一瞬間頭頂的雲整片換掉。
   * 邊界上霧濃到看不見天，換掉其實也看不出來；但地上的雲影與累積的歷史
   * 都會跳一下，補回來最乾淨
   */
  function trackWorldWrap(position: Vector3): void {
    if (!hasPreviousFrame)
      return

    const deltaX = position.x - previousCameraPosition.x
    const deltaZ = position.z - previousCameraPosition.z
    const wrapX = Math.round(deltaX / WORLD_SIZE)
    const wrapZ = Math.round(deltaZ / WORLD_SIZE)
    worldShift.x -= wrapX * WORLD_SIZE
    worldShift.z -= wrapZ * WORLD_SIZE

    const remainX = deltaX - wrapX * WORLD_SIZE
    const remainZ = deltaZ - wrapZ * WORLD_SIZE
    const remainY = position.y - previousCameraPosition.y
    if (Math.hypot(remainX, remainY, remainZ) > TELEPORT_DISTANCE) {
      shouldResetHistory = true
    }
  }

  /** 把日夜與天氣寫進來的狀態合成這一幀要用的值 */
  function updateFrameUniform(position: Vector3): void {
    const state = volumetricCloudState
    const darkness = 1 - state.rainRatio * 0.55

    frame.coverage = Math.min(0.95, CLEAR_COVERAGE + state.rainRatio * RAIN_COVERAGE_BOOST)
    frame.origin.set(
      worldShift.x - WIND_DIRECTION.x * WIND_SPEED * elapsed,
      0,
      worldShift.z - WIND_DIRECTION.z * WIND_SPEED * elapsed,
    )
    frame.detailTime = elapsed * DETAIL_EVOLVE_SPEED
    frame.cameraPosition.copyFrom(position)
    frame.lightDirection.copyFrom(state.lightDirection).normalize()
    frame.lightColor.copyFrom(state.lightColor).scaleToRef(darkness * (1 - state.rainRatio * 0.3), frame.lightColor)
    state.ambientTop.scaleToRef(darkness, frame.ambientTop)
    state.ambientBottom.scaleToRef(darkness, frame.ambientBottom)
    frame.flash = state.flashRatio * FLASH_GAIN
    frame.visibleRatio = Math.min(1, Math.max(0, state.visibleRatio))
  }

  function renderShadowMap(): void {
    const texel = SHADOW_MAP_SPAN / SHADOW_MAP_SIZE
    /** 中心對齊到圖的格子上，走路時影子邊緣才不會一格一格地爬（與陰影追蹤同一個道理） */
    shadowArea.centerX = Math.round(frame.cameraPosition.x / texel) * texel
    shadowArea.centerZ = Math.round(frame.cameraPosition.z / texel) * texel
    effectRenderer.render(shadowWrapper, shadowTarget)

    setCloudShadowMap({
      texture: shadowTarget,
      centerX: shadowArea.centerX,
      centerZ: shadowArea.centerZ,
      inverseSpan: 1 / SHADOW_MAP_SPAN,
      height: CLOUD_BOTTOM,
      visibleRatio: frame.visibleRatio,
    })
  }

  function renderClouds(): void {
    const camera = scene.activeCamera
    if (!camera)
      return

    const isVisible = !!noiseTextureSet
      && devToggle.volumetricCloud
      && volumetricCloudState.visibleRatio > 0.001
      && marchWrapper.isReady()
      && resolveWrapper.isReady()
      && shadowWrapper.isReady()

    if (!isVisible) {
      dome.setEnabled(false)
      setCloudShadowMap(null)
      shouldResetHistory = true
      return
    }

    const position = camera.globalPosition
    elapsed += Math.min(0.1, engine.getDeltaTime() / 1000)
    frameIndex = (frameIndex + 1) % 64

    syncTargetSize()
    trackWorldWrap(position)
    updateFrameUniform(position)

    scene.getTransformMatrix().invertToRef(inverseViewProjection)

    renderShadowMap()

    effectRenderer.render(marchWrapper, currentTarget)

    cloudShift.copyFrom(frame.origin).subtractInPlace(previousOrigin)
    effectRenderer.render(resolveWrapper, historyWrite)

    compositeMaterial.setTexture('cloudSampler', historyWrite)
    compositeSetting.set(1 / engine.getRenderWidth(), 1 / engine.getRenderHeight(), frame.visibleRatio, 0)
    compositeMaterial.setVector4('compositeSetting', compositeSetting)
    compositeTexelSize.set(1 / targetWidth, 1 / targetHeight)
    compositeMaterial.setVector2('cloudTexelSize', compositeTexelSize)
    dome.setEnabled(true)

    /** 這一幀寫好的那張，下一幀就是要讀的舊值 */
    const resolvedTarget = historyWrite
    historyWrite = historyRead
    historyRead = resolvedTarget

    /**
     * 把視埠還給主鏡頭
     *
     * EffectRenderer 畫進降解析度的圖時，會把視埠設成那張圖的大小，
     * 畫完也不還原。後製鏈接手時不一定重設視埠，
     * 主畫面就只畫進左下角那一小塊（踩過：整個世界縮在左下四分之一）
     */
    engine.setViewport(camera.viewport)

    previousViewProjection.copyFrom(scene.getTransformMatrix())
    previousCameraPosition.copyFrom(position)
    previousOrigin.copyFrom(frame.origin)
    hasPreviousFrame = true
    shouldResetHistory = false
  }

  /**
   * 掛在「算繪目標都畫完之後」
   *
   * 這個時間點主鏡頭的矩陣已經是這一幀的，水鏡與陰影那些算繪目標也畫完了，
   * 主畫面還沒開始畫。在這裡把三趟畫進自己的目標，
   * 接下來後製鏈的第一支會重新綁上主畫面的緩衝區（PostProcessManager._prepareFrame），
   * 不必自己還原
   */
  const renderObserver = scene.onAfterRenderTargetsRenderObservable.add(() => {
    measureSection('體積雲', renderClouds)
  })

  const stopQualityWatch = watch(preset, () => {
    shouldResetHistory = true
  })

  function dispose(): void {
    noiseRequest.cancel()
    stopQualityWatch()
    scene.onAfterRenderTargetsRenderObservable.remove(renderObserver)
    setCloudShadowMap(null)
    effectRenderer.dispose()
    marchWrapper.dispose()
    resolveWrapper.dispose()
    shadowWrapper.dispose()
    for (const target of [currentTarget, historyRead, historyWrite, shadowTarget]) {
      target.dispose()
    }
    noiseTextureSet?.base.dispose()
    noiseTextureSet?.detail.dispose()
    noiseTextureSet?.weather.dispose()
  }

  scene.onDisposeObservable.addOnce(dispose)

  return { reflectionMaterial, dispose }
}
