import type {
  Camera,
} from '@babylonjs/core'
import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
  WebGPUEngine,
} from '@babylonjs/core'
import { defaults } from 'lodash-es'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

type BabylonEngine = Engine | WebGPUEngine

export interface InitParam {
  canvas: HTMLCanvasElement;
  engine: BabylonEngine;
  scene: Scene;
  camera: Camera;
}

interface UseBabylonSceneParam {
  createEngine?: (param: Omit<InitParam, 'camera' | 'scene' | 'engine'>) => Promise<BabylonEngine>;
  createScene?: (param: Omit<InitParam, 'camera' | 'scene'>) => Scene;
  createCamera?: (param: Omit<InitParam, 'camera'>) => Camera;
  init?: (param: InitParam) => Promise<void>;
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

    return scene
  },
  createCamera({ scene }) {
    const camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 2,
      10,
      new Vector3(0, 0, 0),
      scene,
    )

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

    window.addEventListener('resize', handleResize)

    /** 反覆渲染場景，這樣畫面才會持續變化 */
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
