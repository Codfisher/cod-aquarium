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
  const updateOrtho = () => {
    const aspect = engine.getRenderWidth() / engine.getRenderHeight()

    sideCamera.orthoLeft = -orthoSize * aspect
    sideCamera.orthoRight = orthoSize * aspect
    sideCamera.orthoTop = orthoSize
    sideCamera.orthoBottom = -orthoSize
  }
  updateOrtho()
  engine.onResizeObservable.add(updateOrtho)

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
