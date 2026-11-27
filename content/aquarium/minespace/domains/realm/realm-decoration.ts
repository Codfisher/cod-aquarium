import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../weather/atmosphere'
import type { RealmId } from './realm-definition'
import { createCampfireFires } from './campfire/campfire-fires'
import { createCaveGlow } from './cave/cave-glow'
import { createJigokuSteam } from './jigoku/jigoku-steam'
import { createRuinsColossi } from './ruins/ruins-colossi'

/**
 * 各大場景自己的渲染端裝飾（屬於世界層，換場景時跟著拆）
 *
 * 方塊畫不出來、又只屬於某一個場景的東西放這裡，例如地底湖窟洞頂幾千顆螢光蟲、石殿遺址遠處的巨像。
 * 新增一個就加一行；回傳的 dispose 由 createWorldLayer 登記收尾
 */
interface RealmDecorationParam {
  scene: Scene;
  worldState: Uint8Array;
  /** 此刻的天色，遠景那一類的裝飾（石殿遺址的巨像）要跟著日夜與霧色走 */
  atmosphere: AtmosphereState;
}

const REALM_DECORATION_MAP: Partial<Record<RealmId, (param: RealmDecorationParam) => { dispose: () => void }>> = {
  cave: createCaveGlow,
  campfire: createCampfireFires,
  jigoku: createJigokuSteam,
  ruins: createRuinsColossi,
}

export function createRealmDecoration(realmId: RealmId, param: RealmDecorationParam): { dispose: () => void } | null {
  return REALM_DECORATION_MAP[realmId]?.(param) ?? null
}
