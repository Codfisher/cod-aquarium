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
  /**
   * 是否允許拖曳轉動視角
   *
   * 關掉的是「轉開」，不是「推近」。正面看的範例轉開就沒有意義了，
   * 但那幾支偏偏都在給讀者看貼圖的邊緣與交界，縮放照樣要留著
   */
  interactive?: boolean;
  /**
   * 最近能推到多近
   *
   * 範例裡真正想看的往往是貼圖的邊緣、兩個面交界那幾個像素，
   * 推不進去就是看不到。預設給得很小，場景特別大的再自己調
   */
  minRadius?: number;
  /** 最遠能拉到多遠 */
  maxRadius?: number;
  /**
   * 是否允許滾輪縮放
   *
   * 純 PostProcess 的範例（畫面只用螢幕座標算色，跟鏡頭距離無關）
   * 縮放本來就不會改變畫面，關掉之後連「按一下開放滾輪縮放」的
   * attach/detach 流程與提示文字都不會出現，省得讀者白操作一次
   */
  zoomable?: boolean;
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
  /** 滾輪縮放已經開放，畫面上那行提示就收起來 */
  const isZoomActive = ref(false)

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

      currentCamera.attachControl(canvasRef.value, true)

      if (param.interactive === false) {
        /**
         * pointers 這一支同時管旋轉、平移與雙指縮放，整支拿掉會連雙指縮放
         * 也一起關掉。改成只把單指旋轉與平移的靈敏度歸零：旋轉是
         * `1 / angularSensibilityX(Y)`，設成 Infinity 除出來就是 0；
         * 平移的 panningSensibility 有 0 的專用分支，直接關。
         * 雙指縮放走的是 pinchDeltaPercentage 那條路徑，跟這兩個屬性無關，
         * 所以縮放照樣動得了
         */
        currentCamera.angularSensibilityX = Infinity
        currentCamera.angularSensibilityY = Infinity
        currentCamera.panningSensibility = 0
      }

      /**
       * 縮放的速度要跟著距離走
       *
       * `wheelPrecision` 是固定的除數，離得遠時一格滾輪只挪一點點，
       * 從兩百格推到貼著看要滾上半天。改用百分比之後，
       * 每一格挪掉的都是當下距離的固定比例，遠近都一樣順手
       */
      currentCamera.wheelDeltaPercentage = 0.02
      currentCamera.pinchDeltaPercentage = 0.02

      /**
       * 滾輪縮放要等讀者先按一下
       *
       * 文章是要捲的。滑鼠一經過範例就把捲動吃掉，
       * 讀者會以為頁面卡住了。
       *
       * 但鎖死縮放也不行，範例裡真正想看的往往是貼圖的邊緣、
       * 兩個面交界那幾個像素，離得遠就是看不到。
       *
       * 折衷是「按過才給」：在畫布上按過一次就開放滾輪，
       * 滑鼠移開就收回去。想細看的人本來就會先伸手碰它一下。
       *
       * 這一行直接對本地那顆鏡頭關，因為 camera.value 還沒指派
       *
       * zoomable 關掉時（例如純 PostProcess、鏡頭距離對畫面沒有意義的範例）
       * 就不裝按一下才開放的那組監聽器，滾輪永遠是關的、讓瀏覽器拿去捲頁面
       */
      currentCamera.inputs.attached.mousewheel?.detachControl()
      isZoomActive.value = false

      if (param.zoomable !== false) {
        canvasRef.value.addEventListener('pointerdown', attachWheel)
        canvasRef.value.addEventListener('pointerleave', detachWheel)
      }

      currentCamera.lowerRadiusLimit = param.minRadius ?? 0.6
      currentCamera.upperRadiusLimit = param.maxRadius ?? 200

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

  function attachWheel() {
    /**
     * 先 detach 再 attach，確保同一個 wheelInput 任何時候最多只有一個 observer
     *
     * attachControl() 每呼叫一次就在 scene.onPointerObservable 上新增一個
     * observer、把 _observer 直接覆寫成新的，不會檢查是否已經掛過。
     * 連續兩次 pointerdown 之間沒有 pointerleave（例如拖曳轉鏡頭轉兩段）
     * 就會讓上一個 observer 失去唯一參照、變成孤兒，永遠留到卸載才清掉
     */
    const wheelInput = camera.value?.inputs.attached.mousewheel
    wheelInput?.detachControl()
    wheelInput?.attachControl()
    isZoomActive.value = true
  }

  function detachWheel() {
    camera.value?.inputs.attached.mousewheel?.detachControl()
    isZoomActive.value = false
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
    canvasRef.value?.removeEventListener('pointerdown', attachWheel)
    canvasRef.value?.removeEventListener('pointerleave', detachWheel)
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
    isZoomActive,
  }
}
