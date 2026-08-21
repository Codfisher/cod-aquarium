import type { StandardMaterial, Texture } from '@babylonjs/core'
import { FresnelParameters } from '@babylonjs/core'

/**
 * 淋濕之後漫射還剩多少
 *
 * 濕的表面看起來比乾的暗，這是它最容易辨認的特徵：
 * 水填進了表面的孔隙，進去的光在裡面多反射幾次才出得來，
 * 途中被吸收掉的部分就是那道暗。
 *
 * 業界對柏油這類多孔材質給到剩下一兩成，方塊世界不必那麼極端——
 * 這裡的木頭與石頭本來就是低飽和的手繪色，壓太多會整片發黑
 */
const WET_DIFFUSE_RATIO = 0.68

/**
 * 淋濕之後高光有多強
 *
 * 與漫射相反，濕的表面高光是暴增的：水在上面鋪成一層平滑的膜，
 * 原本被粗糙表面打散的反射全部聚回同一個方向。
 *
 * 高光這一項在 StandardMaterial 裡是加在漫射的 clamp 外面的，
 * 也就是全場唯一能真的超過純白的通道。雨後的地面在斜射的陽光下
 * 會亮到刺眼，那不是調出來的，是它本來就該有的
 */
const WET_SPECULAR = 0.42

/**
 * 濕的表面高光要散開，不是聚成一個小點
 *
 * 指數越低、高光的範圍越寬。乾的方塊用預設的六十四，那是一個
 * 幾乎看不見的小亮點；濕的地面該是一整片順著光的方向鋪開的亮，
 * 收到二十才是水膜該有的樣子
 */
const WET_SPECULAR_POWER = 20

/** 差得夠多才寫進材質，這是每一幀都會走的路徑 */
const APPLY_STEP = 0.01

/**
 * 濕透時反光貼圖的強度上限
 *
 * 這是 texture.level 的目標值，不是材質數量級的東西——一張貼圖、
 * 所有濕的材質共用，level 調一次就等於全世界一起調。
 *
 * 這個數字原本是 0.55，那讓雨中的草地整片泛白。原因是雨天的天空
 * 是一片亮灰，以那個強度反射到每一個像素上，等於在整個世界蓋一層
 * 灰白——濕潤該有的「壓暗」被自己的反光完全蓋過去了。
 *
 * 濕的地面是更深、更飽和的，只有掠射角才泛起一道白。
 * 收到兩成二，加上底下那組收窄的 Fresnel，兩件事才對得起來
 */
const WET_REFLECTION_LEVEL = 0.22

/**
 * 反光要多斜的視角才看得到
 *
 * Fresnel 的物理直覺：越貼近掠射角，反光越強。bias 是「正對時
 * 還留多少」、power 是「往掠射角集中得多快」。
 *
 * 這一組原本是 0.08 與 2.4，散得太開——近乎正視地面時也在反光，
 * 於是低頭看到的草地也蒙上一層天色。bias 收到近乎零、power 拉高，
 * 反光就縮回它該在的地方：斜看出去的那一段遠景
 */
const REFLECTION_FRESNEL_BIAS = 0.02
const REFLECTION_FRESNEL_POWER = 4

export interface Wetness {
  /** ratio 為 0 是全乾、1 是濕透 */
  setRatio: (ratio: number) => void;
}

interface MaterialBackup {
  material: StandardMaterial;
  diffuse: [number, number, number];
  specular: [number, number, number];
  specularPower: number;
}

/**
 * 雨後的濕潤
 *
 * 雨本身只是幾千條掉下來的線，落地就沒了；真正讓人相信剛下過雨的
 * 是雨停之後那段地還是濕的時間。少了它，走出聽雨亭的那一步，
 * 整個世界會在一瞬間乾透。
 *
 * 兩件事同時做：漫射壓暗、高光提亮並散開。這是經典光照模型下
 * 表現濕潤的標準做法，兩者缺一都不成立——只壓暗會變成髒，
 * 只加高光會變成上了一層蠟。
 *
 * 材質是全世界共用的（同一種石頭只有一份），所以濕潤也是全域的。
 * 這在這個場景裡剛好說得過去：雨勢滿檔時能見度只有二十六格，
 * 看得到的就只有腳邊這一塊；而走出雨區之後那段慢慢乾的過程，
 * 本來就該跟著人一起離開。
 *
 * reflectionTexture 是濕地反光用的天色貼圖，見 sky-reflection.ts，
 * 不給的話（例如低畫質關掉這個效果）就只做原本的漫射壓暗與高光散開
 */
export function createWetness(materialList: StandardMaterial[], reflectionTexture?: Texture): Wetness {
  /**
   * 記住原本的顏色，之後每次都拿原色去算
   *
   * 不能在現值上再乘一次：那樣調個幾次就會越調越黑，再也回不來
   */
  const backupList: MaterialBackup[] = materialList.map((material) => ({
    material,
    diffuse: [material.diffuseColor.r, material.diffuseColor.g, material.diffuseColor.b],
    specular: [material.specularColor.r, material.specularColor.g, material.specularColor.b],
    specularPower: material.specularPower,
  }))

  /**
   * 一份 Fresnel 參數，所有濕的材質共用
   *
   * 跟貼圖是同一個道理：濕潤是全域的一件事，不必為兩百多份材質
   * 各自配一份一模一樣的參數
   */
  const fresnelParameters = new FresnelParameters()
  fresnelParameters.bias = REFLECTION_FRESNEL_BIAS
  fresnelParameters.power = REFLECTION_FRESNEL_POWER

  /** 目前有沒有真的把反射掛上去 */
  let isReflectionAttached = false

  /**
   * 乾的時候要把反射整個拆掉，不能只是把強度調成零
   *
   * 一開始的做法是建立時就掛給每一份材質、之後只調 level。
   * 那是不行的，兩個理由：
   *
   * 一是浪費。九成九的時間地面是乾的，卻讓兩百多份材質都常駐
   * 帶著一張反射貼圖，每一次繪製都多綁一個取樣器。
   *
   * 二是會出事。StandardMaterial 的反射在著色器裡有 samplerCube
   * 與 sampler2D 兩份宣告，靠條件編譯二選一；掛著一張 2D 的
   * 等距柱狀投影貼圖時，另一份宣告仍然存在卻永遠不會被綁，
   * 於是它退回材質單元零——而那一格綁的是別的 2D 貼圖。
   * WebGL 對這種情況丟 GL_INVALID_OPERATION: Two textures of
   * different types use the same sampler location，整個繪製呼叫作廢。
   *
   * 只在真的濕的時候掛上去，乾了就拆掉，兩個問題一起沒有
   */
  function setReflectionAttached(nextAttached: boolean): void {
    if (!reflectionTexture || nextAttached === isReflectionAttached)
      return

    isReflectionAttached = nextAttached

    for (const backup of backupList) {
      /**
       * 只拆貼圖，Fresnel 參數留著
       *
       * 那組參數單獨存在時不做任何事——反射的那一段整個是掛在
       * 有沒有貼圖上的。而它的型別不收 null，硬要拆得多繞一圈，
       * 換不到任何東西
       */
      backup.material.reflectionTexture = nextAttached ? reflectionTexture : null
      backup.material.reflectionFresnelParameters = fresnelParameters
    }
  }

  let appliedRatio = 0

  return {
    setRatio(ratio: number) {
      const wet = Math.min(1, Math.max(0, ratio))
      if (Math.abs(wet - appliedRatio) < APPLY_STEP)
        return

      appliedRatio = wet
      setReflectionAttached(wet > APPLY_STEP)

      for (const backup of backupList) {
        const { material, diffuse, specular } = backup
        const diffuseRatio = lerp(1, WET_DIFFUSE_RATIO, wet)

        material.diffuseColor.set(
          diffuse[0] * diffuseRatio,
          diffuse[1] * diffuseRatio,
          diffuse[2] * diffuseRatio,
        )
        /**
         * 高光往同一個目標值收，不是照原值放大
         *
         * 原本的高光是每種方塊各自調過的，有的 0.08、有的乾脆是零。
         * 照倍率放大的話，原本是零的那幾種永遠濕不起來——
         * 而水膜是蓋在表面上的一層，底下是什麼材質並不影響它有多亮
         */
        material.specularColor.set(
          lerp(specular[0], WET_SPECULAR, wet),
          lerp(specular[1], WET_SPECULAR, wet),
          lerp(specular[2], WET_SPECULAR, wet),
        )
        material.specularPower = lerp(backup.specularPower, WET_SPECULAR_POWER, wet)
      }

      /**
       * 反光強度跟著同一個濕度走
       *
       * 貼圖只有一張、Fresnel 參數只有一份，全部材質共用，
       * 調這一個 level 就等於整個世界的濕地反光一起淡入淡出
       */
      if (reflectionTexture) {
        reflectionTexture.level = lerp(0, WET_REFLECTION_LEVEL, wet)
      }
    },
  }
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}
