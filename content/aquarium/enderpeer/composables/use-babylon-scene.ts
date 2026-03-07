import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  UniversalCamera,
  Vector3,
  WebGPUEngine,
} from '@babylonjs/core'
import { useEventListener, useMediaQuery } from '@vueuse/core'
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
    const isMobile = useMediaQuery('(pointer: coarse)')

    if (!isMobile.value) {
      try {
        const webGPUSupported = await WebGPUEngine.IsSupportedAsync
        if (webGPUSupported) {
          const engine = new WebGPUEngine(canvas, {
            antialias: false,
            stencil: false,
          })
          await engine.initAsync()

          return engine
        }
      }
      catch (error) {
        console.warn('WebGPU 初始化失敗，準備降級至 WebGL：', error)
      }
    }

    return new Engine(canvas, true, {
      antialias: false,
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: false,
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

    const sunLightDirection = new Vector3(-0.5, -1, 0.3).normalize()
    const sunLight = new DirectionalLight(
      SUN_LIGHT_NAME,
      sunLightDirection,
      scene,
    )
    sunLight.intensity = 0.8
    sunLight.diffuse = new Color3(1.0, 0.98, 0.92)

    /**
     * 一般 ShadowGenerator 需要明確的光源位置與正交投影範圍
     * 以便建立 ShadowMap 的範圍
     */
    sunLight.position = new Vector3(WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE / 2)
    // 設定投影大小涵蓋整個世界
    const halfSize = WORLD_SIZE / 1.5 // 留點緩衝
    sunLight.orthoLeft = -halfSize
    sunLight.orthoRight = halfSize
    sunLight.orthoTop = halfSize
    sunLight.orthoBottom = -halfSize
    sunLight.autoCalcShadowZBounds = true

    const isMobile = useMediaQuery('(pointer: coarse)')
    const sg = new ShadowGenerator(isMobile.value ? 256 : 512, sunLight)
    sg.bias = 0.005
    sg.normalBias = 0.08
    if (isMobile.value) {
      sg.usePercentageCloserFiltering = false
    }
    else {
      sg.usePercentageCloserFiltering = true
      sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
    }

    scene.fogMode = Scene.FOGMODE_LINEAR
    scene.fogColor = new Color3(0.53, 0.74, 0.93)
    scene.fogStart = 30
    scene.fogEnd = 60

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
    camera.fov = 1.3

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

    const isMobile = useMediaQuery('(pointer: coarse)')
    engine.value.setHardwareScalingLevel(
      isMobile.value
        ? Math.max(1, window?.devicePixelRatio ?? 1)
        : 1 / (window?.devicePixelRatio ?? 1),
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

    useEventListener(window, 'resize', handleResize)
    useEventListener(canvasRef, 'webglcontextlost', (event) => {
      event.preventDefault()
      console.error('[Babylon] WebGL context lost')
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

  return {
    canvasRef,
    engine,
    scene,
    camera,
  }
}
