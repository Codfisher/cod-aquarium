import type {
  WebGPUEngine,
} from '@babylonjs/core'
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  Engine,
  HavokPlugin,
  HemisphericLight,
  Scene,
  Vector3,
} from '@babylonjs/core'
import HavokPhysics from '@babylonjs/havok'
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
    // const webGPUSupported = await WebGPUEngine.IsSupportedAsync
    // if (webGPUSupported) {
    //   const engine = new WebGPUEngine(canvas, {
    //     antialias: false,
    //     stencil: true,
    //     powerPreference: 'high-performance',
    //   })
    //   await engine.initAsync()

    //   return engine
    // }

    return new Engine(canvas, true, {
      antialias: false,
      stencil: true,
      disableWebGL2Support: true,
      powerPreference: 'high-performance',
    })
  },
  createScene({ engine }) {
    const scene = new Scene(engine)

    scene.clearColor = new Color4(0, 0, 0, 0)
    scene.createDefaultLight()

    const defaultLight = scene.lights.at(-1)
    if (defaultLight instanceof HemisphericLight) {
      defaultLight.diffuse = new Color3(1, 0.85, 0.8)
      defaultLight.groundColor = new Color3(0.5, 0.2, 0.6)
    }

    return scene
  },
  createCamera({ scene, canvas }) {
    const camera = new ArcRotateCamera(
      'camera',
      0,
      Math.PI / 3 * 2,
      20,
      new Vector3(0, 0, 0),
      scene,
    )

    camera.attachControl(canvas, true)
    // 禁止平移
    camera.panningSensibility = 0

    camera.wheelDeltaPercentage = 0.01
    camera.lowerRadiusLimit = 5
    camera.upperRadiusLimit = 50
    camera.panningSensibility = 0

    // 限制鏡頭角度
    camera.lowerBetaLimit = 0
    camera.upperBetaLimit = Math.PI / 3

    return camera
  },
  init: () => Promise.resolve(),
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
    // engine.value.setHardwareScalingLevel(Math.max(
    //   2,
    //   window?.devicePixelRatio ?? 1,
    // ))

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

    const pipeline = new DefaultRenderingPipeline(
      'toyPipeline',
      true,
      scene.value,
      [camera.value],
    )

    // 色彩調整 (Image Processing)
    pipeline.imageProcessingEnabled = true
    pipeline.imageProcessing.contrast = 2

    // 邊緣平滑
    // pipeline.fxaaEnabled = true

    const havokInstance = await HavokPhysics()
    const havokPlugin = new HavokPlugin(true, havokInstance)
    scene.value.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin)

    await init({
      canvas: canvasRef.value,
      engine: engine.value,
      scene: scene.value,
      camera: camera.value,
    })
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
