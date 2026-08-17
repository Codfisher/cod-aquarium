import type { BaseTexture, Scene, UniversalCamera } from '@babylonjs/core'
import { Color4, Texture } from '@babylonjs/core'
import { watch } from 'vue'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'

/**
 * 這一幀的場景深度
 *
 * 與 aerial-perspective 的 airState 同一種寫法：一份資料放在模組上，
 * 用得到的材質各自來讀。目前有兩個讀者——光暈的柔性淡出，
 * 以及水面的岸線交線光——兩者要的是同一張圖，沒有理由各開一張
 */
export const sceneDepthState = {
  texture: null as BaseTexture | null,
  /** 關掉時效果各自歸零，著色器那幾段就整個跳過 */
  isEnabled: false,
}

export interface SceneDepth {
  dispose: () => void;
}

export interface CreateSceneDepthParams {
  scene: Scene;
  camera: UniversalCamera;
}

/**
 * 開一張場景深度圖
 *
 * ── 它是什麼 ──
 *
 * 每個像素存著「這個方向上最近的實體有多遠」。半透明的東西不進去
 * （Babylon 的深度算繪預設只畫不透明與 alpha test 的網格），
 * 所以水面自己不在圖上，水面的著色器才問得到「我背後那塊地有多遠」。
 *
 * ── 代價 ──
 *
 * WebGL 拿不到主畫面正在用的那份深度緩衝區（Babylon 的作者直接說了
 * 這件事做不到），所以深度圖只能自己再畫一趟。整個場景要多跑一次，
 * 雖然著色器只寫一個數字、幾乎不吃填充率，但繪製呼叫是實打實的一倍。
 *
 * 這是為什麼低畫質不開：那一檔本來就在跟繪製呼叫計較。
 * 跟著畫質走而不是只讀一次——切畫質不會重建場景，
 * 只讀一次的話，切到低畫質那一趟深度預繪會一直留著
 */
export function createSceneDepth({ scene, camera }: CreateSceneDepthParams): SceneDepth {
  const depthRenderer = scene.enableDepthRenderer(
    camera,
    false,
    false,
    /** 浮點深度圖的雙線性取樣不是每張顯卡都支援，取最近的那一格就好 */
    Texture.NEAREST_SAMPLINGMODE,
    /**
     * 直接存視空間的 Z
     *
     * 另一條路存的是正規化過的深度，要用就得把近遠平面再乘回去，
     * 而那組數字散在相機上，日後有人動了 maxZ 這裡會靜靜地算錯。
     * 存原始的 Z 值，比對時一個字都不必換算
     */
    true,
  )

  /**
   * 沒有東西的地方要當成無限遠
   *
   * 存視空間 Z 時的預設底色是零，那等於「實體就貼在鏡頭上」——
   * 天空前面的光暈會整團被自己淡掉，水面也會整片被判成貼著岸。
   * 改成遠平面之後，對著天空的光暈維持全亮，
   * 望向湖心那一片也回到乾淨的水
   */
  depthRenderer.clearColor = new Color4(camera.maxZ, 0, 0, 1)

  const depthMap = depthRenderer.getDepthMap()
  sceneDepthState.texture = depthMap

  const { quality } = useGraphicsQuality()
  const stopQualityWatch = watch(
    quality,
    (currentQuality) => {
      const isEnabled = currentQuality !== 'low'
      sceneDepthState.isEnabled = isEnabled
      depthRenderer.enabled = isEnabled
    },
    { immediate: true },
  )

  /**
   * 換視窗大小時要跟著換
   *
   * 這張圖是照建立當下的畫面尺寸開的，而 Babylon 不會自己重開它。
   * 放著不管的話，畫深度時的長寬比會沿用舊的那張圖——
   * 深度與畫面就對不起來，兩個效果都會作用在錯的位置。
   * 調畫質也會走到這裡：硬體縮放一改就是一次重設大小
   */
  const engine = scene.getEngine()
  const resizeObserver = engine.onResizeObservable.add(() => {
    depthMap.resize({
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
    })
  })

  return {
    dispose() {
      stopQualityWatch()
      engine.onResizeObservable.remove(resizeObserver)
      sceneDepthState.texture = null
      sceneDepthState.isEnabled = false
      scene.disableDepthRenderer(camera)
    },
  }
}
