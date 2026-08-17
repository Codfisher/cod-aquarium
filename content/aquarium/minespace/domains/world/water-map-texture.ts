import type { Scene } from '@babylonjs/core'
import type { WaterMap } from './water-body'
import { RawTexture, Texture } from '@babylonjs/core'
import { createShoreDistanceList, createWaterLevelTextureData, SHORE_DISTANCE_MAX } from './water-body'
import { WORLD_SIZE } from './world-constants'

/**
 * 世界的水面地圖，烘成一張貼圖
 *
 * ── 為什麼是共用的 ──
 *
 * 兩個效果要問同一件事，只是問的角度不同：
 * 水下焦散要「我頭頂上有沒有水、水面在多高」，
 * 潮汐磯的湧浪要「這一格離岸邊多遠」。
 *
 * 兩者都是逐格柱、都不會變、都是同一份掃描結果。
 * 各烘一張等於把三十萬個位元組算兩遍再存兩份，
 * 而且哪天水面地圖的編碼改了，得記得兩邊一起改。
 *
 * ── 通道 ──
 *
 * R、G：水面高度，兩個位元組湊十六位元（見 water-body 的編碼說明）
 * B：這一格有沒有水
 * A：離岸邊多遠，除以 SHORE_DISTANCE_MAX 正規化過
 *
 * ── 誰先來誰建 ──
 *
 * 兩個效果的建立順序沒有保證，所以這裡走懶惰初始化。
 * 場景只有一個世界，水又是地形生成之後就不再動的東西，
 * 建一次之後大家共用同一張
 */
const waterMapTextureState = {
  texture: null as Texture | null,
  shoreDistanceTexture: null as Texture | null,
}

/**
 * 取得這個世界的水面貼圖，還沒有就建一張
 *
 * 取樣一律用最近鄰。相鄰兩格若一格有水一格沒有，
 * 內插出來的是「半有水」，藍色通道會落在門檻附近，
 * 岸邊那一圈於是時有時無；而高度是拆成兩個位元組存的，
 * 內插高位元組更是毫無意義。
 *
 * 何況這個場景本來就是一格一格的，照著格子走剛剛好
 */
export function getWaterMapTexture(scene: Scene, waterMap: WaterMap): Texture {
  if (waterMapTextureState.texture) {
    return waterMapTextureState.texture
  }

  const texture = RawTexture.CreateRGBATexture(
    createWaterLevelTextureData(waterMap),
    WORLD_SIZE,
    WORLD_SIZE,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  /** 世界是循環的，走過邊界時座標會平移一整個世界寬 */
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE

  waterMapTextureState.texture = texture

  return texture
}

/**
 * 離岸距離另外開一張，而且要雙線性
 *
 * 這是它不能跟上面那張共用的原因：那張必須用最近鄰
 * （有水沒水不能內插、十六位元的高度更不能），
 * 而離岸距離必須內插。
 *
 * 不內插的話，同一格裡的每一個片元讀到的是同一個距離，
 * 相位於是整格一個值。波長只有五格，一整個波長就只有五個階，
 * 浪不會前進，只會一塊一塊地往前跳——那正是「一步一步」的來源。
 *
 * 雙線性之後距離在格與格之間連續變化，相位才跟著連續，
 * 浪頭才是滑過去的。
 *
 * 精度只有一個位元組，也就是八分之一格；但那是取樣點的精度，
 * 取樣點之間是內插出來的，所以畫面上是連續的。
 * 八分之一格換算成相位不到零點二弧度，看不出來
 */
export function getShoreDistanceTexture(scene: Scene, waterMap: WaterMap): Texture {
  if (waterMapTextureState.shoreDistanceTexture) {
    return waterMapTextureState.shoreDistanceTexture
  }

  const distanceList = createShoreDistanceList(waterMap)
  const data = new Uint8Array(WORLD_SIZE * WORLD_SIZE * 4)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const distance = distanceList[x * WORLD_SIZE + z]!
      const value = Math.round(
        Math.min(1, Math.max(0, distance / SHORE_DISTANCE_MAX)) * 255,
      )
      /** 貼圖逐列存，格柱索引逐行存，x 與 z 要換過來 */
      const texel = (z * WORLD_SIZE + x) * 4

      data[texel] = value
      data[texel + 1] = value
      data[texel + 2] = value
      data[texel + 3] = 255
    }
  }

  const texture = RawTexture.CreateRGBATexture(
    data,
    WORLD_SIZE,
    WORLD_SIZE,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE

  waterMapTextureState.shoreDistanceTexture = texture

  return texture
}

/** 收掉水面貼圖，換世界或離開場景時呼叫 */
export function disposeWaterMapTexture(): void {
  waterMapTextureState.texture?.dispose()
  waterMapTextureState.texture = null
  waterMapTextureState.shoreDistanceTexture?.dispose()
  waterMapTextureState.shoreDistanceTexture = null
}
