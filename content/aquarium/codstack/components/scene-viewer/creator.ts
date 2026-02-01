import type { Scene } from '@babylonjs/core'
import type { BabylonEngine } from '../../composables/use-babylon-scene'
import { ArcRotateCamera, Camera, Color3, Color4, Engine, GizmoManager, Material, MeshBuilder, Vector3, Viewport } from '@babylonjs/core'
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

  // 同時渲染兩個相機
  scene.activeCameras = [camera, sideCamera]

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
  scene: Scene
  camera: Camera
  engine: BabylonEngine
}) {
  const topCamera = new ArcRotateCamera(
    'topCamera',
    0,
    0.0001, // 俯視（避免 beta=0 奇異點）
    10,
    new Vector3(0, 0, 0),
    scene,
  )

  // 建議放在右上角 sideCamera 的「下面」，避免重疊
  topCamera.viewport = new Viewport(0.80, 0.60, 0.20, 0.20)
  topCamera.mode = Camera.ORTHOGRAPHIC_CAMERA

  topCamera.detachControl()
  topCamera.inputs.clear()

  // 讓俯視畫面「上方」方向穩定（用 Z 當螢幕上方）
  topCamera.upVector = new Vector3(0, 0, 1)

  // 同時渲染多個相機（避免直接覆蓋其他已經存在的 activeCameras）
  const actives = scene.activeCameras?.slice() ?? []
  if (!actives.includes(camera)) actives.unshift(camera)
  if (!actives.includes(topCamera)) actives.push(topCamera)
  scene.activeCameras = actives

  const orthoSize = 2.5

  // 只在 topCamera 顯示輔助線
  const MAIN_MASK = 0x0fffffff
  const TOP_ONLY_MASK = 0x20000000
  camera.layerMask = MAIN_MASK
  topCamera.layerMask = MAIN_MASK | TOP_ONLY_MASK

  // 建十字線（都放在 y=0 平面上）
  const topHLine = MeshBuilder.CreateLines(
    'topHLine',
    { points: [new Vector3(-1, 0, 0), new Vector3(1, 0, 0)], updatable: true },
    scene,
  )
  topHLine.color = new Color3(0.7, 0.7, 0.7)
  topHLine.isPickable = false
  topHLine.layerMask = TOP_ONLY_MASK

  const topVLine = MeshBuilder.CreateLines(
    'topVLine',
    { points: [new Vector3(0, 0, -1), new Vector3(0, 0, 1)], updatable: true },
    scene,
  )
  topVLine.color = new Color3(0.7, 0.7, 0.7)
  topVLine.isPickable = false
  topVLine.layerMask = TOP_ONLY_MASK

  function update() {
    const aspect = engine.getRenderWidth() / engine.getRenderHeight()

    topCamera.orthoLeft = -orthoSize * aspect
    topCamera.orthoRight = orthoSize * aspect
    topCamera.orthoTop = orthoSize
    topCamera.orthoBottom = -orthoSize

    // 以 topCamera target 的 x/z 為中心，y 固定 0
    const center = topCamera.target.clone()
    center.y = 0

    const halfW = orthoSize * aspect
    const halfH = orthoSize

    // 螢幕水平線：往相機右方延伸（投影到地面）
    const rightDir = topCamera.getDirection(Vector3.Right())
    rightDir.y = 0
    if (rightDir.lengthSquared() > 1e-8) rightDir.normalize()

    const h1 = center.add(rightDir.scale(-halfW))
    const h2 = center.add(rightDir.scale(halfW))
    MeshBuilder.CreateLines('', { points: [h1, h2], instance: topHLine }, scene)

    // 螢幕垂直線：往相機上方延伸（投影到地面）
    const upDir = topCamera.getDirection(Vector3.Up())
    upDir.y = 0
    if (upDir.lengthSquared() > 1e-8) upDir.normalize()

    const v1 = center.add(upDir.scale(-halfH))
    const v2 = center.add(upDir.scale(halfH))
    MeshBuilder.CreateLines('', { points: [v1, v2], instance: topVLine }, scene)
  }

  update()
  engine.onResizeObservable.add(update)

  // 副相機底色（只清 topCamera 的 viewport 範圍）
  const topViewColor = new Color4(0.92, 0.92, 0.92, 1)
  scene.onBeforeCameraRenderObservable.add((cam) => {
    if (cam.id === 'topCamera') {
      const viewport = cam.viewport
      const width = engine.getRenderWidth()
      const height = engine.getRenderHeight()

      const x = viewport.x * width
      const y = viewport.y * height
      const w = viewport.width * width
      const h = viewport.height * height

      engine.enableScissor(x, y, w, h)
      engine.clear(topViewColor, true, true, true)
      engine.disableScissor()
    }
  })

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
