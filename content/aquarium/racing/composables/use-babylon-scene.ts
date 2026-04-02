import type { Camera } from '@babylonjs/core'
import {
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
  WebGPUEngine,
} from '@babylonjs/core'
import { until, useElementSize, watchDebounced } from '@vueuse/core'
import { defaults } from 'lodash-es'
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import '@babylonjs/loaders/glTF'

export type BabylonEngine = Engine | WebGPUEngine

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
        stencil: true,
      })
      await engine.initAsync()
      return engine
    }

    return new Engine(canvas, true, {
      alpha: true,
      stencil: true,
    })
  },
  createScene({ engine }) {
    const scene = new Scene(engine)
    /** 使用右手座標系，與 Godot / glTF 一致，消除所有座標轉換問題 */
    scene.useRightHandedSystem = true
    scene.createDefaultLight()

    const defaultLight = scene.lights.at(-1)
    if (defaultLight instanceof HemisphericLight) {
      defaultLight.direction = new Vector3(0.5, 1, 0)
    }

    scene.clearColor = new Color4(0.6, 0.75, 0.9, 1)
    return scene
  },
  createCamera({ scene, canvas }) {
    const camera = new ArcRotateCamera(
      'camera',
      Math.PI / 4,
      Math.PI / 3.5,
      16,
      new Vector3(0, 0, 0),
      scene,
    )
    camera.attachControl(canvas, false)
    camera.fov = 0.7
    return camera
  },
  init: () => Promise.resolve(),
}

export function useBabylonScene(params?: UseBabylonSceneParam) {
  const canvasRef = ref<HTMLCanvasElement>()

  const engine = shallowRef<BabylonEngine>()
  const scene = shallowRef<Scene>()
  const camera = shallowRef<Camera>()

  const {
    createEngine,
    createScene,
    createCamera,
    init,
  } = defaults(params, defaultParam)

  onMounted(async () => {
    await until(canvasRef).toBeTruthy()

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

  const canvasSize = reactive(useElementSize(canvasRef))
  watchDebounced(canvasSize, () => {
    engine.value?.resize()
  }, {
    debounce: 200,
  })

  return {
    canvasRef,
    engine,
    scene,
    camera,
  }
}
