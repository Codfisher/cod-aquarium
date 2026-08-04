/** 箱庭場景組裝：引擎、固定 45 度相機、燈光陰影、鱈魚與互動。
 *
 * 本模組只在瀏覽器端動態 import，內部可安全使用 window。
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves'
import { Effect } from '@babylonjs/core/Materials/effect'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PhysicsMotionType, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin'
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate'
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin'
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline'
import { Scene } from '@babylonjs/core/scene'
import { ShadowOnlyMaterial } from '@babylonjs/materials/shadowOnly/shadowOnlyMaterial'
import {
  type CrayonStage,
  createCrayonStage,
  createTypewriterStage,
  type PlanarPoint,
  type TypewriterNoteView,
  type TypewriterStage,
} from './challenge-stage'
import { COD_LYING_LIFT, createCodModel } from './cod-model'
import { FlopController, resolvePointOutsideObstacles } from './flop-controller'
import { attachPaperGrainPlugins, setPaperGrainRimLight } from './paper-grain-plugin'
import { type AccessoryHandle, createAccessory } from './rewards/accessory-builder'
import { rewardDefinitionMap, type RewardId } from './rewards/reward-registry'
import {
  CAMERA_FRAME_RECT,
  createTankEnvironment,
  GROUND_Y,
  type InteractionSpotKey,
  MOVE_BOUNDS_RECT,
  PHYSICS_GROUP_DEBRIS,
  PHYSICS_GROUP_FISH,
  PHYSICS_GROUP_SEAWEED,
  PHYSICS_GROUP_STATIC,
  TANK_DEPTH,
  TANK_WIDTH,
  WALL_HEIGHT,
} from './tank-environment'
import '@babylonjs/core/Culling/ray'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'
import '@babylonjs/core/Physics/v2/physicsEngineComponent'
import '@babylonjs/core/Rendering/depthRendererSceneComponent'
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent'
import '@babylonjs/core/Rendering/outlineRenderer'

/** 魚停在可互動裝飾旁時的回報資料 */
export interface NearbyInteractionInfo {
  key: InteractionSpotKey;
  /** popup 錨點投影在畫布上的水平位置比例（0 ~ 1） */
  xRatio: number;
  /** popup 錨點投影在畫布上的垂直位置比例（0 ~ 1） */
  yRatio: number;
}

export interface DioramaSceneOptions {
  isDark: boolean;
  /** 魚停在可互動裝飾旁時回報錨點畫面位置；離開或移動中回報 null，供外層收合 popup */
  onNearbySpotChange?: (info: NearbyInteractionInfo | null) => void;
}

export type { PlanarPoint, TypewriterNoteView } from './challenge-stage'

/** 打字機挑戰的 3D 舞台操作介面（Vue 端透過 props 取用） */
export interface TypewriterStageHandle {
  enter: () => void;
  exit: () => void;
  syncNoteList: (noteViewList: TypewriterNoteView[]) => void;
  setPaperText: (lineList: string[], currentLine: string) => void;
  playMiss: () => void;
  playSuccess: () => void;
}

/** 畫室挑戰的 3D 舞台操作介面（Vue 端透過 props 取用）。
 * pickCanvasPoint 收 client 座標，內部換算成畫布 viewBox 座標（320 × 220）
 */
export interface CrayonStageHandle {
  enter: (outlinePointList: readonly PlanarPoint[]) => void;
  exit: () => void;
  pickCanvasPoint: (clientX: number, clientY: number) => PlanarPoint | null;
  beginStroke: (point: PlanarPoint, color: string) => void;
  strokeTo: (point: PlanarPoint) => void;
  endStroke: () => void;
  clearCanvas: () => void;
  finishArtwork: (fillColor: string) => void;
  setCrayonColor: (color: string) => void;
}

/** 快門挑戰用的魚即時資訊：投影到畫布的位置比例與跳躍高度比例 */
export interface FishShotInfo {
  xRatio: number;
  yRatio: number;
  /** 離地高度 / 滿力跳最高點（0 = 貼地、1 = 最高點附近） */
  heightRatio: number;
}

export interface DioramaSceneHandle {
  /** 底層引擎。迷你遊戲宿主借用同一個 Engine 開自己的 Scene，
   * 箱庭 Scene 留在記憶體不重建，玩完回來是瞬間的
   */
  engine: Engine;
  /** 開關渲染迴圈（不可見或失焦時停止） */
  setRunning: (value: boolean) => void;
  setDarkMode: (value: boolean) => void;
  /** 快門挑戰模式：魚自動四處跳、停用點擊移動與停靠 popup */
  setCameraChallengeActive: (value: boolean) => void;
  /** 快門挑戰：取得魚當前投影位置與跳躍高度，供取景判定 */
  getFishShotInfo: () => FishShotInfo | null;
  /** 快門挑戰：以魚為中心截下場景畫面，回傳 dataURL（拍立得用）；失敗回傳 null */
  captureFishSnapshot: () => string | null;
  /** 快門挑戰：按下快門時 3D 相機閃燈演出，拍到清晰照再加彈跳＋彩帶 */
  playCameraShutterFeedback: (isSharpShot: boolean) => void;
  /** 播放指定裝飾的展示動畫（打字機挑戰的按鍵回饋用） */
  playSpotShowcase: (key: InteractionSpotKey) => void;
  /** 設定裝飾鎖定狀態：鎖定呈灰白紙模＋鎖頭旗標；skipTransition 供載入時直接套用 */
  setSpotLocked: (key: InteractionSpotKey, isLocked: boolean, skipTransition?: boolean) => void;
  /** 解鎖慶祝：裝飾彈跳＋展示動畫＋大水花＋彩帶 */
  celebrateSpotUnlock: (key: InteractionSpotKey) => void;
  /** 全部解鎖的慶典：魚戴上皇冠＋整池彩帶＋開心翻滾跳 */
  celebrateFullUnlock: () => void;
  /** 皇冠顯示（全解鎖徽章）。skipTransition 供載入時直接套用 */
  setCrownVisible: (visible: boolean, skipTransition?: boolean) => void;
  /** 深夜訪客模式：魚戴上睡帽 */
  setSleepyMode: (enabled: boolean) => void;
  /** 套用玩家穿戴中的高分配件。傳完整清單，內部做差異更新 */
  setEquippedAccessoryList: (rewardIdList: readonly RewardId[]) => void;
  /** 打字機挑戰的 3D 舞台：進出場會帶鏡頭推近／拉回 */
  typewriterStage: TypewriterStageHandle;
  /** 畫室挑戰的 3D 舞台：進出場會帶鏡頭推近／拉回 */
  crayonStage: CrayonStageHandle;
  /** 容器尺寸變更時重設緩衝區並重新取景 */
  resize: () => void;
  dispose: () => void;
}

/** 相機俯視角（beta，與 +Y 軸夾角）。π/4 為 45°，愈接近 π/2 愈水平 */
const CAMERA_BETA = Math.PI / 3
/** 鱈魚整體縮放 */
const FISH_SCALE = 0.8
/** 側躺角：讓背鰭朝向鏡頭、單眼朝天 */
const LYING_ROLL = -Math.PI / 2
/** 初始側躺朝向（rad）。橫向與直向兩顆相機方位角差 90°，加上魚側躺繞 Y 轉會換到不同側面，
 * 故兩種取景的起始角分開設定。每 ±Math.PI/2 讓魚在畫面上轉 90°，+Math.PI 頭轉到相反方向。
 * 覺得魚頭朝著自己就調對應的那個。
 */
const INITIAL_HEADING_LANDSCAPE = Math.PI / 4 * 5
const INITIAL_HEADING_PORTRAIT = Math.PI / 3 * 5
/** 魚身避讓障礙的額外邊界（加在障礙半徑上）。魚身長約 2 單位、避障以中心為準，
 * 這裡需涵蓋魚半身長度避免身體/尾巴插進障礙；還會穿模就再加大。
 */
const FISH_COLLISION_MARGIN = 0.9
/** 魚身中心到裝飾邊緣小於此距離且停下時，觸發互動 popup。
 * 魚避障後最近只能停在裝飾邊緣外約 FISH_COLLISION_MARGIN 處，此值需略大於它；
 * 點在裝飾旁的地板時落點會更遠一些，再放寬一截才不會差一點點就不觸發
 */
const INTERACTION_TRIGGER_DISTANCE = 1.6
/** 單幀 dt 上限（ms），比照 bg-flock 避免掉幀時瞬移 */
const MAX_FRAME_DELTA_MS = 34
/** 點擊判定：pointer 位移小於此值（px）才視為點擊而非拖曳/捲動 */
const TAP_DISTANCE_THRESHOLD = 8
/** 滑鼠視差：游標偏離畫面中心時鏡頭方位角/俯角的最大偏移（rad）。
 * 幅度刻意極小，只求「探頭看箱庭」的立體感，不能大到影響取景與暈眩
 */
const PARALLAX_ALPHA_RANGE = 0.035
const PARALLAX_BETA_RANGE = 0.02
const PARALLAX_LERP_RATE = 3
/** 挑戰舞台鏡頭聚焦：過渡速率與俯角補償（推近時視角略放平，看清楚工作檯） */
const STAGE_FOCUS_BLEND_RATE = 3
const STAGE_FOCUS_BETA_OFFSET = 0.12
/** 魚的進場演出：先讓擺設彈出再落魚（秒）、落下重力。
 * 重力比真實值大，下墜節奏才不拖泥帶水
 */
const FISH_ENTRANCE_DELAY_SECONDS = 0.55
const FISH_ENTRANCE_GRAVITY = 26
/** 起始高度依取景動態解算（保證在畫面外）；解算前先藏在遠高於任何取景的天上 */
const FISH_ENTRANCE_HIDDEN_HEIGHT = 40
/** 起始高度需高出畫面頂端的邊距（畫面高度比例） */
const FISH_ENTRANCE_OFFSCREEN_MARGIN_RATIO = 0.12
/** 進場落地的擠壓緩衝時長（秒）與擠壓量 */
const FISH_ENTRANCE_SQUASH_DURATION = 0.24
const FISH_ENTRANCE_SQUASH_AMOUNT = 0.2
/** 快門挑戰自動遊走的目標距離下限：跳得夠遠，跳躍弧線才夠明顯好拍 */
const CAMERA_WANDER_MIN_DISTANCE = 2.2
/** 魚的滿力跳高（FlopController 設定值），供快門挑戰換算跳躍高度比例 */
const FISH_HOP_HEIGHT = 0.85
/** 拍立得快照：以魚為中心的取景範圍（渲染畫面高度比例）與輸出上限。
 * 關鍵：實際輸出尺寸取「裁切區的裝置像素數」與上限的較小值，永遠不放大來源，
 * 照片才不會糊。取景比例不能太小，否則裁切區像素太少、放大檢視時就模糊
 */
const SNAPSHOT_MAX_OUTPUT = 480
const SNAPSHOT_CROP_HEIGHT_RATIO = 0.38
/** 拖曳魚：拎起高度與平滑速率（每秒收斂比例基準） */
const DRAG_LIFT_HEIGHT = 1.6
const DRAG_LIFT_RATE = 8
const DRAG_FOLLOW_RATE = 10
/** 放開後的下墜重力，略小於進場重力、落感較輕盈 */
const DRAG_FALL_GRAVITY = 20

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createDioramaScene(
  canvas: HTMLCanvasElement,
  options: DioramaSceneOptions,
): DioramaSceneHandle {
  // doNotHandleTouchAction：Engine 預設會把 canvas inline style 設成 touch-action: none，
  // 蓋掉樣式表的 pan-y，導致觸控無法在魚缸區直向捲動頁面。場景只需點擊，不需要 Babylon 手勢
  const engine = new Engine(canvas, true, { alpha: true, doNotHandleTouchAction: true }, false)
  // 內部渲染解析度至少 1.5 倍、上限 2 倍（超取樣）：一般桌面螢幕 dpr = 1，
  // 光靠 MSAA＋FXAA 壓不掉高對比硬邊的階梯感；低多邊形場景填充成本低，
  // 用解析度換邊緣品質最划算
  engine.setHardwareScalingLevel(1 / Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2))

  const scene = new Scene(engine)
  // 背景交給 CSS 漸層，canvas 保持透明
  scene.clearColor = new Color4(0, 0, 0, 0)

  const camera = new ArcRotateCamera(
    'dioramaCamera',
    -Math.PI / 2,
    CAMERA_BETA,
    14,
    new Vector3(0, 0.7, 0),
    scene,
  )
  camera.fov = 0.7

  // 影像處理：對比微調 + FXAA。
  // 景深（DOF）已停用：失焦溢光會在物體邊緣產生明顯白色光暈
  const pipeline = new DefaultRenderingPipeline('dioramaPipeline', true, scene, [camera])
  pipeline.depthOfFieldEnabled = false
  pipeline.imageProcessingEnabled = true
  // 對比刻意收斂：柔和陰天感，不要正午烈日
  pipeline.imageProcessing.contrast = 1.05
  pipeline.imageProcessing.exposure = 1
  // 後處理管線會繞過 canvas 原生 MSAA：改開管線自身的 MSAA（WebGL2，幾何硬邊主力），
  // 再疊 FXAA 收掉殘餘閃爍。只靠 FXAA 對低多邊形硬邊效果很差、鋸齒明顯
  pipeline.samples = 4
  pipeline.fxaaEnabled = true

  // 質感細調：暗角聚焦視線（染暗藍紫呼應 split toning）、
  // 輕微動態膠片顆粒（與紙紋同語彙）、銳化補償 FXAA 的細節損失、
  // 邊緣極輕色散帶出鏡頭感
  pipeline.imageProcessing.vignetteEnabled = true
  pipeline.imageProcessing.vignetteWeight = 1.1
  pipeline.imageProcessing.vignetteColor = new Color4(0.09, 0.08, 0.18, 0)
  // 銳化壓到極輕：高對比邊緣過銳會產生白暈（像烈日反光）
  pipeline.sharpenEnabled = true
  pipeline.sharpen.edgeAmount = 0.06
  pipeline.grainEnabled = true
  pipeline.grain.intensity = 6
  pipeline.grain.animated = true
  pipeline.chromaticAberrationEnabled = true
  pipeline.chromaticAberration.aberrationAmount = 6
  pipeline.chromaticAberration.radialIntensity = 0.85
  // Split toning：亮部染暖橘、暗部染藍紫，整體光影冷暖對比更豐富。
  // 用後製 ColorCurves 統一處理，日夜模式都吃得到，不用逐一調材質
  const splitToningCurves = new ColorCurves()
  splitToningCurves.highlightsHue = 32
  splitToningCurves.highlightsDensity = 20
  splitToningCurves.highlightsSaturation = 14
  // 染色會推高亮部亮度，曝光往回收避免過曝
  splitToningCurves.highlightsExposure = -14
  splitToningCurves.shadowsHue = 264
  splitToningCurves.shadowsDensity = 38
  splitToningCurves.shadowsSaturation = 28
  pipeline.imageProcessing.colorCurvesEnabled = true
  pipeline.imageProcessing.colorCurves = splitToningCurves

  // SSAO：物體接縫、凹角與貼地處產生柔和環境遮蔽，接地感與體積感明顯提升。
  // 走 geometry buffer（非 prepass），避開透明 canvas＋MSAA 管線的相容性問題；
  // 在此建立（描邊之前），AO 疊在色調處理後的畫面上、鉛筆線條保持在最上層。
  // WebGL1 不支援就跳過，畫面只是少了 AO
  if (SSAO2RenderingPipeline.IsSupported) {
    const ssaoPipeline = new SSAO2RenderingPipeline(
      'dioramaSsaoPipeline',
      scene,
      { ssaoRatio: 0.5, blurRatio: 1 },
      [camera],
      true,
    )
    // 低多邊小場景：取樣半徑貼近物件尺度，強度壓在陰影提示而非髒污的程度
    ssaoPipeline.radius = 0.8
    ssaoPipeline.totalStrength = 0.68
    ssaoPipeline.samples = 12
    ssaoPipeline.expensiveBlur = true
    // 相機距離 14，場景深度不超過此值；限制範圍讓遠景不吃 AO 雜訊
    ssaoPipeline.maxZ = 45
  }

  // 移軸微縮（tilt-shift）：畫面上下緣漸進模糊、中央保持清晰帶。
  // 微縮感 = 俯視＋淺景深＋高對比（後兩者已有），這裡補上模糊。
  // 用螢幕空間垂直漸層而非深度 DOF，避開先前失焦溢光的邊緣光暈問題
  Effect.ShadersStore.tiltShiftFragmentShader = /* glsl */ `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 texelSize;

    // 清晰帶中心（0 = 畫面底、1 = 頂）、半高、過渡帶與最大模糊半徑（px）
    const float FOCUS_CENTER_Y = 0.52;
    const float FOCUS_HALF_HEIGHT = 0.12;
    const float FOCUS_FALLOFF = 0.3;
    const float MAX_BLUR_RADIUS = 10.0;

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
  const tiltShiftPostProcess = new PostProcess('tiltShift', 'tiltShift', ['texelSize'], null, 1, camera)
  tiltShiftPostProcess.onApply = (effect) => {
    effect.setFloat2(
      'texelSize',
      1 / Math.max(1, tiltShiftPostProcess.width),
      1 / Math.max(1, tiltShiftPostProcess.height),
    )
  }

  const hemisphericLight = new HemisphericLight(
    'dioramaHemisphericLight',
    new Vector3(0.2, 1, 0.1),
    scene,
  )
  // 天光偏暖橘、地光偏藍紫，讓每個面隨朝向產生冷暖明暗層次，
  // 這是低多邊 flat shading 顯得豐富（而非死板純色）的關鍵
  hemisphericLight.diffuse = new Color3(1, 0.9, 0.74)
  hemisphericLight.groundColor = new Color3(0.33, 0.32, 0.52)

  const directionalLight = new DirectionalLight(
    'dioramaSunLight',
    new Vector3(-0.45, -1, -0.35).normalize(),
    scene,
  )
  directionalLight.position = new Vector3(7, 12, 6)
  directionalLight.diffuse = new Color3(1, 0.9, 0.76)

  // 對側藍紫補光，讓背光面不死黑、立體感更明確
  const fillLight = new DirectionalLight(
    'dioramaFillLight',
    new Vector3(0.5, -0.55, 0.45).normalize(),
    scene,
  )
  fillLight.diffuse = new Color3(0.58, 0.56, 0.92)
  fillLight.specular = new Color3(0, 0, 0)

  // 假 GI：地面反彈光。由下往上的暖沙色低強度平行光，
  // 近似陽光打在沙地後的一次間接反射，物體底面不再死暗、與場景更融合。
  // 即時完整 GI 對內嵌部落格場景太重，反彈光是風格化場景的標準近似
  const bounceLight = new DirectionalLight(
    'dioramaBounceLight',
    new Vector3(0.15, 1, 0.1).normalize(),
    scene,
  )
  bounceLight.diffuse = Color3.FromHexString('#e2c49a')
  bounceLight.specular = new Color3(0, 0, 0)
  bounceLight.intensity = 0.22

  const shadowGenerator = new ShadowGenerator(1024, directionalLight)
  shadowGenerator.usePercentageCloserFiltering = true
  // 陰影不全黑：留近半環境光，柔和陰天的影子
  shadowGenerator.setDarkness(0.45)

  // 大地板：只顯示陰影的材質，承接浮島落下的接觸陰影把場景接地，同時保留透明畫布的 CSS 漸層背景
  const groundFloor = CreateGround(
    'dioramaGroundFloor',
    { width: TANK_WIDTH * 3, height: TANK_DEPTH * 3 },
    scene,
  )
  groundFloor.position.y = GROUND_Y
  groundFloor.receiveShadows = true
  // 大地板承接點擊移動與游標注視的 pick；可互動裝飾另外開放 pick（見 handlePointerUp）
  groundFloor.isPickable = true
  const groundFloorMaterial = new ShadowOnlyMaterial('dioramaGroundFloorMaterial', scene)
  groundFloorMaterial.activeLight = directionalLight
  // 陰影色跟著暗部走藍紫，與整體 split toning 一致
  groundFloorMaterial.shadowColor = Color3.FromHexString('#242045')
  // 陰影是跳躍高度的主要視覺線索（魚離地時影子分離），不能太淡；
  // 但也別太黑，柔光景的接觸陰影點到為止
  groundFloorMaterial.alpha = 0.24
  groundFloor.material = groundFloorMaterial

  const environment = createTankEnvironment(scene)
  const codModel = createCodModel(scene)

  // --- 彩蛋配件：皇冠（全解鎖徽章）與睡帽（深夜訪客），掛在側躺節點頭頂跟著身體動作 ---
  const crownMaterial = new StandardMaterial('codCrownMaterial', scene)
  crownMaterial.diffuseColor = Color3.FromHexString('#e8b54a')
  crownMaterial.emissiveColor = Color3.FromHexString('#e8b54a').scale(0.3)
  crownMaterial.specularColor = new Color3(0, 0, 0)

  const crownNode = new TransformNode('codCrown', scene)
  crownNode.parent = codModel.lieNode
  crownNode.position.set(0, 0.3, 0.62)
  crownNode.rotation.x = -0.12
  const crownBand = CreateCylinder('codCrownBand', { diameter: 0.34, height: 0.14, tessellation: 8 }, scene)
  crownBand.material = crownMaterial
  crownBand.isPickable = false
  crownBand.parent = crownNode
  for (let spikeIndex = 0; spikeIndex < 4; spikeIndex++) {
    const spike = CreateCylinder(
      `codCrownSpike${spikeIndex}`,
      { diameterTop: 0.004, diameterBottom: 0.1, height: 0.16, tessellation: 4 },
      scene,
    )
    const spikeAngle = (spikeIndex / 4) * Math.PI * 2
    spike.position.set(Math.cos(spikeAngle) * 0.12, 0.14, Math.sin(spikeAngle) * 0.12)
    spike.material = crownMaterial
    spike.isPickable = false
    spike.parent = crownNode
  }

  const nightcapMaterial = new StandardMaterial('codNightcapMaterial', scene)
  nightcapMaterial.diffuseColor = Color3.FromHexString('#41518a')
  nightcapMaterial.emissiveColor = Color3.FromHexString('#41518a').scale(0.12)
  nightcapMaterial.specularColor = new Color3(0, 0, 0)
  const nightcapBobbleMaterial = new StandardMaterial('codNightcapBobbleMaterial', scene)
  nightcapBobbleMaterial.diffuseColor = Color3.FromHexString('#f2efe6')
  nightcapBobbleMaterial.specularColor = new Color3(0, 0, 0)

  const nightcapNode = new TransformNode('codNightcap', scene)
  nightcapNode.parent = codModel.lieNode
  nightcapNode.position.set(0, 0.28, 0.62)
  // 帽尖歪一邊的慵懶感
  nightcapNode.rotation.z = 0.45
  const nightcapCone = CreateCylinder(
    'codNightcapCone',
    { diameterTop: 0.05, diameterBottom: 0.32, height: 0.4, tessellation: 8 },
    scene,
  )
  nightcapCone.position.y = 0.16
  nightcapCone.material = nightcapMaterial
  nightcapCone.isPickable = false
  nightcapCone.parent = nightcapNode
  const nightcapBobble = CreateSphere('codNightcapBobble', { diameter: 0.12, segments: 6 }, scene)
  nightcapBobble.position.y = 0.38
  nightcapBobble.material = nightcapBobbleMaterial
  nightcapBobble.isPickable = false
  nightcapBobble.parent = nightcapNode

  /** 配件顯示狀態：皇冠與睡帽互斥（睡帽優先），縮放平滑彈出/收起 */
  let crownVisible = false
  let sleepyActive = false
  let crownScale = 0
  let nightcapScale = 0
  crownNode.setEnabled(false)
  nightcapNode.setEnabled(false)

  /** 慶典模式的天空彩帶雨跟皇冠同一套判斷：戴皇冠才下、深夜訪客模式摘皇冠時跟著停 */
  function syncSkyConfetti() {
    environment.setSkyConfettiActive(crownVisible && !sleepyActive)
  }

  /** 高分解鎖的穿戴配件。與皇冠/睡帽並存：皇冠佔頭部時，
   * 玩家自選的頭部配件先讓位，摘掉皇冠才會回來
   */
  const equippedAccessoryMap = new Map<RewardId, AccessoryHandle>()

  /** 卡通描邊色。配件新建的網格也要沿用，才與箱庭其他紙模同一語彙 */
  const outlineColor = Color3.FromHexString('#2c2747')

  function setEquippedAccessoryList(rewardIdList: readonly RewardId[]) {
    const nextRewardIdSet = new Set(rewardIdList)
    for (const [rewardId, handle] of equippedAccessoryMap) {
      if (!nextRewardIdSet.has(rewardId)) {
        handle.dispose()
        equippedAccessoryMap.delete(rewardId)
      }
    }
    for (const rewardId of rewardIdList) {
      if (equippedAccessoryMap.has(rewardId)) {
        continue
      }
      const handle = createAccessory(scene, codModel.lieNode, rewardId)
      // 新建的網格要補上描邊與投影，否則配件會像浮貼在魚身上的色塊
      for (const accessoryMesh of handle.node.getChildMeshes()) {
        accessoryMesh.renderOutline = true
        accessoryMesh.outlineWidth = 0.006
        accessoryMesh.outlineColor = outlineColor
        shadowGenerator.addShadowCaster(accessoryMesh)
      }
      equippedAccessoryMap.set(rewardId, handle)
    }
  }

  function updateAccessoryList(deltaSeconds: number) {
    // 玩家自己解鎖、戴上的頭部配件優先於皇冠：皇冠是全解鎖徽章，
    // 不該讓最努力玩的玩家反而永遠戴不了自己解鎖的東西
    const hasPlayerHeadAccessory = Array.from(equippedAccessoryMap.values()).some(
      (handle) => rewardDefinitionMap[handle.rewardId].slot === 'head',
    )
    const crownTarget = crownVisible && !sleepyActive && !hasPlayerHeadAccessory ? 1 : 0
    const nightcapTarget = sleepyActive ? 1 : 0
    const lerp = Math.min(1, deltaSeconds * 6)
    crownScale += (crownTarget - crownScale) * lerp
    nightcapScale += (nightcapTarget - nightcapScale) * lerp
    crownNode.setEnabled(crownScale > 0.02)
    nightcapNode.setEnabled(nightcapScale > 0.02)
    crownNode.scaling.setAll(Math.max(0.001, crownScale))
    nightcapNode.scaling.setAll(Math.max(0.001, nightcapScale))

    // 頭頂只容得下一件：睡帽（深夜訪客模式）現身時，玩家的頭部配件縮起來讓位；
    // 皇冠則反過來讓給玩家的頭部配件（見上）
    const isHeadOccupied = nightcapScale > 0.02
    const isFishMoving = flopController.isMoving
    for (const handle of equippedAccessoryMap.values()) {
      const shouldYield = isHeadOccupied && rewardDefinitionMap[handle.rewardId].slot === 'head'
      const targetScale = shouldYield ? 0 : 1
      const currentScale = handle.node.scaling.x
      const nextScale = currentScale + (targetScale - currentScale) * lerp
      handle.node.setEnabled(nextScale > 0.02)
      handle.node.scaling.setAll(Math.max(0.001, nextScale))
      handle.update?.(deltaSeconds, isFishMoving)
    }
  }

  // 光槽：半球光＋主光＋補光＋反彈光＋螢火 clustered 容器共 5 盞，
  // 超過 StandardMaterial 預設上限 4，得拉高才不會有燈被擠掉
  for (const material of scene.materials) {
    if ('maxSimultaneousLights' in material) {
      (material as StandardMaterial).maxSimultaneousLights = 6
    }
  }

  // 卡通描邊：Babylon 內建 OutlineRenderer（內縮外殼式），
  // 細線深藍紫，讓紙模們像被細筆勾過邊
  for (const outlinedMesh of [...codModel.meshList, ...environment.shadowCasterMeshList]) {
    // billboard 貼圖面（鎖頭旗標等 UI 感元素）不描邊，描了會像貼紙鑲黑框
    if (outlinedMesh.billboardMode !== TransformNode.BILLBOARDMODE_NONE) {
      continue
    }
    outlinedMesh.renderOutline = true
    outlinedMesh.outlineWidth = 0.006
    outlinedMesh.outlineColor = outlineColor
  }

  // 魚身可點擊：點到魚時驚嚇彈跳、往隨機方向躍開（handlePointerUp 依 metadata 辨認）
  for (const mesh of codModel.meshList) {
    mesh.isPickable = true
    mesh.metadata = { isFishBody: true }
  }

  for (const mesh of [...codModel.meshList, ...environment.shadowCasterMeshList]) {
    shadowGenerator.addShadowCaster(mesh)
  }

  // 跳高與滯空刻意偏大：畫面同時有前進位移與身體扭動，跳躍弧線要夠明顯才讀得出來
  const flopController = new FlopController({
    hopDistance: 0.95,
    hopHeight: FISH_HOP_HEIGHT,
    hopDuration: 0.42,
  })

  // 障礙圓（石頭/搖桿/相機）加上魚身邊界後交給移動控制器，魚會繞行且落點不踩進去
  const obstacleList = environment.obstacleList.map((obstacle) => ({
    x: obstacle.x,
    z: obstacle.z,
    radius: obstacle.radius + FISH_COLLISION_MARGIN,
  }))
  flopController.setObstacleList(obstacleList)
  flopController.setMoveBounds(MOVE_BOUNDS_RECT)

  /** 場景已銷毀旗標：非同步資源（紙紋、Havok WASM）載入完成時若已銷毀就不再初始化 */
  let isDisposed = false

  // --- 表面著色外掛 ---
  // 走 low poly：表面不鋪任何顆粒紋理，形體完全由切面的明暗讀出。
  // 外掛留著是為了輪廓光——面向邊緣的提亮能把物件從背景托出，
  // 在 flat shading 下呈塊面提亮，正是切面之間彼此分明的關鍵
  attachPaperGrainPlugins(scene)

  // --- Havok 物理（非同步載入 WASM）---
  // 就緒後：水草葉片轉動態剛體被魚推開、彈簧回正；載入失敗保留手動推草，場景照常運作
  let fishColliderMesh: Mesh | undefined
  let fishAggregate: PhysicsAggregate | undefined

  import('@babylonjs/havok')
    .then(async (havokModule) => havokModule.default())
    .then((havokInstance) => {
      if (isDisposed) {
        return
      }
      const havokPlugin = new HavokPlugin(true, havokInstance)
      scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin)
      // 物理子步進：預設每幀單步（16.7ms）積分，剛性彈簧＋接觸互搶時
      // 解算器收斂不了會高頻抖動（魚壓住水草）；切成 4ms 小步讓每幀
      // 跑約 4 次解算，彈簧與接觸能在步內達成平衡。場景剛體極少，成本可忽略
      scene.getPhysicsEngine()?.setSubTimeStep(2)

      // 大地板剛體：倒伏的葉片靠在上面、卵石在上面滾動
      const groundAggregate = new PhysicsAggregate(groundFloor, PhysicsShapeType.BOX, { mass: 0 }, scene)
      groundAggregate.shape.filterMembershipMask = PHYSICS_GROUP_STATIC
      groundAggregate.shape.filterCollideMask = PHYSICS_GROUP_SEAWEED | PHYSICS_GROUP_DEBRIS

      // 魚的 kinematic 碰撞體：複製魚身幾何的隱形網格＋凸包，
      // 貼合整條魚（含頭尾）——葉片被擋在真實身形之外，不會穿模。
      // 不能直接掛在 bodyMesh 上：剛體會把世界座標寫回有 parent 的
      // 節點的 local transform，造成模型部件分家；改用無 parent 的
      // 複製網格，每幀同步魚身世界姿態（見 updateFish）
      fishColliderMesh = codModel.bodyMesh.clone('dioramaFishCollider')
      fishColliderMesh.setParent(null)
      fishColliderMesh.isVisible = false
      fishColliderMesh.isPickable = false
      fishColliderMesh.metadata = null
      fishAggregate = new PhysicsAggregate(
        fishColliderMesh,
        PhysicsShapeType.CONVEX_HULL,
        { mass: 1 },
        scene,
      )
      fishAggregate.body.setMotionType(PhysicsMotionType.ANIMATED)
      // 每幀把節點姿態同步進物理世界（kinematic 追隨）
      fishAggregate.body.disablePreStep = false
      fishAggregate.shape.filterMembershipMask = PHYSICS_GROUP_FISH
      fishAggregate.shape.filterCollideMask = PHYSICS_GROUP_SEAWEED | PHYSICS_GROUP_DEBRIS

      environment.enablePhysics()
    })
    .catch((error) => {
      console.warn('[fish-diorama] Havok 物理載入失敗，改用簡易推草效果', error)
    })

  /** 取景基準方位角，滑鼠視差以此為中心微幅偏移 */
  let baseCameraAlpha = -Math.PI / 2
  /** applyCameraFraming 算出的取景距離（舞台聚焦的混合基準） */
  let framedCameraRadius = 14
  /** 挑戰舞台聚焦目標；null = 一般取景。activeStageFocus 保留最後目標供退場過渡 */
  let stageFocus: { x: number; y: number; z: number; radius: number } | null = null
  let activeStageFocus: { x: number; y: number; z: number; radius: number } | null = null
  let stageFocusBlend = 0

  function setStageFocus(focus: { x: number; y: number; z: number; radius: number } | null) {
    stageFocus = focus
    if (focus) {
      activeStageFocus = focus
    }
  }

  /** 依畫面比例取景：直式改從側邊看（畫面水平對應缸身長邊） */
  function applyCameraFraming() {
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight())
    const isPortrait = aspect < 0.9

    baseCameraAlpha = isPortrait ? Math.PI : -Math.PI / 2
    camera.alpha = baseCameraAlpha
    environment.setPortrait(isPortrait)

    const horizontalHalf = (isPortrait ? TANK_DEPTH : TANK_WIDTH) / 2
    const verticalHalf = (isPortrait ? TANK_WIDTH : TANK_DEPTH) / 2
    // 取景以裝飾群核心區為準，不隨魚的可移動範圍擴大而拉遠鏡頭
    const playableHorizontalHalf = isPortrait
      ? CAMERA_FRAME_RECT.maxZ
      : CAMERA_FRAME_RECT.maxX

    const tanHalfVertical = Math.tan(camera.fov / 2)
    const tanHalfHorizontal = tanHalfVertical * aspect

    // 依俯角把地面深度與缸壁高度投影到畫面垂直方向的粗略估計。
    // 愈水平（beta 愈大）地面壓得愈扁、缸壁佔的垂直空間愈多
    const cameraPitch = Math.PI / 2 - CAMERA_BETA
    const projectedVerticalHalf
      = verticalHalf * Math.sin(cameraPitch) + WALL_HEIGHT * Math.cos(cameraPitch) * 0.5 + 1
    const distanceForHeight = projectedVerticalHalf / tanHalfVertical
    const distanceForPlayable = (playableHorizontalHalf + 0.7) / tanHalfHorizontal
    const distanceForFullWidth = (horizontalHalf + 1) / tanHalfHorizontal

    const baseRadius = Math.max(distanceForHeight, distanceForPlayable)
    // 寬度放得下就完整入鏡；差太多寧可裁掉缸緣，避免整缸縮太小
    framedCameraRadius = distanceForFullWidth <= baseRadius * 1.4
      ? Math.max(baseRadius, distanceForFullWidth)
      : baseRadius
    camera.radius = framedCameraRadius
  }

  applyCameraFraming()

  // 初始側躺：頭朝畫面水平方向、背鰭面向鏡頭。橫/直取景畫面水平方向不同，分開給角度
  const isPortraitFraming = baseCameraAlpha === Math.PI
  flopController.teleport(
    { x: 0, z: 0 },
    isPortraitFraming ? INITIAL_HEADING_PORTRAIT : INITIAL_HEADING_LANDSCAPE,
  )

  /** 目前是否為夜間模式（拍立得快照的底色跟著切換） */
  let isDarkModeActive = options.isDark

  function setDarkMode(value: boolean) {
    isDarkModeActive = value
    // 月夜藍風格化夜景：畫面依然清晰明亮，只是整體換上冷藍色調（動森式）。
    // 主光轉淡藍月光、環境光偏藍紫；陰影維持原本的柔和平行光影，
    // 亮點交給路燈柔光暈與螢火點綴
    // 白天走柔和天光：環境光抬高、主光壓低，明暗差縮小不像烈日直射
    hemisphericLight.intensity = value ? 0.62 : 0.8
    hemisphericLight.diffuse = value
      ? Color3.FromHexString('#aec4e8')
      : new Color3(1, 0.9, 0.74)
    hemisphericLight.groundColor = value
      ? Color3.FromHexString('#35305e')
      : new Color3(0.33, 0.32, 0.52)
    directionalLight.intensity = value ? 0.72 : 0.68
    directionalLight.diffuse = value
      ? Color3.FromHexString('#c4d4f2')
      : new Color3(1, 0.9, 0.76)
    fillLight.intensity = value ? 0.35 : 0.3
    fillLight.diffuse = value
      ? Color3.FromHexString('#8c85ec')
      : new Color3(0.58, 0.56, 0.92)
    // 夜間反彈光換月光在地面的冷藍反射，強度也壓低
    bounceLight.intensity = value ? 0.14 : 0.22
    bounceLight.diffuse = value
      ? Color3.FromHexString('#55628f')
      : Color3.FromHexString('#e2c49a')
    // 輪廓光：白天暖奶油色、夜晚月光藍（夜晚略強，暗景更需要輪廓托底）
    setPaperGrainRimLight(
      value ? Color3.FromHexString('#8ea4ff') : Color3.FromHexString('#ffdca0'),
      value ? 0.12 : 0.08,
    )
    environment.setNightMode(value)
  }

  setDarkMode(options.isDark)

  // --- 點擊移動 ---
  /** 渲染迴圈是否運轉中。未運轉（迎賓頁、分頁失焦）時忽略指標互動，
   * 避免迎賓頁的「點擊繼續」那一下順帶對魚下移動指令
   */
  let isRunning = false
  /** 快門挑戰模式：魚自動遊走供玩家抓拍，期間停用點擊移動與停靠 popup */
  let isCameraChallengeActive = false
  let pointerDownX = 0
  let pointerDownY = 0
  let pointerDownId: number | undefined

  // --- 拖曳魚：按住魚拖動拎起，放開後從高處落下濺大水花 ---
  let isFishDragCandidate = false
  let isFishDragging = false
  let isFishDropping = false
  let dragTargetX = 0
  let dragTargetZ = 0
  let dragCurrentX = 0
  let dragCurrentZ = 0
  let dragLiftHeight = 0
  let dropVelocity = 0

  function releaseFishDrag() {
    if (!isFishDragging) {
      return
    }
    isFishDragging = false
    isFishDropping = true
    dropVelocity = 0
    // 快速甩動時跟隨會有延遲，放開瞬間再修正一次落點，確保不會直接落在障礙物內部
    const resolved = resolvePointOutsideObstacles(dragCurrentX, dragCurrentZ, obstacleList)
    dragCurrentX = clamp(resolved.x, MOVE_BOUNDS_RECT.minX, MOVE_BOUNDS_RECT.maxX)
    dragCurrentZ = clamp(resolved.z, MOVE_BOUNDS_RECT.minZ, MOVE_BOUNDS_RECT.maxZ)
  }

  function handlePointerDown(event: PointerEvent) {
    pointerDownX = event.clientX
    pointerDownY = event.clientY
    pointerDownId = event.pointerId

    // 按在魚身上就成為拖曳候選：位移超過點擊閾值才真正進入拖曳（否則放開仍是戳魚）
    isFishDragCandidate = false
    if (isRunning && isFishEntranceDone && !isCameraChallengeActive && !isFishDropping && event.button === 0) {
      const pickInfo = scene.pick(event.offsetX, event.offsetY, (mesh) => hasFishBodyMetadata(mesh.metadata))
      isFishDragCandidate = Boolean(pickInfo.hit)
    }
  }

  function handlePointerCancel() {
    releaseFishDrag()
    isFishDragCandidate = false
    pointerDownId = undefined
  }

  function handlePointerUp(event: PointerEvent) {
    if (pointerDownId !== event.pointerId) {
      return
    }
    pointerDownId = undefined
    isFishDragCandidate = false

    // 拖曳中放開：魚從高處落下（落地演出在 updateFish），不再視為一般點擊
    if (isFishDragging) {
      releaseFishDrag()
      return
    }

    // 未運轉、魚還在進場下落中、或快門挑戰進行中，不接受移動/互動指令
    if (!isRunning || !isFishEntranceDone || isCameraChallengeActive) {
      return
    }

    // 只認主鍵（左鍵/觸控），避免右鍵、中鍵誤觸移動
    if (event.button !== 0) {
      return
    }

    const moveDistance = Math.hypot(
      event.clientX - pointerDownX,
      event.clientY - pointerDownY,
    )
    if (moveDistance > TAP_DISTANCE_THRESHOLD) {
      return
    }

    // 魚、可互動裝飾與卵石優先於地板：點到魚是驚嚇跳、點裝飾是彈跳回饋＋派魚過去、戳卵石彈一下
    const pickInfo = scene.pick(
      event.offsetX,
      event.offsetY,
      (mesh) => mesh === groundFloor
        || Boolean(readInteractionSpotKey(mesh.metadata))
        || hasFishBodyMetadata(mesh.metadata)
        || hasPokeablePebbleMetadata(mesh.metadata),
    )
    if (!pickInfo.hit || !pickInfo.pickedPoint) {
      return
    }

    // 戳卵石：小衝量彈起翻滾，不派魚移動
    if (pickInfo.pickedMesh && hasPokeablePebbleMetadata(pickInfo.pickedMesh.metadata)) {
      environment.pokePebble(pickInfo.pickedMesh)
      return
    }

    if (pickInfo.pickedMesh && hasFishBodyMetadata(pickInfo.pickedMesh.metadata)) {
      // 戳魚就是大跳空中翻滾一整圈，落地水花也隨跳高加大。
      // 原本要在時間窗內連戳三下才會翻滾，但那個門檻藏得太深——
      // 多數人戳一下看到普通小跳就走了，根本不知道有翻滾這回事
      flopController.startle(1.9, 1)
      return
    }

    let pickedX = pickInfo.pickedPoint.x
    let pickedZ = pickInfo.pickedPoint.z
    const pickedSpotKey = pickInfo.pickedMesh
      ? readInteractionSpotKey(pickInfo.pickedMesh.metadata)
      : undefined
    if (pickedSpotKey) {
      environment.playSpotBounce(pickedSpotKey)
      const pickedSpot = environment.interactionSpotList.find((spot) => spot.key === pickedSpotKey)
      if (pickedSpot) {
        // 目標設在障礙圓上朝魚這一側的點：方向明確（用裝飾中心會讓推出方向退化、
        // 連鎖彈到別的障礙旁），魚會停靠在裝飾面向自己的邊上、觸發 popup
        const directionX = codModel.rootNode.position.x - pickedSpot.x
        const directionZ = codModel.rootNode.position.z - pickedSpot.z
        const directionLength = Math.hypot(directionX, directionZ) || 1
        const stopRadius = pickedSpot.radius + FISH_COLLISION_MARGIN + 0.05
        pickedX = pickedSpot.x + (directionX / directionLength) * stopRadius
        pickedZ = pickedSpot.z + (directionZ / directionLength) * stopRadius
      }
    }

    const boundedX = clamp(pickedX, MOVE_BOUNDS_RECT.minX, MOVE_BOUNDS_RECT.maxX)
    const boundedZ = clamp(pickedZ, MOVE_BOUNDS_RECT.minZ, MOVE_BOUNDS_RECT.maxZ)
    // 點到障礙圓內就推到邊界外，避免魚永遠搆不到目標而在原地反覆微跳
    const resolved = resolvePointOutsideObstacles(boundedX, boundedZ, obstacleList)
    const targetX = clamp(resolved.x, MOVE_BOUNDS_RECT.minX, MOVE_BOUNDS_RECT.maxX)
    const targetZ = clamp(resolved.z, MOVE_BOUNDS_RECT.minZ, MOVE_BOUNDS_RECT.maxZ)

    flopController.setTarget({ x: targetX, z: targetZ })
    environment.showClickMarker(targetX, targetZ)
  }

  canvas.addEventListener('pointerdown', handlePointerDown)
  canvas.addEventListener('pointerup', handlePointerUp)

  // --- 眼睛追游標與裝飾 hover：滑鼠 hover 時把游標投影到沙地作為注視點，
  //     懸停在可互動裝飾上則讓裝飾微放大增亮 ---
  let gazeWorldPoint: Vector3 | null = null
  let hoveredSpotKey: InteractionSpotKey | null = null

  // 滑鼠視差：游標相對畫面中心的偏移（-1 ~ 1），每幀平滑趨近後微轉鏡頭
  let parallaxTargetX = 0
  let parallaxTargetY = 0
  let parallaxCurrentX = 0
  let parallaxCurrentY = 0

  function readInteractionSpotKey(metadata: unknown): InteractionSpotKey | undefined {
    return (metadata as { interactionSpotKey?: InteractionSpotKey } | null)?.interactionSpotKey
  }

  function hasFishBodyMetadata(metadata: unknown): boolean {
    return Boolean((metadata as { isFishBody?: boolean } | null)?.isFishBody)
  }

  function hasPokeablePebbleMetadata(metadata: unknown): boolean {
    return Boolean((metadata as { isPokeablePebble?: boolean } | null)?.isPokeablePebble)
  }

  function handlePointerMove(event: PointerEvent) {
    // 拖曳魚（滑鼠與觸控皆可）：候選狀態下位移超過點擊閾值就進入拖曳；
    // 拖曳中把游標投影到地板當跟隨目標
    if (pointerDownId === event.pointerId && (isFishDragCandidate || isFishDragging)) {
      if (!isFishDragging) {
        const moveDistance = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY)
        if (moveDistance > TAP_DISTANCE_THRESHOLD) {
          isFishDragging = true
          dragCurrentX = codModel.rootNode.position.x
          dragCurrentZ = codModel.rootNode.position.z
          dragTargetX = dragCurrentX
          dragTargetZ = dragCurrentZ
          try {
            canvas.setPointerCapture(event.pointerId)
          }
          catch {
            // 部分環境不支援 pointer capture，拖曳仍可運作
          }
        }
      }
      if (isFishDragging) {
        const dragPickInfo = scene.pick(event.offsetX, event.offsetY, (mesh) => mesh === groundFloor)
        if (dragPickInfo.hit && dragPickInfo.pickedPoint) {
          const boundedX = clamp(dragPickInfo.pickedPoint.x, MOVE_BOUNDS_RECT.minX, MOVE_BOUNDS_RECT.maxX)
          const boundedZ = clamp(dragPickInfo.pickedPoint.z, MOVE_BOUNDS_RECT.minZ, MOVE_BOUNDS_RECT.maxZ)
          // 拖曳目標也要推出障礙圓外，落點才不會落在石頭等障礙物內部（穿模）
          const resolved = resolvePointOutsideObstacles(boundedX, boundedZ, obstacleList)
          dragTargetX = clamp(resolved.x, MOVE_BOUNDS_RECT.minX, MOVE_BOUNDS_RECT.maxX)
          dragTargetZ = clamp(resolved.z, MOVE_BOUNDS_RECT.minZ, MOVE_BOUNDS_RECT.maxZ)
        }
        return
      }
    }

    // 只追滑鼠 hover；觸控不觸發，維持自主張望
    if (!isRunning || event.pointerType !== 'mouse') {
      return
    }

    // 視差目標：游標偏離畫布中心的比例
    const canvasWidth = Math.max(1, canvas.clientWidth)
    const canvasHeight = Math.max(1, canvas.clientHeight)
    parallaxTargetX = clamp((event.offsetX / canvasWidth - 0.5) * 2, -1, 1)
    parallaxTargetY = clamp((event.offsetY / canvasHeight - 0.5) * 2, -1, 1)

    const pickInfo = scene.pick(
      event.offsetX,
      event.offsetY,
      (mesh) => mesh === groundFloor || Boolean(readInteractionSpotKey(mesh.metadata)),
    )

    const nextHoveredSpotKey = pickInfo.pickedMesh
      ? readInteractionSpotKey(pickInfo.pickedMesh.metadata) ?? null
      : null
    if (nextHoveredSpotKey !== hoveredSpotKey) {
      hoveredSpotKey = nextHoveredSpotKey
      environment.setSpotHover(hoveredSpotKey)
    }

    if (pickInfo.hit && pickInfo.pickedPoint) {
      gazeWorldPoint = pickInfo.pickedPoint
    }
  }
  function handlePointerLeave() {
    releaseFishDrag()
    isFishDragCandidate = false
    gazeWorldPoint = null
    parallaxTargetX = 0
    parallaxTargetY = 0
    if (hoveredSpotKey) {
      hoveredSpotKey = null
      environment.setSpotHover(null)
    }
  }

  // --- 自動注視：沒有游標注視點時，魚偶爾看向裝飾，其餘時間交給自主張望 ---
  const autoGazeVector = new Vector3()
  let autoGazePoint: Vector3 | null = null
  let autoGazeRemainingSeconds = 1.5

  function updateAutoGaze(deltaSeconds: number, isFishMoving: boolean) {
    if (isFishMoving) {
      autoGazePoint = null
      return
    }

    // 停靠在裝飾旁時盯著它看，與 popup 演出呼應
    if (activeSpotKey) {
      const spot = environment.interactionSpotList.find((item) => item.key === activeSpotKey)
      if (spot) {
        autoGazeVector.set(spot.x, spot.anchorY * 0.5, spot.z)
        autoGazePoint = autoGazeVector
      }
      return
    }

    autoGazeRemainingSeconds -= deltaSeconds
    if (autoGazeRemainingSeconds > 0) {
      return
    }
    if (Math.random() < 0.45) {
      const spotList = environment.interactionSpotList
      const spot = spotList[Math.floor(Math.random() * spotList.length)]!
      autoGazeVector.set(spot.x, spot.anchorY * 0.5, spot.z)
      autoGazePoint = autoGazeVector
      autoGazeRemainingSeconds = 1.2 + Math.random() * 0.8
    }
    else {
      // 放空一陣子：交給模型內建的自主張望隨機轉眼
      autoGazePoint = null
      autoGazeRemainingSeconds = 1.5 + Math.random() * 2
    }
  }
  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerleave', handlePointerLeave)
  canvas.addEventListener('pointercancel', handlePointerCancel)

  // --- 靠近裝飾的互動 popup ---
  let activeSpotKey: InteractionSpotKey | null = null
  let notifiedXRatio = -1
  let notifiedYRatio = -1

  /** 魚停下且離某裝飾邊緣夠近時，把該裝飾的錨點投影成畫布位置比例回報外層；
   * 需在 scene.render() 之後呼叫（投影用的視圖矩陣才是當前取景）
   */
  function updateNearbyInteraction(fishX: number, fishZ: number, isFishMoving: boolean) {
    if (!options.onNearbySpotChange) {
      return
    }

    let nextSpotKey: InteractionSpotKey | null = null
    if (!isFishMoving && !isCameraChallengeActive) {
      let bestEdgeDistance = INTERACTION_TRIGGER_DISTANCE
      for (const spot of environment.interactionSpotList) {
        const edgeDistance = Math.hypot(fishX - spot.x, fishZ - spot.z) - spot.radius
        if (edgeDistance < bestEdgeDistance) {
          bestEdgeDistance = edgeDistance
          nextSpotKey = spot.key
        }
      }
    }

    if (!nextSpotKey) {
      if (activeSpotKey) {
        activeSpotKey = null
        options.onNearbySpotChange(null)
      }
      return
    }

    const spot = environment.interactionSpotList.find((item) => item.key === nextSpotKey)
    if (!spot) {
      return
    }
    const renderWidth = Math.max(1, engine.getRenderWidth())
    const renderHeight = Math.max(1, engine.getRenderHeight())
    const projectedPoint = Vector3.Project(
      new Vector3(spot.x, spot.anchorY, spot.z),
      Matrix.IdentityReadOnly,
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(renderWidth, renderHeight),
    )
    const xRatio = projectedPoint.x / renderWidth
    const yRatio = projectedPoint.y / renderHeight

    // 位置幾乎沒變就不重複回報，避免每幀觸發外層響應式更新
    const isNewSpot = nextSpotKey !== activeSpotKey
    const hasChanged = isNewSpot
      || Math.abs(xRatio - notifiedXRatio) > 0.002
      || Math.abs(yRatio - notifiedYRatio) > 0.002
    if (hasChanged) {
      activeSpotKey = nextSpotKey
      notifiedXRatio = xRatio
      notifiedYRatio = yRatio
      options.onNearbySpotChange({ key: nextSpotKey, xRatio, yRatio })
      // 剛停靠到新裝飾：播放該裝飾的專屬展示動畫，與 popup 一起出場
      if (isNewSpot) {
        environment.playSpotShowcase(nextSpotKey)
      }
    }
  }

  // --- 每幀更新 ---
  let timeSeconds = 0

  /** 最新一幀的魚姿態，快門挑戰的拍照判定用 */
  let latestPose = flopController.getPose()

  /** 快門挑戰：挑選離現在位置夠遠的隨機落點，讓魚跳出明顯弧線 */
  function setRandomWanderTarget() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidateX = CAMERA_FRAME_RECT.minX + Math.random() * (CAMERA_FRAME_RECT.maxX - CAMERA_FRAME_RECT.minX)
      const candidateZ = CAMERA_FRAME_RECT.minZ + Math.random() * (CAMERA_FRAME_RECT.maxZ - CAMERA_FRAME_RECT.minZ)
      if (Math.hypot(candidateX - latestPose.x, candidateZ - latestPose.z) < CAMERA_WANDER_MIN_DISTANCE) {
        continue
      }
      const resolved = resolvePointOutsideObstacles(candidateX, candidateZ, obstacleList)
      flopController.setTarget({
        x: clamp(resolved.x, MOVE_BOUNDS_RECT.minX, MOVE_BOUNDS_RECT.maxX),
        z: clamp(resolved.z, MOVE_BOUNDS_RECT.minZ, MOVE_BOUNDS_RECT.maxZ),
      })
      return
    }
  }

  // --- 魚的進場：擺設彈出後從高空落下，落地濺大水花 ---
  let fishEntranceElapsedSeconds = 0
  let isFishEntranceDone = false
  let fishEntranceSquashRemainingSeconds = 0
  /** 進場起始高度，0 = 尚未解算（相機矩陣要等首幀渲染後才有效） */
  let fishEntranceDropHeight = 0

  /** 由低往高找第一個投影在畫面頂端之上（含邊距）的高度，
   * 讓魚在任何視窗比例（含手機直式的高天空取景）都保證從螢幕外落下
   */
  function resolveEntranceDropHeight(): number {
    const renderWidth = Math.max(1, engine.getRenderWidth())
    const renderHeight = Math.max(1, engine.getRenderHeight())
    for (let height = 6; height <= FISH_ENTRANCE_HIDDEN_HEIGHT; height += 1) {
      const projectedPoint = Vector3.Project(
        new Vector3(0, height, 0),
        Matrix.IdentityReadOnly,
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(renderWidth, renderHeight),
      )
      if (projectedPoint.y < -renderHeight * FISH_ENTRANCE_OFFSCREEN_MARGIN_RATIO) {
        return height
      }
    }
    return FISH_ENTRANCE_HIDDEN_HEIGHT
  }

  function updateFish(deltaSeconds: number) {
    // 拖曳中：魚平滑跟著游標、拎在空中，控制器則原地待命
    if (isFishDragging) {
      const followLerp = Math.min(1, deltaSeconds * DRAG_FOLLOW_RATE)
      dragCurrentX += (dragTargetX - dragCurrentX) * followLerp
      dragCurrentZ += (dragTargetZ - dragCurrentZ) * followLerp
      flopController.teleport({ x: dragCurrentX, z: dragCurrentZ })
      dragLiftHeight += (DRAG_LIFT_HEIGHT - dragLiftHeight) * Math.min(1, deltaSeconds * DRAG_LIFT_RATE)
    }
    else if (isFishDropping) {
      // 放開後自由落體，落地觸發大水花＋擠壓緩衝（重用進場落地機制），力道隨落速
      dropVelocity += DRAG_FALL_GRAVITY * deltaSeconds
      dragLiftHeight -= dropVelocity * deltaSeconds
      if (dragLiftHeight <= 0) {
        dragLiftHeight = 0
        isFishDropping = false
        fishEntranceSquashRemainingSeconds = FISH_ENTRANCE_SQUASH_DURATION
        environment.spawnLandingBurst(
          codModel.rootNode.position.x,
          codModel.rootNode.position.z,
          clamp(dropVelocity * 0.22, 1, 2),
        )
      }
    }

    const pose = flopController.update(deltaSeconds)
    latestPose = pose

    // 落地瞬間濺小水滴，強度跟著本跳跳高
    if (pose.hasLanded) {
      environment.spawnLandingBurst(pose.x, pose.z, pose.hopStrength)
    }

    // 快門挑戰：魚停下就立刻挑下一個落點，維持連續跳躍供玩家抓拍
    if (isCameraChallengeActive && isFishEntranceDone && !flopController.isMoving) {
      setRandomWanderTarget()
    }

    // 進場落下：延遲後自由落體；落地觸發大水花與擠壓緩衝
    let entranceOffsetY = 0
    let entranceSquash = 1
    let isEntranceFalling = false
    if (!isFishEntranceDone) {
      fishEntranceElapsedSeconds += deltaSeconds
      // 首幀渲染後相機矩陣才有效，延遲期間解算起始高度；解算前先藏在天上
      if (fishEntranceDropHeight === 0 && fishEntranceElapsedSeconds > 0.1) {
        fishEntranceDropHeight = resolveEntranceDropHeight()
      }
      const dropHeight = fishEntranceDropHeight || FISH_ENTRANCE_HIDDEN_HEIGHT
      const fallSeconds = Math.max(0, fishEntranceElapsedSeconds - FISH_ENTRANCE_DELAY_SECONDS)
      const fallDistance = 0.5 * FISH_ENTRANCE_GRAVITY * fallSeconds * fallSeconds
      if (fishEntranceDropHeight > 0 && fallDistance >= dropHeight) {
        isFishEntranceDone = true
        fishEntranceSquashRemainingSeconds = FISH_ENTRANCE_SQUASH_DURATION
        environment.spawnLandingBurst(pose.x, pose.z, 1.6)
      }
      else {
        entranceOffsetY = dropHeight - fallDistance
        isEntranceFalling = true
        // 下落時身體微拉長，與落地擠壓形成對比
        entranceSquash = 1.08
      }
    }
    if (fishEntranceSquashRemainingSeconds > 0) {
      fishEntranceSquashRemainingSeconds = Math.max(0, fishEntranceSquashRemainingSeconds - deltaSeconds)
      const squashRatio = fishEntranceSquashRemainingSeconds / FISH_ENTRANCE_SQUASH_DURATION
      entranceSquash = 1 - FISH_ENTRANCE_SQUASH_AMOUNT * squashRatio * squashRatio
    }

    updateAutoGaze(deltaSeconds, pose.isMoving)
    updateAccessoryList(deltaSeconds)

    codModel.rootNode.position.set(
      pose.x,
      GROUND_Y + COD_LYING_LIFT * FISH_SCALE + pose.y + entranceOffsetY + dragLiftHeight,
      pose.z,
    )
    codModel.rootNode.rotation.y = pose.heading
    // Babylon rotation.x 正值為低頭，pose.pitch 正值為抬頭，故取負
    codModel.rootNode.rotation.x = -pose.pitch
    codModel.lieNode.rotation.z = LYING_ROLL + pose.roll

    // 隱形碰撞網格同步魚身的世界姿態（剛體不能掛在有 parent 的節點上）
    if (fishColliderMesh) {
      codModel.bodyMesh.computeWorldMatrix(true)
      fishColliderMesh.position.copyFrom(codModel.bodyMesh.getAbsolutePosition())
      fishColliderMesh.rotationQuaternion ??= new Quaternion()
      fishColliderMesh.rotationQuaternion.copyFrom(codModel.bodyMesh.absoluteRotationQuaternion)
    }

    const combinedSquash = pose.squash * entranceSquash
    const horizontalScale = FISH_SCALE / Math.sqrt(combinedSquash)
    codModel.rootNode.scaling.set(
      horizontalScale,
      FISH_SCALE * combinedSquash,
      horizontalScale,
    )

    // 身體擺動（與跳躍同步）、胸鰭划水、尾鰭拍打、眨眼、瞳孔（有游標則看向游標）。
    // 進場下落、被拎起與放落時視為移動且不給外部相位：身體自跑擺動，像在空中掙扎
    const isAirborneStruggle = isEntranceFalling || isFishDragging || isFishDropping
    codModel.update({
      deltaSeconds,
      isMoving: pose.isMoving || isAirborneStruggle,
      wavePhase: isAirborneStruggle ? undefined : pose.wavePhase,
      waveStrength: isAirborneStruggle ? 1 : pose.hopStrength,
      gazeTarget: isAirborneStruggle ? null : (gazeWorldPoint ?? autoGazePoint),
    })

    return pose
  }

  function renderFrame() {
    const deltaSeconds = Math.min(engine.getDeltaTime(), MAX_FRAME_DELTA_MS) / 1000
    timeSeconds += deltaSeconds

    // 滑鼠視差：平滑趨近目標偏移後微轉鏡頭（游標往上 = 視角略升高俯瞰）
    const parallaxLerp = Math.min(1, deltaSeconds * PARALLAX_LERP_RATE)
    parallaxCurrentX += (parallaxTargetX - parallaxCurrentX) * parallaxLerp
    parallaxCurrentY += (parallaxTargetY - parallaxCurrentY) * parallaxLerp

    // 挑戰舞台聚焦：與一般取景（含視差）平滑混合，退場沿用最後目標過渡回來
    const focusBlendLerp = Math.min(1, deltaSeconds * STAGE_FOCUS_BLEND_RATE)
    stageFocusBlend += ((stageFocus ? 1 : 0) - stageFocusBlend) * focusBlendLerp
    if (!stageFocus && stageFocusBlend < 0.005) {
      stageFocusBlend = 0
      activeStageFocus = null
    }
    const focus = activeStageFocus
    const parallaxScale = 1 - stageFocusBlend
    camera.alpha = baseCameraAlpha + parallaxCurrentX * PARALLAX_ALPHA_RANGE * parallaxScale
    camera.beta = CAMERA_BETA
      + parallaxCurrentY * PARALLAX_BETA_RANGE * parallaxScale
      + STAGE_FOCUS_BETA_OFFSET * stageFocusBlend
    camera.radius = framedCameraRadius
      + (focus ? (focus.radius - framedCameraRadius) * stageFocusBlend : 0)
    camera.target.set(
      focus ? focus.x * stageFocusBlend : 0,
      0.7 + (focus ? (focus.y - 0.7) * stageFocusBlend : 0),
      focus ? focus.z * stageFocusBlend : 0,
    )

    const pose = updateFish(deltaSeconds)
    environment.update(timeSeconds, deltaSeconds, codModel.rootNode.position.x, codModel.rootNode.position.z)
    scene.render()
    // 拖曳/落下中不觸發停靠 popup（魚在空中）
    updateNearbyInteraction(pose.x, pose.z, pose.isMoving || isFishDragging || isFishDropping)
  }

  // --- 挑戰 3D 舞台：首次進入才建構網格 ---
  let typewriterStageInstance: TypewriterStage | undefined
  let crayonStageInstance: CrayonStage | undefined

  function getTypewriterStage(): TypewriterStage {
    typewriterStageInstance ??= createTypewriterStage(scene, camera, environment.typewriterPartMap)
    return typewriterStageInstance
  }

  function getCrayonStage(): CrayonStage {
    crayonStageInstance ??= createCrayonStage(scene, camera, environment.crayonAnchor)
    return crayonStageInstance
  }

  return {
    engine,
    setEquippedAccessoryList,
    setCameraChallengeActive(value: boolean) {
      isCameraChallengeActive = value
    },
    typewriterStage: {
      enter() {
        const stage = getTypewriterStage()
        stage.enter()
        setStageFocus(stage.focusTarget)
      },
      exit() {
        typewriterStageInstance?.exit()
        setStageFocus(null)
      },
      syncNoteList(noteViewList: TypewriterNoteView[]) {
        typewriterStageInstance?.syncNoteList(noteViewList)
      },
      setPaperText(lineList: string[], currentLine: string) {
        typewriterStageInstance?.setPaperText(lineList, currentLine)
      },
      playMiss() {
        typewriterStageInstance?.playMiss()
      },
      playSuccess() {
        const stage = typewriterStageInstance
        if (!stage) {
          return
        }
        stage.playSuccess()
        environment.spawnConfettiBurst(stage.focusTarget.x, stage.focusTarget.z, 12)
      },
    },
    crayonStage: {
      enter(outlinePointList: readonly PlanarPoint[]) {
        const stage = getCrayonStage()
        stage.enter(outlinePointList)
        setStageFocus(stage.focusTarget)
      },
      exit() {
        crayonStageInstance?.exit()
        setStageFocus(null)
      },
      pickCanvasPoint(clientX: number, clientY: number) {
        const boundingRect = canvas.getBoundingClientRect()
        return crayonStageInstance?.pickCanvasPoint(
          clientX - boundingRect.left,
          clientY - boundingRect.top,
        ) ?? null
      },
      beginStroke(point: PlanarPoint, color: string) {
        crayonStageInstance?.beginStroke(point, color)
      },
      strokeTo(point: PlanarPoint) {
        crayonStageInstance?.strokeTo(point)
      },
      endStroke() {
        crayonStageInstance?.endStroke()
      },
      clearCanvas() {
        crayonStageInstance?.clearCanvas()
      },
      finishArtwork(fillColor: string) {
        const stage = crayonStageInstance
        if (!stage) {
          return
        }
        stage.finishArtwork(fillColor)
        environment.spawnConfettiBurst(stage.focusTarget.x, stage.focusTarget.z, 14)
      },
      setCrayonColor(color: string) {
        crayonStageInstance?.setCrayonColor(color)
      },
    },
    getFishShotInfo() {
      if (!isRunning) {
        return null
      }
      const renderWidth = Math.max(1, engine.getRenderWidth())
      const renderHeight = Math.max(1, engine.getRenderHeight())
      const projectedPoint = Vector3.Project(
        codModel.rootNode.position,
        Matrix.IdentityReadOnly,
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(renderWidth, renderHeight),
      )
      return {
        xRatio: projectedPoint.x / renderWidth,
        yRatio: projectedPoint.y / renderHeight,
        heightRatio: clamp(latestPose.y / FISH_HOP_HEIGHT, 0, 1),
      }
    },
    captureFishSnapshot() {
      try {
        // WebGL 預設不保留繪圖緩衝，同步渲染一幀後立刻讀取才拿得到畫面
        scene.render()
        const renderWidth = Math.max(1, engine.getRenderWidth())
        const renderHeight = Math.max(1, engine.getRenderHeight())
        const projectedPoint = Vector3.Project(
          codModel.rootNode.position,
          Matrix.IdentityReadOnly,
          scene.getTransformMatrix(),
          camera.viewport.toGlobal(renderWidth, renderHeight),
        )
        const cropSize = Math.min(renderHeight * SNAPSHOT_CROP_HEIGHT_RATIO, renderWidth)
        const cropX = clamp(projectedPoint.x - cropSize / 2, 0, Math.max(0, renderWidth - cropSize))
        const cropY = clamp(projectedPoint.y - cropSize / 2, 0, Math.max(0, renderHeight - cropSize))

        // 輸出尺寸不超過裁切區的實際像素數：只會 1:1 或縮小，永不放大 → 不糊
        const outputSize = Math.round(Math.min(SNAPSHOT_MAX_OUTPUT, cropSize))
        const outputCanvas = document.createElement('canvas')
        outputCanvas.width = outputSize
        outputCanvas.height = outputSize
        const context = outputCanvas.getContext('2d')
        if (!context) {
          return null
        }
        // 場景 canvas 是透明背景，先鋪上與頁面漸層相近的底色
        const gradient = context.createLinearGradient(0, 0, 0, outputSize)
        if (isDarkModeActive) {
          gradient.addColorStop(0, '#22333f')
          gradient.addColorStop(1, '#182631')
        }
        else {
          gradient.addColorStop(0, '#eef7f4')
          gradient.addColorStop(1, '#dcefe9')
        }
        context.fillStyle = gradient
        context.fillRect(0, 0, outputSize, outputSize)
        context.drawImage(
          canvas,
          cropX,
          cropY,
          cropSize,
          cropSize,
          0,
          0,
          outputSize,
          outputSize,
        )
        return outputCanvas.toDataURL('image/png')
      }
      catch (error) {
        console.warn('[fish-diorama] 拍立得快照擷取失敗', error)
        return null
      }
    },
    playSpotShowcase(key: InteractionSpotKey) {
      environment.playSpotShowcase(key)
    },
    playCameraShutterFeedback(isSharpShot: boolean) {
      // 每按一次快門 3D 相機都閃燈呼應
      environment.playSpotShowcase('camera')
      if (!isSharpShot) {
        return
      }
      // 拍到清晰照：相機開心彈跳＋噴一小把彩帶
      environment.playSpotBounce('camera')
      const cameraSpot = environment.interactionSpotList.find((spot) => spot.key === 'camera')
      if (cameraSpot) {
        environment.spawnConfettiBurst(cameraSpot.x, cameraSpot.z, 8)
      }
    },
    setSpotLocked(key: InteractionSpotKey, isLocked: boolean, skipTransition?: boolean) {
      environment.setSpotLocked(key, isLocked, skipTransition)
    },
    celebrateSpotUnlock(key: InteractionSpotKey) {
      environment.playSpotBounce(key)
      environment.playSpotShowcase(key)
      const spot = environment.interactionSpotList.find((item) => item.key === key)
      if (spot) {
        environment.spawnLandingBurst(spot.x, spot.z, 2)
        environment.spawnConfettiBurst(spot.x, spot.z, 16)
      }
    },
    celebrateFullUnlock() {
      crownVisible = true
      syncSkyConfetti()
      environment.spawnConfettiBurst(
        codModel.rootNode.position.x,
        codModel.rootNode.position.z,
      )
      // 開心大跳翻滾一圈
      flopController.startle(1.7, 1)
    },
    setCrownVisible(visible: boolean, skipTransition?: boolean) {
      crownVisible = visible
      if (skipTransition) {
        crownScale = visible && !sleepyActive ? 1 : 0
      }
      syncSkyConfetti()
    },
    setSleepyMode(enabled: boolean) {
      sleepyActive = enabled
      syncSkyConfetti()
    },
    setRunning(value: boolean) {
      if (isRunning === value) {
        return
      }
      isRunning = value

      if (value) {
        engine.runRenderLoop(renderFrame)
      }
      else {
        engine.stopRenderLoop()
      }
    },
    setDarkMode,
    resize() {
      engine.resize()
      applyCameraFraming()
    },
    dispose() {
      isDisposed = true
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerleave', handlePointerLeave)
      canvas.removeEventListener('pointercancel', handlePointerCancel)
      engine.stopRenderLoop()
      for (const handle of equippedAccessoryMap.values()) {
        handle.dispose()
      }
      equippedAccessoryMap.clear()
      scene.dispose()
      engine.dispose()
    },
  }
}
