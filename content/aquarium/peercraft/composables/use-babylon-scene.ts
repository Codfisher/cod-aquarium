import {
  CascadedShadowGenerator,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  UniversalCamera,
  Vector3,
  WebGPUEngine,
} from '@babylonjs/core'
import { defaults } from 'lodash-es'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { WORLD_SIZE } from '../domains/world/world-constants'

type BabylonEngine = Engine | WebGPUEngine

export interface InitParams {
  canvas: HTMLCanvasElement;
  engine: BabylonEngine;
  scene: Scene;
  camera: UniversalCamera;
}

interface UseBabylonSceneParam {
  createEngine?: (param: Omit<InitParams, 'camera' | 'scene' | 'engine'>) => Promise<BabylonEngine>;
  createScene?: (param: Omit<InitParams, 'camera' | 'scene'>) => Scene;
  createCamera?: (param: Omit<InitParams, 'camera'>) => UniversalCamera;
  init?: (param: InitParams) => Promise<void>;
}

export const SUN_LIGHT_NAME = 'sun-directional'

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
      preserveDrawingBuffer: true,
    })
  },
  createScene({ engine }) {
    const scene = new Scene(engine)

    scene.clearColor = new Color4(0.53, 0.74, 0.93, 1)

    /** 環境補光（不投射陰影） */
    const ambientLight = new HemisphericLight(
      'ambient',
      new Vector3(0, 1, 0),
      scene,
    )
    ambientLight.intensity = 0.5
    ambientLight.diffuse = new Color3(0.9, 0.9, 1.0)
    ambientLight.groundColor = new Color3(0.3, 0.3, 0.4)

    /** 太陽（投射陰影） */
    const sunLight = new DirectionalLight(
      SUN_LIGHT_NAME,
      new Vector3(-0.5, -1, 0.3).normalize(),
      scene,
    )
    sunLight.intensity = 0.8
    sunLight.diffuse = new Color3(1.0, 0.98, 0.92)

    /** 級聯陰影 */
    const csm = new CascadedShadowGenerator(1024, sunLight)
    csm.numCascades = 4
    csm.lambda = 0.7
    csm.cascadeBlendPercentage = 0.05
    csm.stabilizeCascades = true
    csm.shadowMaxZ = 90
    csm.usePercentageCloserFiltering = true
    csm.bias = 0.001
    csm.normalBias = 0.002

    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = new Color3(0.53, 0.74, 0.93)
    scene.fogStart = 40
    scene.fogEnd = 90

    return scene
  },
  createCamera({ scene, canvas }) {
    const spawnPosition = new Vector3(
      WORLD_SIZE / 2,
      12,
      WORLD_SIZE / 2,
    )

    const camera = new UniversalCamera(
      'fps-camera',
      spawnPosition,
      scene,
    )

    camera.setTarget(new Vector3(
      WORLD_SIZE / 2,
      8,
      WORLD_SIZE / 2 + 10,
    ))

    camera.attachControl(canvas, true)
    camera.minZ = 0.1
    /** 擴大 FOV 讓畫面看起來比較寬廣、不會太有壓迫感 (預設是 0.8)
     *
     * 不然走個路都感覺臉貼在方塊上 (́⊙◞౪◟⊙‵)
     */
    camera.fov = 1.2

    return camera
  },
  init: () => Promise.resolve(),
}

export function useBabylonScene(param?: UseBabylonSceneParam) {
  const canvasRef = ref<HTMLCanvasElement>()

  const engine = shallowRef<BabylonEngine>()
  const scene = shallowRef<Scene>()
  const camera = shallowRef<UniversalCamera>()

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
