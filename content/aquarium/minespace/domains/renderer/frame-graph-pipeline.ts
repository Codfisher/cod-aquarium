import type { AbstractMesh, DirectionalLight, Scene, ShadowGenerator, UniversalCamera } from '@babylonjs/core'
import {
  backbufferColorTextureHandle,
  Color3,
  Constants,
  FrameGraph,
  FrameGraphBloomTask,
  FrameGraphClearTextureTask,
  FrameGraphFXAATask,
  FrameGraphImageProcessingTask,
  FrameGraphLightingVolumeTask,
  FrameGraphObjectRendererTask,
  FrameGraphShadowGeneratorTask,
  FrameGraphVolumetricLightingTask,
  ShadowGenerator as ShadowGeneratorClass,
  ThinImageProcessingPostProcess,
  Vector3,
} from '@babylonjs/core'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'

/**
 * 顏色紋理的建立選項
 *
 * 抄自 Babylon 自己的預設算繪圖（NodeRenderGraph.setToDefault）。
 * 那幾個數字是常數的實際值：3553 是 TEXTURE_2D、0 是無號位元組、5 是 RGBA。
 * size 給一百配上 sizeIsPercentage，代表「跟著畫布一樣大」
 */
const COLOR_TEXTURE_OPTIONS = {
  size: { width: 100, height: 100 },
  sizeIsPercentage: true,
  options: {
    createMipMaps: false,
    targetTypes: [Constants.TEXTURE_2D],
    types: [Constants.TEXTURETYPE_UNSIGNED_BYTE],
    formats: [Constants.TEXTUREFORMAT_RGBA],
    layerCounts: [0],
    samples: 1,
    useSRGBBuffers: [false],
    creationFlags: [0],
    labels: ['scene color'],
  },
}

/** 深度附件，格式必須是深度模板格式，不能拿一張普通的顏色紋理充當 */
const DEPTH_TEXTURE_OPTIONS = {
  size: { width: 100, height: 100 },
  sizeIsPercentage: true,
  options: {
    createMipMaps: false,
    targetTypes: [Constants.TEXTURE_2D],
    types: [Constants.TEXTURETYPE_UNSIGNED_BYTE],
    formats: [Constants.TEXTUREFORMAT_DEPTH24_STENCIL8],
    layerCounts: [0],
    samples: 1,
    useSRGBBuffers: [false],
    creationFlags: [0],
    labels: ['scene depth'],
  },
}

/**
 * 光體網格的細分程度
 *
 * 這個網格是從陰影貼圖重建出來的「光照得到的立體範圍」。
 * 細分越高輪廓越準，但 WebGL2 是靠 CPU 逐點反投影算出來的，
 * 六十四已經是這個場景看不出差別的程度
 */
const LIGHTING_VOLUME_TESSELATION = 64

/**
 * 光體幾幀更新一次
 *
 * WebGL2 沒有 compute shader，Babylon 的退路是把整張陰影貼圖讀回 CPU
 * 再重建網格。兩千零四十八見方的單通道浮點就是十六 MB，
 * 每一幀做一次不可能。
 *
 * 三十幀更新一次，也就是半秒。太陽半秒走零點三度，
 * 光束的形狀跟不上那麼一點點，看不出來
 */
const LIGHTING_VOLUME_FREQUENCY = 30

/** 泛光的參數，與原本 DefaultRenderingPipeline 上調好的一致 */
const BLOOM_WEIGHT = 0.22
const BLOOM_KERNEL = 48
const BLOOM_THRESHOLD = 0.86
const BLOOM_SCALE = 0.5

/**
 * 體積光最強時的光量
 *
 * 這個值乘上光源的顏色就是散射進來的光。一點六會把整個畫面洗白——
 * 散射是沿著整條視線累積的，而視線可能穿過上百格的光體
 */
const MAX_LIGHT_POWER = 0.12

/**
 * 消光係數
 *
 * 光穿過空氣被吸收與散射掉的比例，也就是「越遠越淡」的那個衰減。
 * 沒有它，散射會沿路無限累加，遠處的天空會比近處還亮
 */
const VOLUMETRIC_EXTINCTION_VALUE = 0.03

/**
 * 散射的方向性
 *
 * 零是各向同性，越接近一越集中在光線前進的方向。
 * 空氣中的塵埃是強烈前向散射的——這正是為什麼逆著光看得到光束
 */
const PHASE_G = 0.55

export interface FrameGraphPipeline {
  /** 圖裡那一個陰影產生器，渲染器要拿它登記投影者 */
  readonly shadowGenerator: ShadowGenerator;
  /** 把場景裡的網格接上來。投影者要另外給，水與玻璃不該擋光 */
  setObjectList: (meshList: AbstractMesh[], casterList: AbstractMesh[]) => void;
  /** 設定體積光強度，0 為完全關閉 */
  setStrength: (ratio: number) => void;
  dispose: () => void;
}

interface CreateParams {
  scene: Scene;
  camera: UniversalCamera;
  sunLight: DirectionalLight;
  /** 陰影的設定沿用原本那一套，由外面帶進來套到圖自己建的產生器上 */
  applyShadowSetting: (shadowGenerator: ShadowGenerator) => void;
}

/**
 * 用 FrameGraph 重建整條渲染路徑，並在中間插入體積光
 *
 * 為什麼非得整條重建：v9 的體積光只存在於 FrameGraph。
 * 而 scene.frameGraph 一設下去，scene.render() 就改走圖的路徑，
 * 原本的陰影產生器與 DefaultRenderingPipeline 都不會再被執行——
 * 所以陰影、主場景、泛光、抗鋸齒、色調映射全部得搬進來。
 *
 * 圖的順序就是渲染的順序：
 *
 *   清除 → 陰影 → 主場景（顏色 + 深度）→ 體積光 → 泛光 → 抗鋸齒 → 影像處理 → 畫面
 *
 * 體積光擺在主場景之後、泛光之前：它需要深度才知道光線走到哪裡停，
 * 而散射出來的光要跟著一起被泛光與色調曲線處理，才不會浮在成品上
 */
export async function createFrameGraphPipeline({
  scene,
  camera,
  sunLight,
  applyShadowSetting,
}: CreateParams): Promise<FrameGraphPipeline> {
  const { quality } = useGraphicsQuality()

  const frameGraph = new FrameGraph(scene)

  const colorHandle = frameGraph.textureManager.createRenderTargetTexture(
    'scene-color',
    COLOR_TEXTURE_OPTIONS,
  )
  const depthHandle = frameGraph.textureManager.createRenderTargetTexture(
    'scene-depth',
    DEPTH_TEXTURE_OPTIONS,
  )

  /**
   * 每一幀先把畫布清乾淨
   *
   * classic 的路徑是引擎自己清的，走圖之後得自己來——
   * 少了這一步，上一幀的殘影會一直疊上去
   */
  const clearTask = new FrameGraphClearTextureTask('clear', frameGraph)
  clearTask.targetTexture = colorHandle
  clearTask.depthTexture = depthHandle
  clearTask.clearColor = true
  clearTask.clearDepth = true
  clearTask.clearStencil = true
  clearTask.color = scene.clearColor
  frameGraph.addTask(clearTask)

  const shadowTask = new FrameGraphShadowGeneratorTask('shadow', frameGraph)
  shadowTask.light = sunLight
  shadowTask.camera = camera
  shadowTask.objectList = { meshes: [], particleSystems: [] }
  shadowTask.mapSize = quality.value === 'low' ? 1024 : 2048
  shadowTask.filter = ShadowGeneratorClass.FILTER_PCF
  shadowTask.filteringQuality = quality.value === 'low'
    ? ShadowGeneratorClass.QUALITY_LOW
    : ShadowGeneratorClass.QUALITY_HIGH
  frameGraph.addTask(shadowTask)

  /** 其餘那些沒有在任務上開出來的設定，直接套到產生器本身 */
  applyShadowSetting(shadowTask.shadowGenerator)

  const mainTask = new FrameGraphObjectRendererTask('main', frameGraph, scene)
  mainTask.camera = camera
  mainTask.objectList = { meshes: [], particleSystems: scene.particleSystems }
  mainTask.targetTexture = clearTask.outputTexture
  mainTask.depthTexture = clearTask.outputDepthTexture
  mainTask.shadowGenerators = [shadowTask]
  /**
   * 主場景這一關的影像處理不能關掉
   *
   * 直覺會想關——「鏈尾還有一個 imageProcessingTask，兩邊都做不就套兩次」。
   * 但那是誤解了它的運作：場景的設定被標記成 applyByPostProcess 之後，
   * 材質並不會自己套色調映射，它只做一件事——把輸出轉成線性空間，
   * 好讓後面的後製接手。
   *
   * 關掉的話材質輸出的是 gamma 空間，鏈尾那一關卻當它是線性的再轉一次，
   * 整個畫面會暗掉一階，近白的沙地最明顯
   */
  /** 標記成主要的物件渲染器，圖才知道要用哪一個鏡頭 */
  mainTask.isMainObjectRenderer = true
  frameGraph.addTask(mainTask)

  /**
   * 光體網格交給專屬的任務
   *
   * 它是從陰影貼圖重建出來的「光照得到的立體範圍」，
   * 體積光要靠它才知道光線走到哪裡為止。
   *
   * 這件事有專門的任務，不要自己 new 一個 LightingVolume 再手動 update——
   * 那樣更新的時機會落在圖的外面，而它讀的是陰影貼圖，
   * 必須在陰影那一關畫完之後、體積光之前才對得上
   */
  const lightingVolumeTask = new FrameGraphLightingVolumeTask('lighting-volume', frameGraph)
  lightingVolumeTask.shadowGenerator = shadowTask
  lightingVolumeTask.lightingVolume.tesselation = LIGHTING_VOLUME_TESSELATION
  lightingVolumeTask.lightingVolume.frequency = LIGHTING_VOLUME_FREQUENCY
  frameGraph.addTask(lightingVolumeTask)

  /**
   * 把光體網格移出場景
   *
   * 它是 new Mesh 建的，一出生就躺在 scene.meshes 裡。而主場景那一關
   * 吃的就是 scene.meshes——留著它會被當成一般幾何畫出來，
   * 變成一大片沒有材質的灰白蓋住整個畫面。
   *
   * 移出去之後它照樣能被體積光那一關畫（那裡拿的是任務自己的參照），
   * 而主場景可以直接吃 scene.meshes 的「活參照」——
   * 之後才建的沙地、羊群、營火火焰會自動被包含進來，不必再補呼叫
   */
  scene.removeMesh(lightingVolumeTask.lightingVolume.mesh)

  /**
   * 第三個參數是「啟用消光」
   *
   * 不開的話光線穿過介質完全不衰減，散射沿路一直累加。
   * 我們的投影範圍是八十乘八十乘一百七十格，累積下來足以把整個畫面洗白——
   * 那正是逆光時什麼都看不到的原因
   */
  const volumetricTask = new FrameGraphVolumetricLightingTask('volumetric', frameGraph, true)
  volumetricTask.camera = camera
  volumetricTask.light = sunLight
  volumetricTask.targetTexture = mainTask.outputTexture
  volumetricTask.depthTexture = mainTask.outputDepthTexture
  volumetricTask.lightingVolumeMesh = lightingVolumeTask.outputMeshLightingVolume
  volumetricTask.phaseG = PHASE_G
  volumetricTask.extinction = VOLUMETRIC_EXTINCTION
  volumetricTask.lightPower = new Color3(0, 0, 0)
  volumetricTask.disabled = true
  frameGraph.addTask(volumetricTask)

  const bloomTask = new FrameGraphBloomTask(
    'bloom',
    frameGraph,
    BLOOM_WEIGHT,
    BLOOM_KERNEL,
    BLOOM_THRESHOLD,
    false,
    BLOOM_SCALE,
  )
  bloomTask.sourceTexture = volumetricTask.outputTexture
  bloomTask.disabled = quality.value === 'low'
  frameGraph.addTask(bloomTask)

  const fxaaTask = new FrameGraphFXAATask('fxaa', frameGraph)
  fxaaTask.sourceTexture = bloomTask.outputTexture
  fxaaTask.disabled = quality.value === 'low'
  frameGraph.addTask(fxaaTask)

  /**
   * 色調映射、對比、暗角與色調曲線都在這一關
   *
   * 一定要把場景那一份設定明確交給它，不能讓它自己去生一份。
   * 交出去之後有兩件事同時成立：
   *
   * 一、日夜循環每一幀寫的正是這一份，寫了才有作用。
   * 二、它會把那一份標記成 applyByPostProcess，材質於是知道
   *     「後面還有人要處理我」，改成輸出線性空間。
   *     少了這個標記，材質輸出的是 gamma 空間，這一關再轉一次，
   *     整個畫面會暗掉一階
   */
  const thinImageProcessing = new ThinImageProcessingPostProcess(
    'image-processing',
    frameGraph.engine,
    { imageProcessingConfiguration: scene.imageProcessingConfiguration },
  )
  const imageProcessingTask = new FrameGraphImageProcessingTask(
    'image-processing',
    frameGraph,
    thinImageProcessing,
  )
  imageProcessingTask.sourceTexture = fxaaTask.outputTexture
  imageProcessingTask.targetTexture = backbufferColorTextureHandle
  frameGraph.addTask(imageProcessingTask)

  /**
   * 建圖並等它準備好
   *
   * buildAsync 預設就會一併等待所有任務的著色器編譯完成，
   * 沒等就設 scene.frameGraph 的話，前幾幀會畫不出東西
   */
  await frameGraph.buildAsync()

  scene.frameGraph = frameGraph

  const lightPower = new Color3()

  return {
    shadowGenerator: shadowTask.shadowGenerator,

    setObjectList(meshList, casterList) {
      mainTask.objectList.meshes = meshList
      shadowTask.objectList.meshes = casterList
    },

    setStrength(ratio: number) {
      const strength = quality.value === 'low' ? 0 : ratio

      volumetricTask.disabled = strength <= 0.01
      if (volumetricTask.disabled)
        return

      /**
       * 光量跟著太陽的顏色走
       *
       * 日出是橘的、正午是白的，散射出來的光當然是同一個顏色。
       * 直接乘上光源的 diffuse，晨昏那道光束就自然帶著朝霞的顏色
       */
      lightPower.copyFrom(sunLight.diffuse).scaleInPlace(MAX_LIGHT_POWER * strength)
      volumetricTask.lightPower = lightPower
    },

    dispose() {
      scene.frameGraph = null
      frameGraph.dispose()
    },
  }
}

/** 消光係數，三個通道給同一個值代表空氣不偏色 */
const VOLUMETRIC_EXTINCTION = new Vector3(
  VOLUMETRIC_EXTINCTION_VALUE,
  VOLUMETRIC_EXTINCTION_VALUE,
  VOLUMETRIC_EXTINCTION_VALUE,
)
