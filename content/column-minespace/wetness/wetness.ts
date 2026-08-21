import type { StandardMaterial, Texture } from '@babylonjs/core'
import type { BabylonModule } from '../demo/use-babylon-demo'

/**
 * 雨後的濕潤
 *
 * 兩件事同時做，漫射壓暗、高光提亮並散開。
 * 這是經典光照模型下表現濕潤的標準做法，兩者缺一都不成立
 */

/**
 * 淋濕之後漫射還剩多少
 *
 * 水填進了表面的孔隙，進去的光在裡面多反射幾次才出得來，
 * 途中被吸收掉的部分就是那道暗
 */
export const WET_DIFFUSE_RATIO = 0.68

/**
 * 淋濕之後高光有多強
 *
 * 水在上面鋪成一層平滑的膜，原本被粗糙表面打散的反射
 * 全部聚回同一個方向
 */
export const WET_SPECULAR = 0.42

/** 指數越低、高光的範圍越寬，水膜該是一整片鋪開的亮 */
export const WET_SPECULAR_POWER = 20

/** 濕透時反光貼圖的強度上限 */
export const WET_REFLECTION_LEVEL = 0.22

/** 反光要多斜的視角才看得到 */
export const REFLECTION_FRESNEL_BIAS = 0.02
export const REFLECTION_FRESNEL_POWER = 4

/** 差得夠多才寫進材質，這是每一幀都會走的路徑 */
const APPLY_STEP = 0.01

export interface WetnessOption {
  babylon: BabylonModule;
  /** 濕地反光用的天色貼圖，不給就只做漫射壓暗與高光散開 */
  reflectionTexture?: Texture;
  /** 要不要壓暗漫射，範例的開關用 */
  isDiffuseEnabled?: () => boolean;
  /** 要不要提亮高光 */
  isSpecularEnabled?: () => boolean;
  /** Fresnel 的兩個參數，範例的滑桿用 */
  getFresnel?: () => { bias: number; power: number };
}

export interface Wetness {
  /** ratio 為 0 是全乾、1 是濕透 */
  setRatio: (ratio: number) => void;
  /** 開關或參數改了之後重套一次，濕度沒變也照走 */
  refresh: () => void;
}

interface MaterialBackup {
  material: StandardMaterial;
  diffuse: [number, number, number];
  specular: [number, number, number];
  specularPower: number;
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

export function createWetness(materialList: StandardMaterial[], option: WetnessOption): Wetness {
  const { babylon, reflectionTexture } = option

  /**
   * 記住原本的顏色，之後每次都拿原色去算
   *
   * 不能在現值上再乘一次，那樣調個幾次就會越調越黑，再也回不來
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
   * 濕潤是全域的一件事，不必為兩百多份材質各配一份一模一樣的參數
   */
  const fresnelParameters = new babylon.FresnelParameters()
  fresnelParameters.bias = REFLECTION_FRESNEL_BIAS
  fresnelParameters.power = REFLECTION_FRESNEL_POWER

  /** 目前有沒有真的把反射掛上去 */
  let isReflectionAttached = false

  /**
   * 乾的時候要把反射整個拆掉，不能只是把強度調成零
   *
   * 九成九的時間地面是乾的，讓每一份材質都常駐帶著一張反射貼圖，
   * 等於每一次繪製都多綁一個取樣器。
   *
   * 更要緊的是 StandardMaterial 的反射在著色器裡有 samplerCube 與
   * sampler2D 兩份宣告，靠條件編譯二選一。掛著一張 2D 的等距柱狀投影
   * 貼圖時，另一份宣告仍然存在卻永遠不會被綁，於是它退回材質單元零，
   * 而那一格綁的是別的 2D 貼圖。WebGL 會丟出
   * GL_INVALID_OPERATION: Two textures of different types use the same
   * sampler location，整個繪製呼叫作廢
   */
  function setReflectionAttached(nextAttached: boolean): void {
    if (!reflectionTexture || nextAttached === isReflectionAttached)
      return

    isReflectionAttached = nextAttached

    for (const backup of backupList) {
      backup.material.reflectionTexture = nextAttached ? reflectionTexture : null
      backup.material.reflectionFresnelParameters = fresnelParameters
    }
  }

  let appliedRatio = 0

  function apply(wet: number): void {
    setReflectionAttached(wet > APPLY_STEP)

    const fresnel = option.getFresnel?.()
    if (fresnel) {
      fresnelParameters.bias = fresnel.bias
      fresnelParameters.power = fresnel.power
    }

    const isDiffuseEnabled = option.isDiffuseEnabled?.() ?? true
    const isSpecularEnabled = option.isSpecularEnabled?.() ?? true

    for (const backup of backupList) {
      const { material, diffuse, specular } = backup
      const diffuseRatio = isDiffuseEnabled ? lerp(1, WET_DIFFUSE_RATIO, wet) : 1

      material.diffuseColor.set(
        diffuse[0] * diffuseRatio,
        diffuse[1] * diffuseRatio,
        diffuse[2] * diffuseRatio,
      )

      if (!isSpecularEnabled) {
        material.specularColor.set(specular[0], specular[1], specular[2])
        material.specularPower = backup.specularPower
        continue
      }

      /**
       * 高光往同一個目標值收，不照原值放大
       *
       * 原本的高光是每種方塊各自調過的，有的很低、有的乾脆是零。
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
  }

  return {
    setRatio(ratio: number) {
      const wet = Math.min(1, Math.max(0, ratio))
      if (Math.abs(wet - appliedRatio) < APPLY_STEP)
        return

      appliedRatio = wet
      apply(wet)
    },
    refresh() {
      apply(appliedRatio)
    },
  }
}
