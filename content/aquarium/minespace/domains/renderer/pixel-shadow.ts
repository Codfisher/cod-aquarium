import type { Camera, DirectionalLight, Material, UniformBuffer } from '@babylonjs/core'
import { MaterialPluginBase, Matrix, RegisterMaterialPlugin, StandardMaterial } from '@babylonjs/core'

/**
 * 這一刻的量化參數
 *
 * 與 aerial-perspective 的 airState 同一種寫法，
 * 每一幀寫一次，材質綁定時自己來讀
 */
const pixelShadowState = {
  /** 世界→光源裁切空間，也就是陰影貼圖用的那個矩陣 */
  matrix: Matrix.Identity(),
  /** 一格方塊上有幾個貼圖像素，量化的格距是它的倒數 */
  texelScale: 16,
  /**
   * 光源空間的深度換算
   *
   * 陰影比較用的是 vDepthMetric，那是 (z + depthValues.x) / depthValues.y。
   * 取樣點被挪動之後 z 跟著變，這個倒數就是把 z 的位移換算成 depthMetric 位移的係數
   */
  depthScale: 0.5,
  /** 開關，零等於量化位移一律為零，結果與沒有這個效果完全相同 */
  enabled: 0,
}

/**
 * 像素對齊的陰影
 *
 * 整套美術是十六格見方的像素畫：貼圖用最近鄰、法線也用最近鄰、
 * 刻意不開 FXAA——每一項都是為了保住那個網格。
 * 但陰影是連續的柔邊，它是全場唯一不服從像素網格的東西。
 *
 * 做法是把陰影的取樣點量化到貼圖的像素格上：同一個像素格裡的所有片段
 * 都去問同一個位置有沒有被遮住，於是陰影的邊界只能沿著格線走，
 * 長出來的是階梯而不是曲線——與貼圖上那些方方正正的像素同一個節奏。
 *
 * ── 為什麼要在世界座標上量化 ──
 *
 * 直接量化陰影貼圖的取樣座標比較省事，但那個格子長在光源空間上，
 * 而光源是斜的：對齊出來的階梯會沿著太陽的方向歪掉，
 * 而且太陽一轉整片階梯跟著轉。貼圖的像素格是釘在世界的軸上的，
 * 要對齊就得在世界座標上對齊，再送進光源空間。
 *
 * ── 為什麼只量化面自己的兩軸 ──
 *
 * 三軸都量化的話取樣點會離開表面——往上或往下浮個半格像素。
 * 深度比較是有門檻的，浮出去那一點正好夠讓「這個表面被自己擋住」，
 * 於是整片牆會長出一格一格的自我遮蔽條紋。
 *
 * 方塊世界的面都是貼著軸的，法線指向哪一軸，那一軸就不要動：
 * 取樣點因此永遠留在原本那個平面上，只在面內移動。
 *
 * ── 為什麼是加一段位移而不是重算 ──
 *
 * 世界座標到光源裁切空間是仿射的，所以「量化後的位置」等於
 * 「原本的位置」加上「位移量經過同一個矩陣」。原本那一份是內插好的
 * varying，直接拿來加就好，不必在片段著色器裡重算一次完整的變換
 */
class PixelShadowPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，理由與 aerial-perspective 相同 */
    super(material, 'MinespacePixelShadow', 230, {}, true, true)
  }

  getClassName(): string {
    return 'PixelShadowPlugin'
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'pixelShadowMatrix', size: 16, type: 'mat4' },
        { name: 'pixelShadowParam', size: 4, type: 'vec4' },
      ],
      /** 不支援統一緩衝區時的退路，理由見 cloud-shadow */
      fragment: `
        uniform mat4 pixelShadowMatrix;
        uniform vec4 pixelShadowParam;
      `,
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const state = pixelShadowState

    uniformBuffer.updateMatrix('pixelShadowMatrix', state.matrix)
    uniformBuffer.updateFloat4(
      'pixelShadowParam',
      state.texelScale,
      state.depthScale,
      state.enabled,
      0,
    )
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      /**
       * 算好這一格的位移，光照那一段每一盞燈都拿它去用
       *
       * 擺在光照之前是因為它只跟位置與法線有關，與是哪一盞燈無關；
       * 而它要用的兩個 varying 在這裡都已經內插好了。
       *
       * 用 vNormalW 不用 normalW：要的是這個面朝哪一軸，
       * 而 normalW 已經被法線貼圖擾動過，問它會問到石縫的斜面
       */
      'CUSTOM_FRAGMENT_BEFORE_LIGHTS': `
        vec4 minespacePixelShadowDelta = vec4(0.0);
        #ifdef NORMAL
          {
            /** 法線指向的那一軸給零，其餘兩軸給一——只在面內量化 */
            vec3 faceMask = 1.0 - step(0.5, abs(normalize(vNormalW)));
            vec3 snapped = (floor(vPositionW * pixelShadowParam.x) + 0.5) / pixelShadowParam.x;
            vec3 worldDelta = (snapped - vPositionW) * faceMask * pixelShadowParam.z;
            /** 第四個分量給零，位移是方向不是位置，平移那一欄不該吃到 */
            minespacePixelShadowDelta = pixelShadowMatrix * vec4(worldDelta, 0.0);
          }
        #endif
      `,

      /**
       * 只換平行光那一盞的取樣點
       *
       * 這個位移是拿太陽的陰影矩陣算出來的，套到別盞燈的座標上是錯的。
       * 場景裡只有日月那一盞是平行光，也只有它在投影陰影。
       *
       * 位置與深度要一起挪，缺一不可：只挪位置的話，同一格裡的片段
       * 會拿著各自的真實深度去比對同一個取樣點的深度，
       * 格子的遠端就會判定成「被自己擋住」——那正是要避免的條紋。
       *
       * 這一行是 include 展開後每一盞燈各一份，正規式帶著 g 旗標會全部換過。
       * 三種濾波（PCSS、PCF、硬邊）的函式名字不同、參數也不同，
       * 所以只認前兩個參數，剩下的原封不動接回去。
       * 哪天 Babylon 改了這幾行的寫法，正規式找不到就靜靜地不做事，
       * 陰影退回原本的柔邊，不會壞掉。
       *
       * 每個 $n 只准出現一次。Babylon 代換捕獲群組用的是
       * `newCode.replace('$' + i, match[i])`——字串比對，一個編號只換掉
       * 最前面那一個，後面的原封不動留在著色器裡變成 `$` 字元，
       * 整支著色器編不過。取樣點、深度連同編號各自獨立成群，
       * 就是為了守住這條規則
       */
      '!shadow=(computeShadow[A-Za-z0-9]*)\\((vPositionFromLight(\\d+)),(vDepthMetric\\3),([^;]*)\\);': `
        {
          vec4 minespaceShadowPosition = $2;
          float minespaceShadowDepth = $4;

          #ifdef DIRLIGHT$3
            minespaceShadowPosition += minespacePixelShadowDelta;
            minespaceShadowDepth += minespacePixelShadowDelta.z * pixelShadowParam.y;
          #endif

          shadow = $1(minespaceShadowPosition, minespaceShadowDepth, $5);
        }
      `,
    }
  }
}

let isRegistered = false

/**
 * 掛上像素對齊的陰影
 *
 * 必須在任何材質建立之前呼叫，理由與 registerAerialPerspective 相同
 */
export function registerPixelShadow(): void {
  if (isRegistered)
    return

  isRegistered = true
  RegisterMaterialPlugin('MinespacePixelShadow', (material) => {
    if (!(material instanceof StandardMaterial))
      return null

    return new PixelShadowPlugin(material)
  })
}

/**
 * 寫入這一刻的量化參數
 *
 * @param sunLight 投影陰影的那盞平行光
 * @param camera 目前的鏡頭，光源要靠它算深度範圍
 * @param texelScale 一格方塊上有幾個貼圖像素，直接吃材質包的解析度
 * @param isEnabled 除錯開關
 */
export function updatePixelShadow(
  sunLight: DirectionalLight | null,
  camera: Camera | null,
  texelScale: number,
  isEnabled = true,
): void {
  const shadowGenerator = sunLight?.getShadowGenerator()

  if (!isEnabled || !sunLight || !shadowGenerator || texelScale <= 0) {
    pixelShadowState.enabled = 0
    return
  }

  pixelShadowState.enabled = 1
  pixelShadowState.texelScale = texelScale
  pixelShadowState.matrix.copyFrom(shadowGenerator.getTransformMatrix())

  /**
   * 深度換算的分母
   *
   * 陰影產生器把 (minZ, minZ + maxZ) 寫進 depthValues，
   * 而 vDepthMetric 是除以第二項算出來的。平行光的這兩個值是固定的，
   * 但照著光源自己報的數字算，日後換成別種投影也不會錯
   */
  const depthSpan = sunLight.getDepthMinZ(camera) + sunLight.getDepthMaxZ(camera)
  pixelShadowState.depthScale = depthSpan === 0 ? 0 : 1 / depthSpan
}
