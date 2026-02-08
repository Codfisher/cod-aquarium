import type {
  Camera,
} from '@babylonjs/core'
import {
  ArcRotateCamera,
  Color3,
  Color4,
  ColorCurves,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Mesh,
  MeshBuilder,
  Scene,
  Vector3,
  WebGPUEngine,
} from '@babylonjs/core'
import { GradientMaterial } from '@babylonjs/materials'
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

    scene.clearColor = new Color4(0.98, 0.96, 0.93, 1)
    scene.createDefaultLight()

    const defaultLight = scene.lights.at(-1)
    if (defaultLight instanceof HemisphericLight) {
      defaultLight.diffuse = new Color3(1, 0.95, 0.9) // 微微的暖黃光
      defaultLight.groundColor = new Color3(0.5, 0.5, 0.5) // 地面反射光不要太黑
    }

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
    camera.lowerRadiusLimit = 2
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

    engine.value.runRenderLoop(() => {
      scene.value?.render()
    })

    const pipeline = new DefaultRenderingPipeline(
      'toyPipeline', // 名稱
      true, // 開啟 HDR
      scene.value, // 場景
      [camera.value], // 套用到所有攝影機
    )

    // 3. 色彩調整 (Image Processing)
    pipeline.imageProcessingEnabled = true

    // 曝光度：稍微過曝一點點，看起來比較乾淨明亮
    // pipeline.imageProcessing.exposure = 1.1

    // 對比度：稍微降低，避免黑影太深
    // pipeline.imageProcessing.contrast = 1.2

    // 4. 色彩曲線 (Color Curves) - 這是「溫和感」的關鍵
    pipeline.imageProcessing.colorCurvesEnabled = true
    const curve = new ColorCurves()

    // 陰影飽和度：讓陰影不要髒髒的
    curve.shadowsSaturation = -10
    curve.shadowsHue = -50

    pipeline.imageProcessing.colorCurves = curve

    // 5. FXAA - 額外的邊緣平滑
    // pipeline.fxaaEnabled = true

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
