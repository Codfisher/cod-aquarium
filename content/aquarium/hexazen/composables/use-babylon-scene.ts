import {
  ArcRotateCamera,
  Camera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
  WebGPUEngine,
} from '@babylonjs/core'
import { defaults } from 'lodash-es'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import '@babylonjs/loaders/glTF'

type BabylonEngine = Engine | WebGPUEngine

export interface InitParams {
  canvas: HTMLCanvasElement;
  engine: BabylonEngine;
  scene: Scene;
  camera: ArcRotateCamera;
}

interface UseBabylonSceneParam {
  createEngine?: (param: Omit<InitParams, 'camera' | 'scene' | 'engine'>) => Promise<BabylonEngine>;
  createScene?: (param: Omit<InitParams, 'camera' | 'scene'>) => Scene;
  createCamera?: (param: Omit<InitParams, 'camera'>) => ArcRotateCamera;
  init?: (param: InitParams) => Promise<void>;
}
const defaultParam: Required<UseBabylonSceneParam> = {
  async createEngine({ canvas }) {
    const webGPUSupported = await WebGPUEngine.IsSupportedAsync
    if (webGPUSupported) {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
        stencil: true,
      })
      await engine.initAsync()

      return engine
    }

    return new Engine(canvas, true, {
      antialias: true,
      alpha: true,
      stencil: true,
    })
  },
  createScene({ engine }) {
    const scene = new Scene(engine)
    /** 使用預設光源 */
    scene.createDefaultLight()

    const defaultLight = scene.lights.at(-1)
    if (defaultLight instanceof HemisphericLight) {
      defaultLight.diffuse = new Color3(1.0, 0.98, 0.95)
      defaultLight.direction = new Vector3(0.5, 1, 0)
      defaultLight.intensity = 0.9
      defaultLight.groundColor = new Color3(0.64, 0.56, 0.78)
    }

    scene.clearColor = new Color4(0.97, 0.97, 0.96, 1)

    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = new Color3(0.8, 0.8, 0.9)
    scene.fogStart = 10
    scene.fogEnd = 100

    return scene
  },
  createCamera({ scene, canvas }) {
    const camera = new ArcRotateCamera(
      'camera',
      0,
      Math.PI / 3 * 2,
      5,
      new Vector3(0, 0, 0),
      scene,
    )

    camera.attachControl(canvas, true)
    // 禁止平移
    camera.panningSensibility = 0

    camera.wheelDeltaPercentage = 0.01
    camera.lowerRadiusLimit = 5
    camera.upperRadiusLimit = 8

    // 限制鏡頭角度
    camera.lowerBetaLimit = Math.PI / 3
    camera.upperBetaLimit = Math.PI / 3

    return camera
  },
  init: () => Promise.resolve(),
}

function setupSmartCameraLimits(
  engine: BabylonEngine,
  camera: ArcRotateCamera,
  scene: Scene,
) {
  /** 全場景包圍盒的中心點 */
  const center = Vector3.Zero().clone()

  const width = engine.getRenderWidth()
  const height = engine.getRenderHeight()

  if (width < height) {
    camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED
  }
  else {
    camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED
  }

  const updateCameraSettings = () => {
    // scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true))

    // const { min, max } = scene.getWorldExtends((mesh) => {
    //   const isBackground = mesh.name === 'ground' || mesh.name === 'skyBox'

    //   return mesh.isVisible && mesh.isEnabled() && !isBackground
    // })

    // center.copyFrom(Vector3.Center(min, max))
    // const sceneRadius = Vector3.Distance(center, max)

    // 實測後，目前固定值即可，暫時不需要動態變更，FOVMODE 比較重要
    // const finalRadius = sceneRadius > 0 ? sceneRadius : 10
    const finalRadius = 4
    const safeDistance = finalRadius / Math.sin(camera.fov / 2)

    camera.lowerRadiusLimit = safeDistance * 0.2
    camera.upperRadiusLimit = safeDistance * 1

    // 避免距離拉近時產生破圖或閃爍
    camera.minZ = finalRadius * 0.1
  }

  updateCameraSettings()

  // engine.onResizeObservable.add(() => {
  //   updateCameraSettings()
  // })

  // scene.onNewMeshAddedObservable.add(() => {
  //   updateCameraSettings()
  // })
}

export function useBabylonScene(param?: UseBabylonSceneParam) {
  const canvasRef = ref<HTMLCanvasElement>()

  const engine = shallowRef<BabylonEngine>()
  const scene = shallowRef<Scene>()
  const camera = shallowRef<ArcRotateCamera>()

  const {
    createEngine,
    createScene,
    createCamera,
    init,
  } = defaults(param, defaultParam)

  onMounted(async () => {
    if (!canvasRef.value) {
      console.error('無法取得 canvas DOM')
      return
    }
    engine.value = await createEngine({
      canvas: canvasRef.value,
    })
    engine.value.setHardwareScalingLevel(
      1 / (window?.devicePixelRatio ?? 1),
    )

    scene.value = createScene({
      canvas: canvasRef.value,
      engine: engine.value,
    })
    camera.value = createCamera({
      canvas: canvasRef.value,
      engine: engine.value,
      scene: scene.value,
    })

    window.addEventListener('resize', handleResize)

    engine.value.runRenderLoop(() => {
      scene.value?.render()
    })

    await init({
      canvas: canvasRef.value,
      engine: engine.value,
      scene: scene.value,
      camera: camera.value,
    })

    setupSmartCameraLimits(engine.value, camera.value as ArcRotateCamera, scene.value)
  })

  onBeforeUnmount(() => {
    engine.value?.dispose()
    scene.value?.dispose()

    window.removeEventListener('resize', handleResize)
  })

  function handleResize() {
    engine.value?.resize()
  }

  return {
    canvasRef,
    engine,
    scene,
    camera,
  }
}
