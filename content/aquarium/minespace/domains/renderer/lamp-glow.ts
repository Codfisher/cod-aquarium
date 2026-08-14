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
import { watch } from 'vue'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { optOutOfFog } from './fog-opt-out'
import { createGlowTexture } from './glow-texture'
import { attachHaloSoftFade, createHaloSoftFade } from './halo-soft-fade'

/** 全暗時光暈最亮到什麼程度 */
const NIGHT_STRENGTH = 0.85

/**
 * 大白天還剩多少
 *
 * 這個數字曾經是 0.22，照抄燈池那邊真光的白天比例——那是錯的。
 * 兩者的處境不同：真光是乘法，它讓照到的表面變亮；
 * 光暈是加法，它把一團光疊在已經很亮的背景上。
 *
 * 加法在亮處吃虧得多。畫面出去還要經過 ACES 色調映射，
 * 而那條曲線在高處壓縮得很兇——夜裡加 0.17 是一團明顯的光，
 * 白天加同樣的 0.17 幾乎整個被壓掉，等於沒加。
 *
 * 而且白晝程度在太陽升到地平線上約九度就已經滿檔，
 * 也就是整個白天都停在這一檔。要看得見就得給得夠。
 *
 * 這是純粹的觀感取捨，沒有正確答案——覺得白天的燈太搶戲就調低它
 */
const DAY_STRENGTH_RATIO = 0.45

/** 一盞燈的光暈直徑（格），會隨亮度等級縮放 */
const LAMP_SIZE = 3.2
/** 火比燈籠大一圈，那是一團燒著的東西 */
const FIRE_SIZE = 4.8
/**
 * 岩漿這種面光源的直徑
 *
 * 比一團營火再大一截，是要它蓋得過四格的格距——
 * 液面上每四格一顆，圓盤若只有營火那麼大，
 * 兩顆之間會露出一段沒有暈的液面，整池看起來像點著幾盞路燈
 */
const AREA_LIGHT_SIZE = 7.5

/**
 * 面光源每一片的濃度
 *
 * 相加混合是會累加的：一池岩漿上十幾顆圓盤彼此重疊，
 * 每一片都照營火的濃度給，疊出來就是一塊沒有層次的白。
 *
 * 單片壓到三成半，重疊處剛好回到一團火的亮度，
 * 而邊緣那些只有一兩片蓋到的地方就成了淡淡的熱氣。
 * 一整池的亮度是疊出來的，不是單片給出來的
 */
const AREA_LIGHT_STRENGTH_RATIO = 0.35

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
 * 而它遠小於一堵牆的厚度，所以「隔著牆看不到燈」這件事仍然成立。
 *
 * 這個數字同時是柔性淡出的上限：圓盤與那顆方塊的正面只差 0.45 格，
 * 淡出距離一旦超過那個數字，光暈最亮的核心就會被自己的燈籠淡掉。
 * 兩邊要一起看，見 halo-soft-fade.ts 的 FADE_DISTANCE
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
 * 有辦法讓它擋得住：把不發光的網格也一起加進那一層，讓它們畫成全黑。
 * 但那等於整個場景在離屏圖上再畫一趟，代價與自己開一張深度圖一樣，
 * 換來的卻是「暈的形狀跟著方塊的輪廓走」——那不是這裡要的形狀。
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
 *
 * ── 那道切開方塊的直邊 ──
 *
 * 圓盤不寫深度，卻要通過深度測試，所以只要這個平面切進實體，
 * 交線上就會出現一道邊。那道邊是筆直的，而暈是糊的，
 * 一團糊東西被直線切齊看起來就是穿模。
 *
 * 掛在半空中的燈籠遇不到，坐在地上的營火與整片躺平的岩漿每次都遇到。
 * 解法是柔性粒子，寫在 halo-soft-fade.ts
 *
 * ── 岩漿的光暈是另一套參數 ──
 *
 * 它曾經整個被排除在外，理由是「一整片液面上每兩格一顆圓盤，
 * 幾十片相加疊起來只會糊成一塊白」。那個理由沒有錯，錯在結論：
 * 該調的是格距與濃度，不是整個不畫。
 *
 * 現在分三處讓它成立：光源清單那邊把岩漿的格距放到四格一顆
 * （見 light-source.ts 的 AREA_LIGHT_CELL_SHIFT），數量剩四分之一；
 * 圓盤放大到蓋得過那個格距；單片的濃度壓到三成半，
 * 讓一池的亮度是十幾片疊出來的，而不是單片給出來的。
 *
 * 埋在液面下的那半交給柔性淡出化開，所以它不會留下一條沿著液面的直邊
 */
export function createLampGlow({
  scene,
  camera,
  sourceList,
  getDayRatio,
}: CreateLampGlowParams): LampGlow | null {
  if (sourceList.length === 0)
    return null

  const haloSourceList = sourceList

  /** 與天上那兩圈暈用同一條衰減曲線，邊界才不會浮出一圈輪廓 */
  const texture = createGlowTexture('lamp-halo', scene, [230, 230, 230])

  /**
   * 柔性淡出：低畫質不開
   *
   * 深度圖要整個場景多畫一趟，而低畫質那一檔本來就在跟繪製呼叫計較。
   * 關掉時光暈退回原本的樣子——邊緣是硬的，但東西還在。
   *
   * 跟著畫質走而不是只讀一次：切畫質不會重建場景，
   * 只讀一次的話，切到低畫質那一趟深度預繪會一直留著
   */
  const { quality } = useGraphicsQuality()
  const softFade = createHaloSoftFade({ scene, camera })
  const stopQualityWatch = watch(
    quality,
    (currentQuality) => softFade.setEnabled(currentQuality !== 'low'),
    { immediate: true },
  )

  /**
   * 光色只有兩種，材質就只建兩份
   *
   * 燈籠的暖黃與火的橘。顏色寫在材質上，
   * 每一幀調亮度時只要改兩個顏色物件
   */
  interface HaloMaterial {
    material: StandardMaterial;
    color: [number, number, number];
    /** 面光源要壓淡，理由見 AREA_LIGHT_STRENGTH_RATIO */
    strengthRatio: number;
  }

  const materialMap = new Map<string, HaloMaterial>()

  function getMaterial(
    color: [number, number, number],
    isAreaLight: boolean,
  ): StandardMaterial {
    /**
     * 鍵要帶上面光源這個旗標
     *
     * 岩漿與餘燼共用同一組火色，只用顏色當鍵的話兩者會拿到同一份材質，
     * 而它們的濃度必須不一樣——壓淡了岩漿，營火會跟著一起暗
     */
    const key = `${color.join(',')}_${isAreaLight ? 'area' : 'point'}`
    const existing = materialMap.get(key)
    if (existing)
      return existing.material

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

    /** 靠近實體就化開，那道切開方塊的直邊才不會出現 */
    attachHaloSoftFade(material)

    materialMap.set(key, {
      material,
      color,
      strengthRatio: isAreaLight ? AREA_LIGHT_STRENGTH_RATIO : 1,
    })

    return material
  }

  const haloList = haloSourceList.map((source, index) => {
    const baseSize = source.isAreaLight
      ? AREA_LIGHT_SIZE
      : source.isFire ? FIRE_SIZE : LAMP_SIZE
    const size = baseSize * source.level
    const mesh = MeshBuilder.CreateDisc(
      `lamp-halo-${index}`,
      { radius: size / 2, tessellation: DISC_TESSELLATION },
      scene,
    )
    mesh.material = getMaterial(source.color, source.isAreaLight)
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL
    mesh.isPickable = false
    mesh.receiveShadows = false
    optOutOfFog(mesh, '燈釘在世界上，箱庭全排在離邊界四十二格外，走到邊界時它們早在白幕之外')
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
    for (const entry of materialMap.values()) {
      const [red, green, blue] = entry.color
      const scale = strength * entry.strengthRatio
      entry.material.emissiveColor.set(red * scale, green * scale, blue * scale)
    }
  })

  return {
    dispose() {
      stopQualityWatch()
      softFade.dispose()
      scene.onBeforeRenderObservable.remove(observer)
      for (const halo of haloList) {
        halo.mesh.dispose()
      }
      for (const entry of materialMap.values()) {
        entry.material.dispose()
      }
      texture.dispose()
    },
  }
}
