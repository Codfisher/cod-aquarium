import type { Color3, Material, UniformBuffer, Vector3 } from '@babylonjs/core'
import { MaterialPluginBase, RegisterMaterialPlugin, StandardMaterial } from '@babylonjs/core'

/** 外掛的名字，取材質上那一份實例時要用同一個字串 */
const PLUGIN_NAME = 'MinespaceLeafTranslucency'

/**
 * 樹葉透出來的量
 *
 * 一片葉子是有厚度的，光穿過去會被吃掉大半。
 * 這個值乘上葉子自己的貼圖顏色——所以綠葉透出來的是黃綠、
 * 楓葉透出來的是橘紅，不必為每一種葉子各調一個顏色
 */
export const LEAF_TRANSLUCENCY = 0.8

/**
 * 花草透出來的量
 *
 * 比樹葉高。地上的草與花瓣只有一層細胞那麼薄，
 * 逆光時幾乎是半透明的——而樹冠那一團是好幾片葉子疊在一起
 */
export const PLANT_TRANSLUCENCY = 1

/**
 * 透光集中在多窄的角度裡
 *
 * 這個指數就是「要多正對著太陽才看得到」。給得低的話整片樹冠
 * 不管從哪個方向看都在發光，那不是透光是自發光；
 * 給得太高則只剩太陽正後方那一點，走過去根本遇不上。
 * 三點五大約是視線與光線夾角三十度以內看得出來
 */
const FORWARD_POWER = 3.5

/**
 * 透出來的方向被法線扳開多少
 *
 * 純粹順著光線走的話，亮的只有「視線與光線完全重合」那一條線，
 * 而葉子是散射不是玻璃。把出射方向往法線的反面偏一點，
 * 亮區就從一條線化開成一片，那才是逆光的樹冠該有的樣子
 */
const NORMAL_DISTORTION = 0.35

/**
 * 這一刻的陽光
 *
 * 與 aerial-perspective 的 airState 同一種寫法，
 * 每一幀由漫遊控制器寫一次，材質綁定時自己來讀
 */
const sunState = {
  /** 光線前進的方向 */
  directionX: 0,
  directionY: -1,
  directionZ: 0,
  /** 光色乘上這一刻該有多強，除錯開關關掉時歸零 */
  red: 0,
  green: 0,
  blue: 0,
}

/**
 * 葉片透光
 *
 * 太陽在樹後面的時候，真實的葉子會透光——邊緣亮成一圈黃綠，
 * 整棵樹在逆光裡是發亮的。原本的樣子相反：背對太陽那一側
 * 只吃得到環境光，於是逆光時反而最暗，那是它最不像樹的一刻。
 *
 * 正經做法是算次表面散射，那要知道葉子有多厚、光在裡面跑了多遠。
 * 這裡用的是即時繪圖界的老招數：光穿過薄物之後大致順著原方向繼續走，
 * 所以「視線與光線多接近」就約等於「透出來多少」。
 * 一次點積加一次次方，換到一天裡最好看的兩段——清晨與黃昏。
 *
 * ── 只掛在該掛的材質上 ──
 *
 * 石頭不會透光。這個外掛預設是關的，只有樹葉與花草那幾份材質
 * 會被 setLeafTranslucency 打開——關著的外掛連程式碼都不會被編進著色器，
 * 不是算完再乘上零
 */
class LeafTranslucencyPlugin extends MaterialPluginBase {
  /** 這一份材質透多少，零等於不是會透光的東西 */
  private amount = 0

  constructor(material: Material) {
    /** 倒數第二個參數是「預設不啟用」，由 setLeafTranslucency 打開 */
    super(material, PLUGIN_NAME, 220, {}, true, false)
  }

  getClassName(): string {
    return 'LeafTranslucencyPlugin'
  }

  setAmount(amount: number): void {
    if (this.amount === amount)
      return

    this.amount = amount
    this._enable(amount > 0)
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'leafTranslucencyColor', size: 4, type: 'vec4' },
        { name: 'leafTranslucencySun', size: 4, type: 'vec4' },
      ],
      /** 不支援統一緩衝區時的退路，理由見 cloud-shadow */
      fragment: `
        uniform vec4 leafTranslucencyColor;
        uniform vec4 leafTranslucencySun;
      `,
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4(
      'leafTranslucencyColor',
      sunState.red * this.amount,
      sunState.green * this.amount,
      sunState.blue * this.amount,
      NORMAL_DISTORTION,
    )
    uniformBuffer.updateFloat4(
      'leafTranslucencySun',
      sunState.directionX,
      sunState.directionY,
      sunState.directionZ,
      FORWARD_POWER,
    )
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        vec3 minespaceLeafTranslucency(vec3 viewDirection, vec3 surfaceNormal) {
          /**
           * 正對太陽的那一面不加
           *
           * 那一面已經被直射光照亮了，再加一次透光就是同一道光算兩遍。
           * 會透光的是背著太陽的那一側——那正是原本最暗的地方
           */
          float backFacing = 1.0 - max(dot(surfaceNormal, -leafTranslucencySun.xyz), 0.0);

          /** 出射方向順著光線繼續走，再往法線的反面偏一點 */
          vec3 throughDirection = normalize(
            leafTranslucencySun.xyz - surfaceNormal * leafTranslucencyColor.a
          );
          float forward = pow(
            max(dot(viewDirection, throughDirection), 0.0),
            leafTranslucencySun.w
          );

          return leafTranslucencyColor.rgb * forward * backFacing;
        }
      `,

      /**
       * 加在霧之前
       *
       * 遠處的樹冠與近處的一樣會透光，但那道光也要跟著被霧吃掉——
       * 加在霧之後的話，霧裡會浮出一片發亮的葉子。
       *
       * 乘上 baseColor 有兩層意思。一是顏色：透出來的光帶著葉子本身的顏色，
       * 綠葉透綠、楓葉透橘，不必為每一種葉子各調一組。
       * 二是遮蔽：方塊的環境遮蔽與燈火都烘在這個顏色裡，
       * 樹冠深處那幾片本來就照不到光的葉子，透光也會跟著弱下去
       */
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        color.rgb += minespaceLeafTranslucency(viewDirectionW, normalW) * baseColor.rgb;
      `,
    }
  }
}

let isRegistered = false

/**
 * 掛上葉片透光
 *
 * 必須在任何材質建立之前呼叫，理由與 registerAerialPerspective 相同
 */
export function registerLeafTranslucency(): void {
  if (isRegistered)
    return

  isRegistered = true
  RegisterMaterialPlugin(PLUGIN_NAME, (material) => {
    if (!(material instanceof StandardMaterial))
      return null

    return new LeafTranslucencyPlugin(material)
  })
}

/**
 * 指定一份材質透多少光
 *
 * 由材質工廠依配方呼叫。零是預設值，也就是「這不是會透光的東西」
 */
export function setLeafTranslucency(material: StandardMaterial, amount: number): void {
  const plugin = material.pluginManager?.getPlugin<LeafTranslucencyPlugin>(PLUGIN_NAME)
  plugin?.setAmount(amount)
}

/**
 * 寫入這一刻的陽光
 *
 * @param sunDirection 平行光的方向，也就是光線前進的方向
 * @param sunColor 平行光的顏色
 * @param strength 直射光還剩幾成，陰天、夜裡與洞中要收掉
 * @param isEnabled 除錯開關
 */
export function updateLeafTranslucency(
  sunDirection: Vector3,
  sunColor: Color3,
  strength: number,
  isEnabled = true,
): void {
  /**
   * 方向要正規化過
   *
   * 出射方向是拿它與視線做點積算出來的，長度不是一的話
   * 那個夾角會算錯——而日夜循環寫進來的方向不保證是單位向量
   */
  const length = Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z) || 1
  sunState.directionX = sunDirection.x / length
  sunState.directionY = sunDirection.y / length
  sunState.directionZ = sunDirection.z / length

  const ratio = isEnabled ? Math.min(1, Math.max(0, strength)) : 0
  sunState.red = sunColor.r * ratio
  sunState.green = sunColor.g * ratio
  sunState.blue = sunColor.b * ratio
}
