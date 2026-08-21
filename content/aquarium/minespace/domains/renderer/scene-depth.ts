import type { AbstractMesh, BaseTexture, Scene, UniversalCamera } from '@babylonjs/core'
import { Color4, Texture } from '@babylonjs/core'
import { watch } from 'vue'
import { reportDiagnostic } from '../../composables/use-error-logger'
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
 * 深度圖與風擺動之間那筆爛帳
 *
 * 這一段是整個專案裡最容易反覆踩的地方，把來龍去脈寫完整。
 *
 * ── 根源 ──
 *
 * 深度圖是 Babylon 的 DepthRenderer 畫的，而它走自己那支 depth 著色器，
 * 與 StandardMaterial 是兩條路，材質外掛一個都套不上去。
 * 而風的擺動（wind-sway）正是一個頂點外掛。
 *
 * 於是畫面上的草在擺，深度圖裡的同一叢草永遠停在沒擺動的原位。
 * 深度圖是好幾個效果的共同輸入，所以這一個錯會分頭長出
 * 看起來毫不相干的症狀。
 *
 * ── 症狀一：把擺動的網格放進來 ──
 *
 * 深度圖裡的那份停在原位，畫面上的那株已經擺開了，兩者對不上。
 * 凡是拿「深度圖說這裡有東西」去做判斷的效果，都會在那個
 * 沒有東西的位置上留下一塊植株形狀的痕跡。
 *
 * 水面的岸線是這樣現形的：
 *
 *   float waterGap = max(waterSceneZ - vWaterViewZ, 0.0);
 *   float waterLine = 1.0 - smoothstep(0.0, waterScreen.z, waterGap);
 *
 * 只要深度圖裡有東西比這個水面片元「更近」，waterGap 就被夾成零，
 * 零距離換算出來的 waterLine 是滿的一。岸邊那叢草站在鏡頭與水之間，
 * 於是水面上留下一片草形狀的白沫，草在晃、那片沫不動。
 *
 * 體積光那邊則是植物在空中留下一個不會動的剪影，同一個根因。
 *
 * ── 症狀二：把擺動的網格濾掉 ──
 *
 * 這一株不在深度圖裡，那一格的深度就變成「它後面那個東西」的距離。
 * 凡是拿深度做判斷的效果，都會照著背景幾何的形狀分出明暗。
 *
 * 樹葉整片濾掉時最明顯：葉子後面是木頭就拿到一種值、是天空就拿到
 * 另一種，木頭的輪廓因此整個印上樹冠，看起來像葉子變透明了。
 *
 * 兩種症狀是同一個錯的兩面，改動這裡之前要知道自己在換哪一邊。
 *
 * ── 現在的取捨 ──
 *
 * 兩種擺法的誤差差了一個數量級，所以分開處理。
 *
 * 花草的 heightLeverage 是一，從根部彎、葉尖甩得老遠，
 * 殘影很醒目，濾掉。代價是這些植株與水面的交界不再有那圈白沫。
 *
 * 樹葉的 heightLeverage 是零，整塊一起輕輕平移，差不到一格，
 * 留著。換到的是樹冠不再印出背景的輪廓。
 *
 * ── 正規解 ──
 *
 * 上面那個取捨只是把誤差挑小的那一邊吃下去，根源仍在。
 * 要真的解決，得讓深度那一趟也套用同樣的擺動。
 *
 * 做法是 RenderTargetTexture.setMaterialForRendering(mesh, material)。
 * 它可以指定「這顆網格畫進這張 RT 時改用哪一份材質」，
 * 於是能替會擺動的網格準備一份自己的深度材質。
 *
 * 這裡原本擔心的是「把頂點位移維護兩份，改一邊忘了另一邊就會再度錯開」。
 * 那個顧慮可以拆掉：把 wind-sway 的頂點位移那段 GLSL 匯出成一個字串，
 * 材質外掛與深度材質共用同一份，就只有一個真相。
 * voxel-gi 的 VOXEL_GI_SAMPLE_GLSL 已經是這個寫法，照抄就好。
 *
 * 要付的成本有兩項。一是那段位移吃八個 uniform，其中 windTrampleList
 * 還是一個 vec4 陣列，深度材質得自己每幀餵一遍。
 * 二是 amplitude、heightLeverage、rippleFrequency 是逐材質的，
 * 所以要依這三個值的組合各建一份深度材質（實際上大約就花草與樹葉兩種）。
 *
 * 做完之後花草可以一起放回深度圖，水面那圈白沫的限制也跟著消失
 */
function isWindSwayMesh(mesh: AbstractMesh): boolean {
  const plugin = mesh.material?.pluginManager?.getPlugin('WindSway') as
    { heightLeverage?: number } | null | undefined

  return (plugin?.heightLeverage ?? 0) > 0
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

  /**
   * 每一幀把會擺動的網格濾掉
   *
   * 用 getCustomRenderList 而不是自己指定 renderList：
   * 後者一旦給定就是一份寫死的清單，日後world 多長出一種方塊、
   * 或是換材質包重建網格，那份清單都會靜靜地漏掉它們
   */
  depthMap.getCustomRenderList = (_layerOrFace, renderList) => {
    if (!renderList)
      return null

    const keptList = renderList.filter((mesh) => !isWindSwayMesh(mesh))

    /**
     * 記下這一趟留了幾個、濾了幾個
     *
     * 「哪些網格有進深度圖」會一路影響到所有拿深度做判斷的效果，
     * 而那件事從畫面上完全看不出來——樹冠上印出木頭的輪廓、
     * 植物在空中留下剪影，兩個症狀天差地遠，根因都在這份清單。
     * 有數字才問得出「樹葉到底進去了沒有」
     */
    if (import.meta.env.DEV) {
      const swayList = renderList.filter((mesh) =>
        mesh.material?.pluginManager?.getPlugin('WindSway'))

      reportDiagnostic(
        '場景深度圖/算繪清單',
        `總共 ${renderList.length} 個網格，會擺動的 ${swayList.length} 個，`
        + `其中濾掉 ${renderList.length - keptList.length} 個（從底部彎的花草）、`
        + `留下 ${swayList.length - (renderList.length - keptList.length)} 個（整塊平移的樹葉）`,
      )
    }

    return keptList
  }

  const { preset } = useGraphicsQuality()
  const stopQualityWatch = watch(
    preset,
    (currentPreset) => {
      sceneDepthState.isEnabled = currentPreset.sceneDepth
      depthRenderer.enabled = currentPreset.sceneDepth
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
