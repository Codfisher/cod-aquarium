/** 箱庭場景組裝：引擎、固定 45 度相機、燈光陰影、鱈魚與互動。
 *
 * 本模組只在瀏覽器端動態 import，內部可安全使用 window。
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Engine } from '@babylonjs/core/Engines/engine'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { DepthOfFieldEffectBlurLevel } from '@babylonjs/core/PostProcesses/depthOfFieldEffect'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { Scene } from '@babylonjs/core/scene'
import { COD_LYING_LIFT, createCodModel } from './cod-model'
import { FlopController } from './flop-controller'
import {
  createTankEnvironment,
  getSandHeight,
  MOVE_BOUNDS_RECT,
  TANK_DEPTH,
  TANK_WIDTH,
  WALL_HEIGHT,
} from './tank-environment'
import '@babylonjs/core/Culling/ray'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'
import '@babylonjs/core/Rendering/depthRendererSceneComponent'

export interface DioramaSceneOptions {
  isDark: boolean;
  isReducedMotion: boolean;
}

export interface DioramaSceneHandle {
  /** 開關渲染迴圈（不可見或失焦時停止） */
  setRunning: (value: boolean) => void;
  setDarkMode: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
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
/** 單幀 dt 上限（ms），比照 bg-flock 避免掉幀時瞬移 */
const MAX_FRAME_DELTA_MS = 34
/** 點擊判定：pointer 位移小於此值（px）才視為點擊而非拖曳/捲動 */
const TAP_DISTANCE_THRESHOLD = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createDioramaScene(
  canvas: HTMLCanvasElement,
  options: DioramaSceneOptions,
): DioramaSceneHandle {
  const engine = new Engine(canvas, true, { alpha: true }, false)
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2))

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

  // 景深 + 影像處理：淺景深讓前後景模糊、暗角與對比拉高，營造微縮模型（tilt-shift）的感覺
  const pipeline = new DefaultRenderingPipeline('dioramaPipeline', true, scene, [camera])
  pipeline.depthOfFieldEnabled = true
  pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Low
  pipeline.depthOfField.fStop = 2.6
  pipeline.depthOfField.focalLength = 75
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.contrast = 1.12
  pipeline.imageProcessing.exposure = 1
  // 後處理管線會繞過 canvas 原生 MSAA，用 FXAA 抗鋸齒
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

  const environment = createTankEnvironment(scene)
  const codModel = createCodModel(scene)

  for (const mesh of [...codModel.meshList, ...environment.shadowCasterMeshList]) {
    shadowGenerator.addShadowCaster(mesh)
  }

  const flopController = new FlopController({
    hopDistance: 0.95,
    hopHeight: 0.55,
  })
  flopController.setSlideMode(options.isReducedMotion)

  /** 依畫面比例取景：直式改從側邊看（畫面水平對應缸身長邊） */
  function applyCameraFraming() {
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight())
    const isPortrait = aspect < 0.9

    camera.alpha = isPortrait ? Math.PI : -Math.PI / 2
    environment.setPortrait(isPortrait)

    const horizontalHalf = (isPortrait ? TANK_DEPTH : TANK_WIDTH) / 2
    const verticalHalf = (isPortrait ? TANK_WIDTH : TANK_DEPTH) / 2
    const playableHorizontalHalf = isPortrait
      ? MOVE_BOUNDS_RECT.maxZ
      : MOVE_BOUNDS_RECT.maxX

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

    // 對焦在場景中心（相機到 target 的距離，單位 mm），前後景自然模糊成微縮感
    pipeline.depthOfField.focusDistance = camera.radius * 1000
  }

  applyCameraFraming()

  // 初始側躺：頭朝畫面水平方向、背鰭面向鏡頭。橫/直取景畫面水平方向不同，分開給角度
  const isPortraitFraming = camera.alpha === Math.PI
  flopController.teleport(
    { x: 0, z: 0 },
    isPortraitFraming ? INITIAL_HEADING_PORTRAIT : INITIAL_HEADING_LANDSCAPE,
  )

  function setDarkMode(value: boolean) {
    environment.setDarkMode(value)
    hemisphericLight.intensity = value ? 0.5 : 0.72
    directionalLight.intensity = value ? 0.55 : 0.85
    fillLight.intensity = value ? 0.16 : 0.3
  }

  setDarkMode(options.isDark)

  // --- 點擊移動 ---
  let pointerDownX = 0
  let pointerDownY = 0
  let pointerDownId: number | undefined

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

    const moveDistance = Math.hypot(
      event.clientX - pointerDownX,
      event.clientY - pointerDownY,
    )
    if (moveDistance > TAP_DISTANCE_THRESHOLD) {
      return
    }

    const pickInfo = scene.pick(
      event.offsetX,
      event.offsetY,
      (mesh) => mesh === environment.sandMesh,
    )
    if (!pickInfo.hit || !pickInfo.pickedPoint) {
      return
    }

    const targetX = clamp(pickInfo.pickedPoint.x, MOVE_BOUNDS_RECT.minX, MOVE_BOUNDS_RECT.maxX)
    const targetZ = clamp(pickInfo.pickedPoint.z, MOVE_BOUNDS_RECT.minZ, MOVE_BOUNDS_RECT.maxZ)

    flopController.setTarget({ x: targetX, z: targetZ })
    environment.showClickMarker(targetX, targetZ)
  }

  canvas.addEventListener('pointerdown', handlePointerDown)
  canvas.addEventListener('pointerup', handlePointerUp)

  // --- 眼睛追游標：滑鼠 hover 時把游標投影到沙地作為注視點 ---
  let gazeWorldPoint: Vector3 | null = null
  function handlePointerMove(event: PointerEvent) {
    // 只追滑鼠 hover；觸控不觸發，維持自主張望
    if (event.pointerType !== 'mouse') {
      return
    }
    const pickInfo = scene.pick(
      event.offsetX,
      event.offsetY,
      (mesh) => mesh === environment.sandMesh,
    )
    if (pickInfo.hit && pickInfo.pickedPoint) {
      gazeWorldPoint = pickInfo.pickedPoint
    }
  }
  function handlePointerLeave() {
    gazeWorldPoint = null
  }
  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerleave', handlePointerLeave)

  // --- 每幀更新 ---
  let timeSeconds = 0

  function updateFish(deltaSeconds: number) {
    const pose = flopController.update(deltaSeconds)
    const groundHeight = getSandHeight(pose.x, pose.z)

    codModel.rootNode.position.set(
      pose.x,
      groundHeight + COD_LYING_LIFT * FISH_SCALE + pose.y,
      pose.z,
    )
    codModel.rootNode.rotation.y = pose.heading
    codModel.lieNode.rotation.z = LYING_ROLL + pose.roll

    const horizontalScale = FISH_SCALE / Math.sqrt(pose.squash)
    codModel.rootNode.scaling.set(
      horizontalScale,
      FISH_SCALE * pose.squash,
      horizontalScale,
    )

    // 身體 S 形扭動、胸鰭划水、尾鰭拍打、眨眼、瞳孔（有游標則看向游標）
    codModel.update({
      deltaSeconds,
      isMoving: pose.isMoving,
      gazeTarget: gazeWorldPoint,
    })
  }

  function renderFrame() {
    const deltaSeconds = Math.min(engine.getDeltaTime(), MAX_FRAME_DELTA_MS) / 1000
    timeSeconds += deltaSeconds

    updateFish(deltaSeconds)
    environment.update(timeSeconds, deltaSeconds, codModel.rootNode.position.x, codModel.rootNode.position.z)
    scene.render()
  }

  let isRunning = false

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
    setReducedMotion(value: boolean) {
      flopController.setSlideMode(value)
    },
    resize() {
      engine.resize()
      applyCameraFraming()
    },
    dispose() {
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
