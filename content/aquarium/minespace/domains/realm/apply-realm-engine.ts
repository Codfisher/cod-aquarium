import type { ParticleSystem, Scene, Vector3 } from '@babylonjs/core'
import type { RealmDefinition } from './realm-definition'
import {
  CAVE_DRIP_NAME_PREFIX,
  CAVE_MOUTH_LIGHT_NAME,
  MOON_DISC_NAME,
  MOON_GLOW_NAME,
  OVERCAST_NAME,
  SKYBOX_NAME,
  STAR_FIELD_NAME,
  SUN_DISC_NAME,
  SUN_GLOW_NAME,
  SUN_LIGHT_NAME,
} from '../../composables/use-babylon-scene'
import { volumetricCloudState } from '../weather/volumetric-cloud/volumetric-cloud'

/**
 * 引擎層裡綁著場景的那幾樣，換場景時跟著切
 *
 * 引擎層整個工作階段只建一次，裡面有幾樣其實只屬於某一種場景：
 *
 * - 天空罩、星空、日月與光暈、陰天罩：地底的場景（isUnderground）頭上是岩，整套藏起來不畫。
 *   用 isVisible 不用 setEnabled：日月的光暈每幀被除錯開關的觀察者拿 isEnabled 對一次，會被開回來。
 *   雲由天氣每幀寫 visibleRatio 收掉（見 use-weather），這裡先寫一次零，開始漫遊之前天氣還沒在跑
 * - 太陽的陰影：地底照不到太陽，陰影圖整張不畫（shadowEnabled），省下兩層分層陰影的繪製。
 *   這一下會讓材質重編，剛好發生在轉場的霧蓋滿畫面時，換好之後還會等著色器編好才散霧
 * - 岩響窟洞口那盞天光：只有大廳有那個洞口
 * - 洞頂滴水的兩組粒子：大廳落在岩響窟，有 caveDripList 的場景搬過去，其餘停掉
 *
 * 由 render-runtime 在場景換上（enterWorldLayer）與初次建好世界時各呼叫一次
 */

/** 天空那幾顆網格的名字，地底時整套藏起來 */
const SKY_MESH_NAME_LIST = [
  SKYBOX_NAME,
  STAR_FIELD_NAME,
  SUN_DISC_NAME,
  SUN_GLOW_NAME,
  MOON_DISC_NAME,
  MOON_GLOW_NAME,
  OVERCAST_NAME,
] as const

/**
 * 滴水粒子原本（岩響窟）的發射點
 *
 * 第一次呼叫時記下來，回到大廳時放回去。以 scene 為鍵：
 * 換畫質重來會建一個新的場景，舊的那份跟著場景一起被回收
 */
const hubDripPointMap = new WeakMap<Scene, Map<string, Vector3>>()

function findDripSystemList(scene: Scene): ParticleSystem[] {
  return scene.particleSystems
    .filter((system): system is ParticleSystem => system.name.startsWith(CAVE_DRIP_NAME_PREFIX) && 'emitter' in system)
}

function applyCaveDrip(scene: Scene, realm: RealmDefinition): void {
  const systemList = findDripSystemList(scene)

  let hubPointMap = hubDripPointMap.get(scene)
  if (!hubPointMap) {
    hubPointMap = new Map()
    for (const system of systemList) {
      const emitter = system.emitter
      if (emitter && 'clone' in emitter && 'x' in emitter) {
        hubPointMap.set(system.name, (emitter as Vector3).clone())
      }
    }
    hubDripPointMap.set(scene, hubPointMap)
  }

  for (const [index, system] of systemList.entries()) {
    const emitter = system.emitter as Vector3
    const hubPoint = hubPointMap.get(system.name)
    const realmPoint = realm.hasGardens ? hubPoint : realm.caveDripList?.[index]

    if (!realmPoint) {
      system.stop()
      continue
    }

    emitter.set(realmPoint.x, realmPoint.y, realmPoint.z)
    if (!system.isStarted()) {
      system.start()
    }
  }
}

export function applyRealmToEngine(scene: Scene, realm: RealmDefinition): void {
  const isUnderground = realm.isUnderground ?? false

  for (const name of SKY_MESH_NAME_LIST) {
    const mesh = scene.getMeshByName(name)
    if (mesh) {
      mesh.isVisible = !isUnderground
    }
  }
  if (isUnderground) {
    volumetricCloudState.visibleRatio = 0
  }

  const sunLight = scene.getLightByName(SUN_LIGHT_NAME)
  if (sunLight && sunLight.shadowEnabled === isUnderground) {
    sunLight.shadowEnabled = !isUnderground
  }

  scene.getLightByName(CAVE_MOUTH_LIGHT_NAME)?.setEnabled(realm.hasGardens)

  applyCaveDrip(scene, realm)
}
