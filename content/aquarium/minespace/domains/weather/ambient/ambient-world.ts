import type { AmbientAnchorKind, RealmId } from '../../realm/realm-definition'
import type { BlockLightSource } from '../../world/light-source'
import type { WaterMap } from '../../world/water-body'
import type { AmbientWorld } from './ambient-spot'
import { castRainRay } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { createAmbientAnchorIndex } from './ambient-anchor'

/** 世界換掉之後，環境粒子需要的那幾樣東西，由渲染執行期交出 */
export interface AmbientWorldSource {
  /** 這份世界屬於哪座場景：粒子的設定看這個，不看「目前啟用的場景」，兩者在換場景的空檔會差一下 */
  realmId: RealmId;
  worldState: Uint8Array;
  waterMap: WaterMap;
  lightSourceList: readonly BlockLightSource[];
}

/**
 * 把世界包成環境粒子要問的三個問題：表面多高、水面多高、錨點在哪
 *
 * 純資料運算，不碰 Babylon；Node 端的檢查腳本用的也是這一支
 */
export function createAmbientWorld(source: AmbientWorldSource, anchorKindList: readonly AmbientAnchorKind[]): AmbientWorld {
  /** 射線結果查過就記著，世界不再變動；NaN 代表那根格柱是空的 */
  const surfaceMap = new Map<number, number>()

  return {
    anchorIndex: createAmbientAnchorIndex({
      worldState: source.worldState,
      lightSourceList: source.lightSourceList,
      kindList: anchorKindList,
    }),
    readSurfaceY(blockX, blockZ) {
      if (blockX < 0 || blockZ < 0 || blockX >= WORLD_SIZE || blockZ >= WORLD_SIZE)
        return Number.NaN

      const key = blockX * WORLD_SIZE + blockZ
      const cached = surfaceMap.get(key)
      if (cached !== undefined)
        return cached

      const surfaceY = castRainRay(source.worldState, blockX, blockZ) ?? Number.NaN
      surfaceMap.set(key, surfaceY)
      return surfaceY
    },
    readWaterY(blockX, blockZ) {
      if (blockX < 0 || blockZ < 0 || blockX >= WORLD_SIZE || blockZ >= WORLD_SIZE)
        return -1

      return source.waterMap.levelList[blockX * WORLD_SIZE + blockZ] ?? -1
    },
  }
}
