import type { AbstractEngine, BaseTexture, Material, Scene, StandardMaterial, UniformBuffer, UniversalCamera } from '@babylonjs/core'
import { Color4, MaterialPluginBase, Texture } from '@babylonjs/core'

/**
 * 從幾格外開始化開
 *
 * 這是整個效果的唯一旋鈕，也是一組取捨。
 *
 * 給得太小，交線只是變窄，直邊照樣看得出來。
 * 給得太大，光暈連自己那顆燈籠方塊都會躲——圓盤是往鏡頭挪出來的，
 * 它與那顆方塊的正面只差 0.45 格，淡出距離一旦超過那個數字，
 * 暈最亮的核心就會跟著暗下去。
 *
 * 0.6 是踩在中間：核心保住七成五，而那道邊在貼著地面的
 * 掠射角下會被拉成一整片漸層——那正是它最醜的角度
 */
const FADE_DISTANCE = 0.6

/** 所有光暈材質共讀這一份，深度圖只有一張 */
const fadeState = {
  depthTexture: null as BaseTexture | null,
  /** 關掉時淡出距離歸零，著色器那段就整個跳過，深度圖也停止更新 */
  isEnabled: false,
}

/**
 * 柔性粒子
 *
 * 光暈是一片朝著鏡頭的圓盤。它不寫深度，卻要通過深度測試——
 * 於是只要這個平面切進實體，交線上就會出現一道邊。
 * 那道邊是筆直的，而暈是糊的，一團糊東西被直線切齊就是穿模。
 *
 * 業界對這件事的答案叫柔性粒子，做法只有一句話：
 * 拿一張存著場景深度的圖，比對「這個像素背後的實體有多遠」，
 * 越接近就越淡。交線因此不是被切斷，而是化開。
 *
 * 代價寫在 createHaloSoftFade 上面
 */
class HaloSoftFadePlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，這個外掛沒有開關屬性 */
    super(material, 'MinespaceHaloSoftFade', 210, {}, true, true)
  }

  getClassName(): string {
    return 'HaloSoftFadePlugin'
  }

  getSamplers(samplers: string[]): void {
    samplers.push('haloDepthSampler')
  }

  getUniforms() {
    return {
      ubo: [{ name: 'haloFade', size: 4, type: 'vec4' }],
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer, _scene: Scene, engine: AbstractEngine): void {
    const texture = fadeState.depthTexture

    /**
     * 深度圖與場景畫在同一個尺寸上，所以像素座標除以畫面大小
     * 就是取樣用的座標。硬體縮放會同時改動兩邊，每幀重讀才不會錯開
     */
    uniformBuffer.updateFloat4(
      'haloFade',
      1 / engine.getRenderWidth(),
      1 / engine.getRenderHeight(),
      texture && fadeState.isEnabled ? FADE_DISTANCE : 0,
      0,
    )

    /** 關掉時也照樣綁：取樣器沒綁上去的話，驅動程式會抱怨 */
    if (texture) {
      uniformBuffer.setTexture('haloDepthSampler', texture)
    }
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    /**
     * 自己算一份視空間的 Z
     *
     * 不借用 vPositionW：那個 varying 要材質有霧或有光照才會存在，
     * 而光暈兩者都關掉了。這裡算的式子與 Babylon 深度著色器
     * 裡那一行（vViewPos = view * worldPos）完全相同，
     * 兩邊比的才會是同一個量，不必猜它的座標慣例
     */
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: 'varying float vHaloViewZ;',
        CUSTOM_VERTEX_MAIN_END: 'vHaloViewZ = (view * worldPos).z;',
      }
    }

    if (shaderType !== 'fragment')
      return null

    /**
     * 淡出寫在顏色上而不是透明度上
     *
     * 光暈走的是相加混合，透明度在那條路上不起作用。
     * 顏色收到全黑等於沒加上去，效果與淡出相同
     */
    return {
      /**
       * 取樣器要自己宣告
       *
       * getSamplers 只是把名字報給 Babylon 去查位置，
       * 它不會替你寫那一行 GLSL。統一緩衝區裡的 haloFade 則是自動生成的
       */
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform sampler2D haloDepthSampler;
        varying float vHaloViewZ;
      `,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        if (haloFade.z > 0.0) {
          float haloSceneZ = texture2D(haloDepthSampler, gl_FragCoord.xy * haloFade.xy).r;
          color.rgb *= clamp((haloSceneZ - vHaloViewZ) / haloFade.z, 0.0, 1.0);
        }
      `,
    }
  }
}

export interface HaloSoftFade {
  /** 低畫質時整套關掉：深度圖停止更新，淡出距離歸零 */
  setEnabled: (isEnabled: boolean) => void;
  dispose: () => void;
}

export interface CreateHaloSoftFadeParams {
  scene: Scene;
  camera: UniversalCamera;
}

/**
 * 開一張場景深度圖給光暈用
 *
 * ── 代價 ──
 *
 * WebGL 拿不到主畫面正在用的那份深度緩衝區（Babylon 的作者直接說了
 * 這件事做不到），所以深度圖只能自己再畫一趟。整個場景要多跑一次，
 * 雖然著色器只寫一個數字、幾乎不吃填充率，但繪製呼叫是實打實的一倍。
 *
 * 這是為什麼低畫質不開：那一檔本來就在跟繪製呼叫計較，
 * 寧可留著那道邊。淡出距離會一併歸零，著色器那段就整個跳過
 */
export function createHaloSoftFade({
  scene,
  camera,
}: CreateHaloSoftFadeParams): HaloSoftFade {
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
   * 天空前面的光暈會整團被自己淡掉。改成遠平面之後，
   * 對著天空的光暈維持全亮
   */
  depthRenderer.clearColor = new Color4(camera.maxZ, 0, 0, 1)

  const depthMap = depthRenderer.getDepthMap()
  fadeState.depthTexture = depthMap
  fadeState.isEnabled = true

  /**
   * 換視窗大小時要跟著換
   *
   * 這張圖是照建立當下的畫面尺寸開的，而 Babylon 不會自己重開它。
   * 放著不管的話，畫深度時的長寬比會沿用舊的那張圖——
   * 深度與畫面就對不起來，淡出會淡錯位置。
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
    setEnabled(isEnabled: boolean) {
      fadeState.isEnabled = isEnabled
      depthRenderer.enabled = isEnabled
    },
    dispose() {
      engine.onResizeObservable.remove(resizeObserver)
      fadeState.depthTexture = null
      fadeState.isEnabled = false
      scene.disableDepthRenderer(camera)
    },
  }
}

/**
 * 把柔性淡出掛到一份光暈材質上
 *
 * 外掛在建構的當下就把自己接進材質的外掛管理器，不必留參考。
 * 只掛在光暈那兩份材質上，其他兩百多份材質一個字都不會被動到
 */
export function attachHaloSoftFade(material: StandardMaterial): void {
  // eslint-disable-next-line no-new
  new HaloSoftFadePlugin(material)
}
