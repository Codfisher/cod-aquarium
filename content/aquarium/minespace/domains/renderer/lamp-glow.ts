import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { BlockLightSource } from '../world/light-source'
import {
  Color3,
  Constants,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { createGlowTexture } from './glow-texture'

/** 全暗時光暈最亮到什麼程度 */
const NIGHT_STRENGTH = 0.85

/**
 * 大白天還剩多少
 *
 * 燈在中午當然照不出什麼，但它也不是沒有存在感——
 * 屋簷下、樹蔭裡那一點暖色正是它該有的樣子。
 * 這個比例與燈池那邊的真光是同一套想法（見 use-block-lights），
 * 兩者一起淡，燈才會是同一盞燈
 */
const DAY_STRENGTH_RATIO = 0.22

/** 一盞燈的光暈直徑（格），會隨亮度等級縮放 */
const LAMP_SIZE = 3.2
/** 火比燈籠大一圈，那是一團燒著的東西 */
const FIRE_SIZE = 4.8

/** 差得夠多才重寫材質，這是每一幀都會走的路徑 */
const STRENGTH_STEP = 0.01

/** 圓盤的細緻度，光暈是糊的，二十四邊就看不出角了 */
const DISC_TESSELLATION = 24

/**
 * 光暈要往鏡頭的方向挪出來多遠
 *
 * 這是整個效果成立與否的關鍵，不是微調。
 *
 * 光源的座標是燈籠那顆方塊的中心。方塊是不透明的、會寫深度；
 * 光暈雖然自己不寫深度，卻照樣要通過深度測試——
 * 於是整團暈最亮的核心永遠被它自己那顆方塊擋住，
 * 只剩外圈那幾階近乎全黑的地方露得出來，畫面上等於什麼都沒有。
 *
 * 解法是把那片圓盤沿著「往鏡頭看過去」的方向挪出方塊之外。
 * 一顆方塊的半對角線是 0.866，挪 0.95 剛好從任何角度都繞得出來。
 * 而它遠小於一堵牆的厚度，所以「隔著牆看不到燈」這件事仍然成立
 */
const HALO_LIFT = 0.95

export interface LampGlow {
  dispose: () => void;
}

export interface CreateLampGlowParams {
  scene: Scene;
  /** 光暈要往鏡頭的方向挪，才不會被自己那顆方塊擋住 */
  camera: UniversalCamera;
  /** 世界裡所有的光源方塊，與真光共用同一份清單 */
  sourceList: BlockLightSource[];
  /** 白晝的程度，0 為全暗、1 為大白天 */
  getDayRatio: () => number;
}

/**
 * 燈火的光暈
 *
 * 方塊的自發光只讓燈自己看起來是亮的，光並沒有溢出它的邊界。
 * 夜裡少了那一圈暈，一排燈籠看起來像貼在木架上的亮貼紙。
 *
 * ── 為什麼不用 Babylon 的光暈層 ──
 *
 * GlowLayer 是一道後製：它把發光的網格單獨重畫進一張離屏圖、模糊、
 * 再加回成品上，整個過程與場景的深度完全無關——隔著一堵牆
 * 也看得到牆後的燈在發光。對一個到處是實心方塊、還有洞穴的世界
 * 來說那是不能接受的。
 *
 * ── 為什麼要往鏡頭的方向挪 ──
 *
 * 這是整件事唯一的難處，見 HALO_LIFT。光源的座標是那顆燈籠方塊的中心，
 * 而方塊是不透明的：光暈不寫深度，卻照樣要通過深度測試，
 * 於是最亮的核心永遠被它自己那顆方塊擋住，畫面上什麼都看不到。
 * 換過三種畫法都沒用——因為問題從來不在怎麼畫，而在擺在哪裡。
 *
 * 代價是一盞燈一顆網格。幾十次繪製呼叫換一個看得到的效果，
 * 而它們是幾何而不是後製，被牆擋住就真的不見
 */
export function createLampGlow({
  scene,
  camera,
  sourceList,
  getDayRatio,
}: CreateLampGlowParams): LampGlow | null {
  if (sourceList.length === 0)
    return null

  /** 與天上那兩圈暈用同一條衰減曲線，邊界才不會浮出一圈輪廓 */
  const texture = createGlowTexture('lamp-halo', scene, [230, 230, 230])

  /**
   * 光色只有兩種，材質就只建兩份
   *
   * 燈籠的暖黃與火的橘。顏色寫在材質上，
   * 每一幀調亮度時只要改兩個顏色物件
   */
  const materialMap = new Map<string, StandardMaterial>()

  function getMaterial(color: [number, number, number]): StandardMaterial {
    const key = color.join(',')
    const existing = materialMap.get(key)
    if (existing)
      return existing

    const material = new StandardMaterial(`lamp-halo-${key}`, scene)
    material.diffuseTexture = texture
    material.diffuseColor = new Color3(0, 0, 0)
    material.specularColor = new Color3(0, 0, 0)
    /** 不吃光照，畫面上的顏色就只剩自發光乘上貼圖 */
    material.disableLighting = true
    /**
     * 不吃霧
     *
     * 天上那兩圈暈也是這樣設的。暈是一團自己在發的光，
     * 讓它往霧色混只會在夜裡把它染成一塊灰
     */
    material.fogEnabled = false
    material.backFaceCulling = false
    material.alphaMode = Constants.ALPHA_ADD
    /** 相加混合要走半透明那條路才生效，alpha 得比 1 小一點點 */
    material.alpha = 0.999
    /**
     * 不留下深度
     *
     * 暈是空氣裡的一團光，不是一塊擋得住東西的板子。
     * 照常寫深度的話，燈後面的東西會被那片看不見的圓盤切掉
     */
    material.disableDepthWrite = true
    material.emissiveColor = new Color3(0, 0, 0)

    materialMap.set(key, material)

    return material
  }

  const haloList = sourceList.map((source, index) => {
    const size = (source.isFire ? FIRE_SIZE : LAMP_SIZE) * source.level
    const mesh = MeshBuilder.CreateDisc(
      `lamp-halo-${index}`,
      { radius: size / 2, tessellation: DISC_TESSELLATION },
      scene,
    )
    mesh.material = getMaterial(source.color)
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL
    mesh.isPickable = false
    mesh.receiveShadows = false
    mesh.applyFog = false
    mesh.setEnabled(false)

    /** 燈本身在哪。每一幀從這裡往鏡頭的方向挪出方塊之外 */
    return { mesh, origin: new Vector3(source.x, source.y, source.z) }
  })

  /** 就地覆寫的暫存，每幀幾十盞燈不該配置幾十個向量 */
  const toCamera = new Vector3()
  let appliedStrength = -1
  let isVisible = false

  const { state: devToggle } = useDevToggles()

  const observer = scene.onBeforeRenderObservable.add(() => {
    /**
     * 白天也留一點
     *
     * 從全暗的滿檔淡到大白天的兩成多，而不是淡到零。
     * 一盞點著的燈就算在正午也還是點著的
     */
    const dayRatio = Math.min(1, Math.max(0, getDayRatio()))
    const strength = devToggle.lampGlow
      ? NIGHT_STRENGTH * (1 - dayRatio * (1 - DAY_STRENGTH_RATIO))
      : 0

    /** 只有除錯開關關掉時才整組收起來，白天照樣留著那一點暖色 */
    const shouldShow = strength > 0
    if (shouldShow !== isVisible) {
      isVisible = shouldShow
      for (const halo of haloList) {
        halo.mesh.setEnabled(shouldShow)
      }
    }

    if (!shouldShow)
      return

    /**
     * 每一幀把圓盤挪到方塊外面
     *
     * 挪的方向是「這盞燈往鏡頭看過去」。圓盤本來就永遠面向鏡頭，
     * 所以不論從哪個角度走過去，它都剛好浮在那顆方塊的前面。
     *
     * 貼得很近時要收手：照樣挪 0.95 會把圓盤送到鏡頭背後，
     * 那盞燈反而在走近的最後一步憑空消失
     */
    for (const halo of haloList) {
      toCamera.copyFrom(camera.position).subtractInPlace(halo.origin)
      const distance = toCamera.length()
      if (distance < 0.001) {
        halo.mesh.position.copyFrom(halo.origin)
        continue
      }

      const lift = Math.min(HALO_LIFT, distance * 0.5)
      halo.mesh.position.copyFrom(halo.origin).addInPlace(toCamera.scaleInPlace(lift / distance))
    }

    if (Math.abs(strength - appliedStrength) < STRENGTH_STEP)
      return

    appliedStrength = strength
    for (const [key, material] of materialMap) {
      const [red, green, blue] = key.split(',').map(Number) as [number, number, number]
      material.emissiveColor.set(red * strength, green * strength, blue * strength)
    }
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      for (const halo of haloList) {
        halo.mesh.dispose()
      }
      for (const material of materialMap.values()) {
        material.dispose()
      }
      texture.dispose()
    },
  }
}
