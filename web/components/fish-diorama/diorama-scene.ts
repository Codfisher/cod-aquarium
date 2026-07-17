/** 箱庭場景組裝：引擎、固定 45 度相機、燈光陰影、鱈魚與互動。
 *
 * 本模組只在瀏覽器端動態 import，內部可安全使用 window。
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { PhysicsMotionType, PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin'
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate'
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { Scene } from '@babylonjs/core/scene'
import { ShadowOnlyMaterial } from '@babylonjs/materials/shadowOnly/shadowOnlyMaterial'
import { COD_LYING_LIFT, createCodModel } from './cod-model'
import { FlopController, resolvePointOutsideObstacles } from './flop-controller'
import { getGrainTileBlobUrl } from './paper-grain'
import { attachPaperGrainPlugins, setPaperGrainTexture } from './paper-grain-plugin'
import {
  CAMERA_FRAME_RECT,
  createTankEnvironment,
  GROUND_Y,
  type InteractionSpotKey,
  MOVE_BOUNDS_RECT,
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

export interface DioramaSceneHandle {
  /** 開關渲染迴圈（不可見或失焦時停止） */
  setRunning: (value: boolean) => void;
  setDarkMode: (value: boolean) => void;
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
/** 魚的 kinematic 碰撞球半徑（Havok 推開水草用） */
const FISH_COLLIDER_RADIUS = 0.55
/** 魚身中心到裝飾邊緣小於此距離且停下時，觸發互動 popup。
 * 魚避障後最近只能停在裝飾邊緣外約 FISH_COLLISION_MARGIN 處，此值需略大於它
 */
const INTERACTION_TRIGGER_DISTANCE = 1.3
/** 單幀 dt 上限（ms），比照 bg-flock 避免掉幀時瞬移 */
const MAX_FRAME_DELTA_MS = 34
/** 點擊判定：pointer 位移小於此值（px）才視為點擊而非拖曳/捲動 */
const TAP_DISTANCE_THRESHOLD = 8
/** 連點魚彩蛋：時間窗（秒）內戳魚滿此次數，觸發大跳空中翻滾 */
const FISH_COMBO_CLICK_COUNT = 3
const FISH_COMBO_WINDOW_SECONDS = 2.5
/** 滑鼠視差：游標偏離畫面中心時鏡頭方位角/俯角的最大偏移（rad）。
 * 幅度刻意極小，只求「探頭看箱庭」的立體感，不能大到影響取景與暈眩
 */
const PARALLAX_ALPHA_RANGE = 0.035
const PARALLAX_BETA_RANGE = 0.02
const PARALLAX_LERP_RATE = 3
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
  pipeline.imageProcessing.contrast = 1.12
  pipeline.imageProcessing.exposure = 1
  // 後處理管線會繞過 canvas 原生 MSAA：改開管線自身的 MSAA（WebGL2，幾何硬邊主力），
  // 再疊 FXAA 收掉殘餘閃爍。只靠 FXAA 對低多邊形硬邊效果很差、鋸齒明顯
  pipeline.samples = 4
  pipeline.fxaaEnabled = true

  const hemisphericLight = new HemisphericLight(
    'dioramaHemisphericLight',
    new Vector3(0.2, 1, 0.1),
    scene,
  )
  // 天光偏暖、地光偏冷，讓每個面隨朝向產生冷暖明暗層次，
  // 這是低多邊 flat shading 顯得豐富（而非死板純色）的關鍵
  hemisphericLight.diffuse = new Color3(1, 0.95, 0.87)
  hemisphericLight.groundColor = new Color3(0.3, 0.35, 0.43)

  const directionalLight = new DirectionalLight(
    'dioramaSunLight',
    new Vector3(-0.45, -1, -0.35).normalize(),
    scene,
  )
  directionalLight.position = new Vector3(7, 12, 6)
  directionalLight.diffuse = new Color3(1, 0.96, 0.9)

  // 對側冷色補光，讓背光面不死黑、立體感更明確
  const fillLight = new DirectionalLight(
    'dioramaFillLight',
    new Vector3(0.5, -0.55, 0.45).normalize(),
    scene,
  )
  fillLight.diffuse = new Color3(0.55, 0.68, 0.85)
  fillLight.specular = new Color3(0, 0, 0)

  const shadowGenerator = new ShadowGenerator(1024, directionalLight)
  shadowGenerator.usePercentageCloserFiltering = true

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
  groundFloorMaterial.shadowColor = Color3.FromHexString('#1b2a33')
  // 陰影是跳躍高度的主要視覺線索（魚離地時影子分離），不能太淡
  groundFloorMaterial.alpha = 0.45
  groundFloor.material = groundFloorMaterial

  const environment = createTankEnvironment(scene)
  const codModel = createCodModel(scene)

  // 魚身可點擊：點到魚時原地驚嚇彈跳（handlePointerUp 依 metadata 辨認）
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
    hopHeight: 0.85,
    hopDuration: 0.42,
  })

  // 障礙圓（石頭/搖桿/相機）加上魚身邊界後交給移動控制器，魚會繞行且落點不踩進去
  const obstacleList = environment.obstacleList.map((obstacle) => ({
    x: obstacle.x,
    z: obstacle.z,
    radius: obstacle.radius + FISH_COLLISION_MARGIN,
  }))
  flopController.setObstacleList(obstacleList)

  /** 場景已銷毀旗標：非同步資源（紙紋、Havok WASM）載入完成時若已銷毀就不再初始化 */
  let isDisposed = false

  // --- 紙紋材質 ---
  // 外掛必須在材質首次渲染前掛上（此時 define 關閉、零成本）；
  // 噪點 tile 非同步產生，就緒後翻開 define，以三平面投影混進每個面；失敗維持平塗
  attachPaperGrainPlugins(scene)
  getGrainTileBlobUrl()
    .then((url) => {
      if (isDisposed) {
        return
      }
      setPaperGrainTexture(scene, new Texture(url, scene))
    })
    .catch((error) => {
      console.warn('[fish-diorama] 紙紋產生失敗，維持平塗材質', error)
    })

  // --- Havok 物理（非同步載入 WASM）---
  // 就緒後：水草葉片轉動態剛體被魚推開、彈簧回正；載入失敗保留手動推草，場景照常運作
  let fishColliderMesh: ReturnType<typeof CreateSphere> | undefined

  import('@babylonjs/havok')
    .then(async (havokModule) => havokModule.default())
    .then((havokInstance) => {
      if (isDisposed) {
        return
      }
      const havokPlugin = new HavokPlugin(true, havokInstance)
      scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin)

      // 大地板剛體：倒伏的葉片靠在上面
      const groundAggregate = new PhysicsAggregate(groundFloor, PhysicsShapeType.BOX, { mass: 0 }, scene)
      groundAggregate.shape.filterMembershipMask = PHYSICS_GROUP_STATIC
      groundAggregate.shape.filterCollideMask = PHYSICS_GROUP_SEAWEED

      // 魚的 kinematic 碰撞球：每幀跟隨魚（含跳躍高度），由物理引擎算速度撞開水草
      fishColliderMesh = CreateSphere(
        'dioramaFishCollider',
        { diameter: FISH_COLLIDER_RADIUS * 2, segments: 8 },
        scene,
      )
      fishColliderMesh.isVisible = false
      fishColliderMesh.isPickable = false
      fishColliderMesh.position.copyFrom(codModel.rootNode.position)
      const fishAggregate = new PhysicsAggregate(fishColliderMesh, PhysicsShapeType.SPHERE, { mass: 1 }, scene)
      fishAggregate.body.setMotionType(PhysicsMotionType.ANIMATED)
      // 每幀把 mesh 位置同步進物理世界（kinematic 追隨）
      fishAggregate.body.disablePreStep = false
      fishAggregate.shape.filterMembershipMask = PHYSICS_GROUP_FISH
      fishAggregate.shape.filterCollideMask = PHYSICS_GROUP_SEAWEED

      environment.enablePhysics()
    })
    .catch((error) => {
      console.warn('[fish-diorama] Havok 物理載入失敗，改用簡易推草效果', error)
    })

  /** 取景基準方位角，滑鼠視差以此為中心微幅偏移 */
  let baseCameraAlpha = -Math.PI / 2

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
    camera.radius = distanceForFullWidth <= baseRadius * 1.4
      ? Math.max(baseRadius, distanceForFullWidth)
      : baseRadius
  }

  applyCameraFraming()

  // 初始側躺：頭朝畫面水平方向、背鰭面向鏡頭。橫/直取景畫面水平方向不同，分開給角度
  const isPortraitFraming = baseCameraAlpha === Math.PI
  flopController.teleport(
    { x: 0, z: 0 },
    isPortraitFraming ? INITIAL_HEADING_PORTRAIT : INITIAL_HEADING_LANDSCAPE,
  )

  function setDarkMode(value: boolean) {
    // 月夜藍風格化夜景：畫面依然清晰明亮，只是整體換上冷藍色調（動森式）。
    // 主光轉淡藍月光、環境光偏藍紫；陰影維持原本的柔和平行光影，
    // 亮點交給路燈柔光暈與螢火點綴
    hemisphericLight.intensity = value ? 0.62 : 0.72
    hemisphericLight.diffuse = value
      ? Color3.FromHexString('#aec4e8')
      : new Color3(1, 0.95, 0.87)
    hemisphericLight.groundColor = value
      ? Color3.FromHexString('#2c3a55')
      : new Color3(0.3, 0.35, 0.43)
    directionalLight.intensity = value ? 0.72 : 0.85
    directionalLight.diffuse = value
      ? Color3.FromHexString('#c4d4f2')
      : new Color3(1, 0.96, 0.9)
    fillLight.intensity = value ? 0.35 : 0.3
    fillLight.diffuse = value
      ? Color3.FromHexString('#7f9fe8')
      : new Color3(0.55, 0.68, 0.85)
    environment.setNightMode(value)
  }

  setDarkMode(options.isDark)

  // --- 點擊移動 ---
  /** 渲染迴圈是否運轉中。未運轉（迎賓頁、分頁失焦）時忽略指標互動，
   * 避免迎賓頁的「點擊繼續」那一下順帶對魚下移動指令
   */
  let isRunning = false
  let pointerDownX = 0
  let pointerDownY = 0
  let pointerDownId: number | undefined
  /** 近期成功戳到魚（有觸發驚嚇跳）的時間戳（秒），連點彩蛋用 */
  let fishStartleTimeList: number[] = []

  function handlePointerDown(event: PointerEvent) {
    pointerDownX = event.clientX
    pointerDownY = event.clientY
    pointerDownId = event.pointerId
  }

  function handlePointerUp(event: PointerEvent) {
    if (pointerDownId !== event.pointerId) {
      return
    }
    pointerDownId = undefined

    // 未運轉或魚還在進場下落中，不接受移動/互動指令
    if (!isRunning || !isFishEntranceDone) {
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

    // 魚與可互動裝飾優先於地板：點到魚是驚嚇跳、點到裝飾是彈跳回饋＋派魚過去
    const pickInfo = scene.pick(
      event.offsetX,
      event.offsetY,
      (mesh) => mesh === groundFloor
        || Boolean(readInteractionSpotKey(mesh.metadata))
        || hasFishBodyMetadata(mesh.metadata),
    )
    if (!pickInfo.hit || !pickInfo.pickedPoint) {
      return
    }

    if (pickInfo.pickedMesh && hasFishBodyMetadata(pickInfo.pickedMesh.metadata)) {
      // 連點彩蛋：時間窗內連續戳到魚（每次都真的起跳）滿次數，
      // 惹惱鱈魚 → 大跳空中翻滾一整圈，落地水花也隨跳高加大
      const nowSeconds = performance.now() / 1000
      fishStartleTimeList = fishStartleTimeList.filter(
        (time) => nowSeconds - time < FISH_COMBO_WINDOW_SECONDS,
      )
      const isComboReached = fishStartleTimeList.length >= FISH_COMBO_CLICK_COUNT - 1
      const hasStartled = isComboReached
        ? flopController.startle(1.9, 1)
        : flopController.startle()
      if (hasStartled) {
        if (isComboReached) {
          fishStartleTimeList = []
        }
        else {
          fishStartleTimeList.push(nowSeconds)
        }
      }
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

  function handlePointerMove(event: PointerEvent) {
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
    if (!isFishMoving) {
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
    const pose = flopController.update(deltaSeconds)

    // 落地瞬間濺小水滴，強度跟著本跳跳高
    if (pose.hasLanded) {
      environment.spawnLandingBurst(pose.x, pose.z, pose.hopStrength)
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

    codModel.rootNode.position.set(
      pose.x,
      GROUND_Y + COD_LYING_LIFT * FISH_SCALE + pose.y + entranceOffsetY,
      pose.z,
    )
    codModel.rootNode.rotation.y = pose.heading
    // Babylon rotation.x 正值為低頭，pose.pitch 正值為抬頭，故取負
    codModel.rootNode.rotation.x = -pose.pitch
    codModel.lieNode.rotation.z = LYING_ROLL + pose.roll

    // 物理碰撞球跟著魚身中心（含跳躍高度）：跳起時抬離水草、落下才壓草
    fishColliderMesh?.position.copyFrom(codModel.rootNode.position)

    const combinedSquash = pose.squash * entranceSquash
    const horizontalScale = FISH_SCALE / Math.sqrt(combinedSquash)
    codModel.rootNode.scaling.set(
      horizontalScale,
      FISH_SCALE * combinedSquash,
      horizontalScale,
    )

    // 身體擺動（與跳躍同步）、胸鰭划水、尾鰭拍打、眨眼、瞳孔（有游標則看向游標）。
    // 進場下落時視為移動且不給外部相位：身體自跑擺動，像在空中掙扎
    codModel.update({
      deltaSeconds,
      isMoving: pose.isMoving || isEntranceFalling,
      wavePhase: isEntranceFalling ? undefined : pose.wavePhase,
      waveStrength: isEntranceFalling ? 1 : pose.hopStrength,
      gazeTarget: isEntranceFalling ? null : (gazeWorldPoint ?? autoGazePoint),
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
    camera.alpha = baseCameraAlpha + parallaxCurrentX * PARALLAX_ALPHA_RANGE
    camera.beta = CAMERA_BETA + parallaxCurrentY * PARALLAX_BETA_RANGE

    const pose = updateFish(deltaSeconds)
    environment.update(timeSeconds, deltaSeconds, codModel.rootNode.position.x, codModel.rootNode.position.z)
    scene.render()
    updateNearbyInteraction(pose.x, pose.z, pose.isMoving)
  }

  return {
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
      engine.stopRenderLoop()
      scene.dispose()
      engine.dispose()
    },
  }
}
