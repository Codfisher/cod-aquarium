import type { Scene, TransformNode } from '@babylonjs/core'
import type { BabylonEngine } from '../../composables/use-babylon-scene'
import { ArcRotateCamera, AxesViewer, Camera, Color3, Color4, Engine, GizmoManager, Material, MeshBuilder, Vector3, Viewport } from '@babylonjs/core'
import { GridMaterial } from '@babylonjs/materials'

export function createGround({ scene }: { scene: Scene }) {
  const ground = MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, scene)
  ground.visibility = 0.9

  const groundMaterial = new GridMaterial('groundMaterial', scene)
  groundMaterial.gridRatio = 1

  groundMaterial.majorUnitFrequency = 10
  groundMaterial.minorUnitVisibility = 0.45
  groundMaterial.mainColor = new Color3(1, 1, 1)
  groundMaterial.lineColor = new Color3(0.6, 0.6, 0.6)

  ground.material = groundMaterial

  return ground
}

export function createSideCamera({
  scene,
  camera,
  engine,
}: {
  scene: Scene;
  camera: Camera;
  engine: BabylonEngine;
}) {
  const sideCamera = new ArcRotateCamera(
    'sideCamera',
    0,
    Math.PI / 2,
    10,
    new Vector3(0, 0, 0),
    scene,
  )

  sideCamera.viewport = new Viewport(0.80, 0.80, 0.20, 0.20)
  sideCamera.mode = Camera.ORTHOGRAPHIC_CAMERA

  sideCamera.detachControl()
  sideCamera.inputs.clear()

  // 同時渲染多個相機（避免直接覆蓋其他已經存在的 activeCameras）
  const actives = scene.activeCameras?.slice() ?? []
  if (!actives.includes(camera))
    actives.unshift(camera)
  if (!actives.includes(sideCamera))
    actives.push(sideCamera)
  scene.activeCameras = actives

  const orthoSize = 2.5

  // 水平線只出現在 sideCamera
  const MAIN_MASK = 0x0FFFFFFF
  const SIDE_ONLY_MASK = 0x10000000
  camera.layerMask = MAIN_MASK
  sideCamera.layerMask = MAIN_MASK | SIDE_ONLY_MASK

  // 建一條 y=0 的線
  const y0Line = MeshBuilder.CreateLines(
    'y0Line',
    { points: [new Vector3(-1, 0, 0), new Vector3(1, 0, 0)], updatable: true },
    scene,
  )
  y0Line.color = new Color3(0.7, 0.7, 0.7)
  y0Line.isPickable = false
  y0Line.layerMask = SIDE_ONLY_MASK

  function update() {
    const aspect = engine.getRenderWidth() / engine.getRenderHeight()

    sideCamera.orthoLeft = -orthoSize * aspect
    sideCamera.orthoRight = orthoSize * aspect
    sideCamera.orthoTop = orthoSize
    sideCamera.orthoBottom = -orthoSize

    // y=0 線：以 sideCamera target 的 x/z 為中心，y 固定 0，往「相機右方」延伸
    const halfWidth = orthoSize * aspect
    const center = sideCamera.target.clone()
    center.y = 0

    const rightDir = sideCamera.getDirection(Vector3.Right()) // 相機右方向（世界座標）
    const p1 = center.add(rightDir.scale(-halfWidth))
    const p2 = center.add(rightDir.scale(halfWidth))

    MeshBuilder.CreateLines('', { points: [p1, p2], instance: y0Line }, scene)
  }
  update()
  engine.onResizeObservable.add(update)

  // 加上副相機的底色
  const sideViewColor = new Color4(0.9, 0.9, 0.9, 1)
  scene.onBeforeCameraRenderObservable.add((camera) => {
    if (camera.id === 'sideCamera') {
      const viewport = camera.viewport

      // 1. 取得畫布實際像素尺寸
      const width = engine.getRenderWidth()
      const height = engine.getRenderHeight()

      // 2. 計算副相機視窗在畫面上的實際像素位置 (Scissor Box)
      // Viewport 的參數是 (x, y, width, height) 比例 (0~1)
      const x = viewport.x * width
      const y = viewport.y * height
      const w = viewport.width * width
      const h = viewport.height * height

      // 3. 開啟剪裁功能，只允許在該區域繪製/清除
      engine.enableScissor(x, y, w, h)

      // 4. 執行清除 (只會影響被剪裁的區域)
      engine.clear(sideViewColor, true, true, true)

      // 5. 關閉剪裁，以免影響到後續或其他相機的正常渲染
      engine.disableScissor()
    }
  })

  return sideCamera
}

export function createTopCamera({
  scene,
  camera,
  engine,
}: {
  scene: Scene;
  camera: Camera;
  engine: BabylonEngine;
}) {
  const topCamera = new ArcRotateCamera(
    'topCamera',
    Math.PI / 2,
    0.0001, // 俯視（避免 beta=0 奇異點）
    10,
    new Vector3(0, 0, 0),
    scene,
  )

  // 放在右上角 sideCamera 的「下面」，避免重疊
  topCamera.viewport = new Viewport(0.80, 0.60, 0.20, 0.20)
  topCamera.mode = Camera.ORTHOGRAPHIC_CAMERA

  topCamera.detachControl()
  topCamera.inputs.clear()

  // 讓俯視畫面「上方」方向穩定
  topCamera.upVector = new Vector3(0, 1, 0)
  topCamera.alpha = Math.PI / 2

  // 同時渲染多個相機（避免直接覆蓋其他已經存在的 activeCameras）
  const actives = scene.activeCameras?.slice() ?? []
  if (!actives.includes(camera))
    actives.unshift(camera)
  if (!actives.includes(topCamera))
    actives.push(topCamera)
  scene.activeCameras = actives

  const orthoSize = 2.5

  function update() {
    const aspect = engine.getRenderWidth() / engine.getRenderHeight()

    topCamera.orthoLeft = -orthoSize * aspect
    topCamera.orthoRight = orthoSize * aspect
    topCamera.orthoTop = orthoSize
    topCamera.orthoBottom = -orthoSize
  }

  update()
  engine.onResizeObservable.add(update)

  return topCamera
}

export function createGizmoManager({
  scene,
  camera,
}: {
  scene: Scene;
  camera: Camera;
}) {
  const gizmoManager = new GizmoManager(scene)

  gizmoManager.utilityLayer.setRenderCamera(camera)

  gizmoManager.positionGizmoEnabled = true
  gizmoManager.rotationGizmoEnabled = true
  gizmoManager.scaleGizmoEnabled = true
  gizmoManager.boundingBoxGizmoEnabled = true
  // 關閉自由拖動
  gizmoManager.boundingBoxDragBehavior.disableMovement = true
  gizmoManager.usePointerToAttachGizmos = false

  const { gizmos } = gizmoManager
  if (gizmos?.positionGizmo) {
    gizmos.positionGizmo.planarGizmoEnabled = false
    gizmos.positionGizmo.gizmoLayer.setRenderCamera(camera)
  }
  if (gizmos?.rotationGizmo) {
    gizmos.rotationGizmo.gizmoLayer.setRenderCamera(camera)
  }
  if (gizmos?.scaleGizmo) {
    gizmos.scaleGizmo.gizmoLayer.setRenderCamera(camera)
  }

  if (gizmos?.boundingBoxGizmo) {
    gizmos.boundingBoxGizmo.rotationSphereSize = 0

    gizmos.boundingBoxGizmo.setEnabledScaling(false)
    gizmos.boundingBoxGizmo.setEnabledRotationAxis('')
    gizmos.boundingBoxGizmo.gizmoLayer.setRenderCamera(camera)
  }

  return gizmoManager
}

/** 建立畫面角落的座標指示器 */
export function createScreenAxes(params: {
  scene: Scene;
  /** 主要操作的相機 (必須是 ArcRotateCamera 才能完美同步) */
  mainCamera: ArcRotateCamera;
}) {
  const { scene, mainCamera } = params

  // 1. 定義一個特殊的 LayerMask ID (例如 0x20000000)
  // 這是為了讓這組座標軸「只」被座標相機看到，而不被主相機看到
  const AXIS_LAYER_MASK = 0x20000000

  // 2. 建立專用的座標相機
  const axisCamera = new ArcRotateCamera(
    'axisCamera',
    mainCamera.alpha,
    mainCamera.beta,
    10, // 半徑固定，確保座標軸大小一致
    Vector3.Zero(),
    scene,
  )

  // 設定相機模式與遮罩
  axisCamera.mode = Camera.ORTHOGRAPHIC_CAMERA // 使用正交投影，看起來比較像 UI
  axisCamera.layerMask = AXIS_LAYER_MASK // 只看得到座標軸
  axisCamera.orthoTop = 2
  axisCamera.orthoBottom = -2
  axisCamera.orthoLeft = -2
  axisCamera.orthoRight = 2

  // 設定視口位置 (Viewport)
  // 參數: x, y, width, height (0~1)
  // 這裡設為右上角，寬高佔 15%
  axisCamera.viewport = new Viewport(0.85, 0.85, 0.15, 0.15)

  // 3. 確保主相機「看不到」這個座標軸，否則會在場景中央出現一個巨大的座標軸
  // 將主相機的遮罩設為：原本的遮罩 AND (反轉 AXIS_LAYER_MASK) -> 意即排除掉 Axis Layer
  mainCamera.layerMask &= ~AXIS_LAYER_MASK

  // 4. 建立座標軸模型
  const axesViewer = new AxesViewer(scene, 1) // 尺寸 1

  // 將產生的三個軸 Mesh 設定為特殊的 LayerMask
  const updateLayerMask = (node: TransformNode) => {
    node.getChildMeshes().forEach((mesh) => {
      mesh.layerMask = AXIS_LAYER_MASK
    })
  }

  updateLayerMask(axesViewer.xAxis)
  updateLayerMask(axesViewer.yAxis)
  updateLayerMask(axesViewer.zAxis)

  // 5. 同步旋轉邏輯
  const observer = scene.onBeforeRenderObservable.add(() => {
    // 只需要同步 Alpha 和 Beta (旋轉角度)
    axisCamera.alpha = mainCamera.alpha
    axisCamera.beta = mainCamera.beta

    // 如果您的主相機是用 Quaternion 控制的，則需要同步 rotationQuaternion
    // 但通常 ArcRotateCamera 主要是 alpha/beta
  })

  // 6. 註冊相機 (重要！)
  // 必須確保 activeCameras 包含主相機與座標相機
  if (scene.activeCameras?.length === 0) {
    scene.activeCameras.push(mainCamera)
  }
  scene.activeCameras?.push(axisCamera)

  // 回傳清理函式
  return () => {
    scene.onBeforeRenderObservable.remove(observer)
    axisCamera.dispose()
    axesViewer.dispose()
    // 移除 activeCamera
    const index = scene.activeCameras?.indexOf(axisCamera)
    if (typeof index === 'number' && index !== -1) {
      scene.activeCameras?.splice(index, 1)
    }
    // 還原主相機遮罩 (非必要，但良好習慣)
    mainCamera.layerMask |= AXIS_LAYER_MASK
  }
}
