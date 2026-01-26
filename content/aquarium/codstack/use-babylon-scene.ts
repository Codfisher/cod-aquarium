import type {
  Camera,
} from '@babylonjs/core'
import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
  WebGPUEngine,
} from '@babylonjs/core'
import { useEventListener } from '@vueuse/core'
import { defaults } from 'lodash-es'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import '@babylonjs/loaders/glTF'

type BabylonEngine = Engine | WebGPUEngine

export interface InitParams {
  canvas: HTMLCanvasElement;
  engine: BabylonEngine;
  scene: Scene;
  camera: Camera;
}

interface UseBabylonSceneParam {
  createEngine?: (param: Omit<InitParams, 'camera' | 'scene' | 'engine'>) => Promise<BabylonEngine>;
  createScene?: (param: Omit<InitParams, 'camera' | 'scene'>) => Scene;
  createCamera?: (param: Omit<InitParams, 'camera'>) => Camera;
  init?: (param: InitParams) => Promise<void>;
}
const defaultParam: Required<UseBabylonSceneParam> = {
  async createEngine({ canvas }) {
    const webGPUSupported = await WebGPUEngine.IsSupportedAsync
    if (webGPUSupported) {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
      })
      await engine.initAsync()

      return engine
    }

    return new Engine(canvas, true, {
      alpha: true,
    })
  },
  createScene({ engine }) {
    const scene = new Scene(engine)
    /** 使用預設光源 */
    scene.createDefaultLight()

    const defaultLight = scene.lights.at(-1)
    if (defaultLight instanceof HemisphericLight) {
      defaultLight.direction = new Vector3(0.5, 1, 0)
    }

    scene.clearColor = new Color4(1, 1, 1, 1)

    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = new Color3(0.8, 0.8, 0.8)
    scene.fogStart = 20
    scene.fogEnd = 30

    return scene
  },
  createCamera({ scene, canvas }) {
    const camera = new ArcRotateCamera(
      'camera',
      0,
      Math.PI / 3 * 2,
      10,
      new Vector3(0, 0, 0),
      scene,
    )

    camera.attachControl(canvas, true)
    // 禁止平移
    camera.panningSensibility = 0

    camera.wheelDeltaPercentage = 0.01
    camera.lowerRadiusLimit = 10
    camera.upperRadiusLimit = 50

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
  const camera = shallowRef<Camera>()

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
    scene.value = createScene({
      canvas: canvasRef.value,
      engine: engine.value,
    })
    camera.value = createCamera({
      canvas: canvasRef.value,
      engine: engine.value,
      scene: scene.value,
    })

    engine.value.runRenderLoop(() => {
      scene.value?.render()
    })

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
  })

  function handleResize() {
    engine.value?.resize()
  }

  useEventListener('resize', handleResize)
  useEventListener(canvasRef, 'resize', handleResize)

  return {
    canvasRef,
    engine,
    scene,
    camera,
  }
}
