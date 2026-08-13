import type { StandardMaterial } from '@babylonjs/core'

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
 * 本來就該跟著人一起離開
 */
export function createWetness(materialList: StandardMaterial[]): Wetness {
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

  let appliedRatio = 0

  return {
    setRatio(ratio: number) {
      const wet = Math.min(1, Math.max(0, ratio))
      if (Math.abs(wet - appliedRatio) < APPLY_STEP)
        return

      appliedRatio = wet

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
    },
  }
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}
