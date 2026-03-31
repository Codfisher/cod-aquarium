import {
  ArcRotateCamera,
  Camera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  Vector3,
  WebGPUEngine,
} from '@babylonjs/core'
import { defaults } from 'lodash-es'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

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
      alpha: false,
      stencil: true,
    })
  },
  createScene({ engine }) {
    const scene = new Scene(engine)

    const hemisphericLight = new HemisphericLight(
      'hemisphericLight',
      new Vector3(0.5, 1, 0),
      scene,
    )
    hemisphericLight.diffuse = new Color3(1.0, 0.98, 0.95)
    hemisphericLight.intensity = 0.8
    hemisphericLight.groundColor = new Color3(0.4, 0.4, 0.5)

    // 方向光 + 陰影
    const directionalLight = new DirectionalLight(
      'directionalLight',
      new Vector3(-0.5, -1, -0.3),
      scene,
    )
    directionalLight.intensity = 0.6
    directionalLight.diffuse = new Color3(1.0, 0.95, 0.9)

    const shadowGenerator = new ShadowGenerator(1024, directionalLight)
    shadowGenerator.useBlurExponentialShadowMap = true
    shadowGenerator.blurKernel = 16

    scene.clearColor = new Color4(0.12, 0.12, 0.18, 1)

    return scene
  },
  createCamera({ scene, canvas }) {
    const camera = new ArcRotateCamera(
      'camera',
      0,
      Math.PI / 4,
      12,
      new Vector3(0, 0, 0),
      scene,
    )

    camera.attachControl(canvas, true)

    // 禁止平移
    camera.panningSensibility = 0

    // beta 範圍（允許程式碼控制聚焦角度）
    camera.lowerBetaLimit = Math.PI / 6
    camera.upperBetaLimit = Math.PI / 2.2

    // 縮放範圍（允許程式碼控制聚焦縮放）
    camera.lowerRadiusLimit = 4
    camera.upperRadiusLimit = 14
    // 禁止使用者手動縮放
    camera.wheelDeltaPercentage = 0
    camera.pinchDeltaPercentage = 0

    return camera
  },
  init: () => Promise.resolve(),
}

function setupCameraFovMode(
  engine: BabylonEngine,
  camera: ArcRotateCamera,
) {
  const width = engine.getRenderWidth()
  const height = engine.getRenderHeight()

  if (width < height) {
    camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED
  }
  else {
    camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED
  }
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

    setupCameraFovMode(engine.value, camera.value as ArcRotateCamera)
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
