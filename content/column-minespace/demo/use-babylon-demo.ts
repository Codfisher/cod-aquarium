import type {
  ArcRotateCamera,
  Engine,
  Scene,
} from '@babylonjs/core'
import { useElementSize, useIntersectionObserver } from '@vueuse/core'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'

/**
 * 文章用的 Babylon 範例場景
 *
 * 一篇文章可能塞十幾個 3D 範例，全部一進頁面就開引擎的話，
 * 光是那十幾份 WebGL 環境就足以讓瀏覽器跪下。
 *
 * 所以這裡做兩件事：
 *
 * 一、Babylon 本體用動態 import。它是幾 MB 的東西，
 *     沒捲到範例就不該下載，順便也讓 SSR 完全碰不到 window。
 * 二、捲進畫面才建引擎，捲出去就停掉算繪迴圈。
 *     停掉的是 runRenderLoop 而不是整個引擎，捲回來能立刻接上
 */

/** 動態載入的 Babylon 模組 */
export type BabylonModule = typeof import('@babylonjs/core')

export interface BabylonDemoContext {
  babylon: BabylonModule;
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
}

export interface UseBabylonDemoParam {
  /**
   * 場景內容
   *
   * 引擎、場景與鏡頭都建好之後才呼叫，可以回傳一個清理函式
   */
  setup: (context: BabylonDemoContext) => void | (() => void) | Promise<void | (() => void)>;
  /** 鏡頭初始的水平角、垂直角與距離 */
  cameraAlpha?: number;
  cameraBeta?: number;
  cameraRadius?: number;
  /** 鏡頭看向哪裡 */
  cameraTarget?: [number, number, number];
  /** 背景色，不給就用透明 */
  clearColor?: [number, number, number, number];
  /** 是否允許使用者拖曳旋轉 */
  interactive?: boolean;
}

export function useBabylonDemo(param: UseBabylonDemoParam) {
  const containerRef = ref<HTMLElement>()
  const canvasRef = ref<HTMLCanvasElement>()

  const engine = shallowRef<Engine>()
  const scene = shallowRef<Scene>()
  const camera = shallowRef<ArcRotateCamera>()

  /** 引擎還沒建好之前顯示載入提示 */
  const isReady = ref(false)
  const errorMessage = ref('')

  let disposeSetup: (() => void) | undefined
  let isStarting = false
  let isVisible = false

  const canvasSize = useElementSize(canvasRef)

  async function start() {
    if (isStarting || engine.value || !canvasRef.value)
      return

    isStarting = true

    try {
      const babylon = await import('@babylonjs/core')

      /** 等待期間元件可能已經被卸載 */
      if (!canvasRef.value)
        return

      const currentEngine = new babylon.Engine(canvasRef.value, true, {
        antialias: true,
        alpha: true,
        stencil: false,
        preserveDrawingBuffer: false,
      })

      const currentScene = new babylon.Scene(currentEngine)
      const [red, green, blue, alpha] = param.clearColor ?? [0, 0, 0, 0]
      currentScene.clearColor = new babylon.Color4(red, green, blue, alpha)

      const currentCamera = new babylon.ArcRotateCamera(
        'demo-camera',
        param.cameraAlpha ?? -Math.PI / 2.4,
        param.cameraBeta ?? Math.PI / 3,
        param.cameraRadius ?? 12,
        new babylon.Vector3(...(param.cameraTarget ?? [0, 0, 0])),
        currentScene,
      )

      if (param.interactive !== false) {
        currentCamera.attachControl(canvasRef.value, true)
        /**
         * 滾輪縮放要拿掉
         *
         * 文章是要捲的。滑鼠經過範例時把捲動吃掉，
         * 讀者會以為頁面卡住了
         */
        currentCamera.inputs.attached.mousewheel?.detachControl()
      }
      currentCamera.lowerRadiusLimit = 2
      currentCamera.upperRadiusLimit = 200

      engine.value = currentEngine
      scene.value = currentScene
      camera.value = currentCamera

      const result = await param.setup({
        babylon,
        engine: currentEngine,
        scene: currentScene,
        camera: currentCamera,
      })
      if (typeof result === 'function') {
        disposeSetup = result
      }

      isReady.value = true

      if (isVisible) {
        resume()
      }
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    }
    finally {
      isStarting = false
    }
  }

  function resume() {
    const currentEngine = engine.value
    const currentScene = scene.value
    if (!currentEngine || !currentScene)
      return

    currentEngine.stopRenderLoop()
    currentEngine.runRenderLoop(() => currentScene.render())
  }

  function pause() {
    engine.value?.stopRenderLoop()
  }

  useIntersectionObserver(
    containerRef,
    ([entry]) => {
      isVisible = entry?.isIntersecting === true

      if (!isVisible) {
        pause()
        return
      }

      if (engine.value) {
        resume()
        return
      }

      start()
    },
    /** 提早一點開始載入，捲到的時候已經在轉了 */
    { rootMargin: '200px' },
  )

  /** 版面變動時要跟著換畫布大小，不然畫面會被拉長 */
  watch(
    () => [canvasSize.width.value, canvasSize.height.value],
    () => engine.value?.resize(),
  )

  onBeforeUnmount(() => {
    disposeSetup?.()
    engine.value?.stopRenderLoop()
    scene.value?.dispose()
    engine.value?.dispose()
    engine.value = undefined
    scene.value = undefined
    camera.value = undefined
  })

  return {
    containerRef,
    canvasRef,
    engine,
    scene,
    camera,
    isReady,
    errorMessage,
  }
}
