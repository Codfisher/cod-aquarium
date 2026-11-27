import type { Scene } from '@babylonjs/core'
import type { CampfireSmoke } from '../../../composables/use-babylon-scene'
import { createCampfireSmoke } from '../../../composables/use-babylon-scene'
import { CAMP_FIRE_LIST } from './campfire-layout'

/**
 * 拓荒原的火焰與煙（渲染端，屬於世界層）
 *
 * 爐火壇那堆火的火焰與煙是 createCampfireSmoke：兩片交叉的像素火焰立板，加上一顆顆硬邊的灰煙往上飄。
 * 拓荒原的火都是幹活用的小火（篷車邊煮飯那一堆、外圍守夜的兩堆），每一堆照叫一次，
 * 與爐火壇同一種火、同一種煙，不加火星、不放大：使用者要的是拓荒感，不是一座大營火
 */
export function createCampfireFires({ scene, worldState }: { scene: Scene; worldState: Uint8Array }): { dispose: () => void } {
  const smokeList: CampfireSmoke[] = CAMP_FIRE_LIST.map((fire) => createCampfireSmoke(scene, worldState, fire))

  return {
    dispose() {
      for (const smoke of smokeList) {
        smoke.dispose()
      }
    },
  }
}
