import type { Scene } from '@babylonjs/core'
import type { CampfireSmoke } from '../../../composables/use-babylon-scene'
import { Color4, DynamicTexture, ParticleSystem, Texture, Vector3 } from '@babylonjs/core'
import { createCampfireSmoke } from '../../../composables/use-babylon-scene'
import { getGroundY } from '../../world/world-access'
import { BONFIRE_EMBER_OFFSET_LIST, CAMP_CENTER, CAMP_FIRE_LIST } from './campfire-layout'

/**
 * 營火谷的火焰、煙與火星（渲染端，屬於世界層）
 *
 * 爐火壇那堆火的火焰與煙是 createCampfireSmoke：兩片交叉的像素火焰立板，加上一顆顆硬邊的灰煙往上飄。
 * 這裡每一個火塘照叫一次，同一種火、同一種煙：
 * 小營地一格火塘一組；大篝火的火塘是五格十字，每一格各一組，疊起來是一座比人高的火、一道粗的煙柱。
 *
 * 大篝火另加一組火星：一顆顆很小的橘色方點從火心往上竄，加法混合，入夜時最看得出來。
 * 爐火壇的火小，火星混在火舌裡看不出來；放大成篝火，那一陣一陣往上衝的火星就是它跟一堆小火不同的地方
 */

/** 火星的貼圖：一格硬邊的方點，與煙同樣用 NEAREST，維持方塊世界的語言 */
function createSparkTexture(scene: Scene): DynamicTexture {
  const size = 4
  const texture = new DynamicTexture('campfire-spark-texture', { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE)
  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true
  return texture
}

/** 大篝火的火星 */
function createBonfireSparks(scene: Scene, groundY: number): ParticleSystem {
  const particleSystem = new ParticleSystem('campfire-bonfire-sparks', 80, scene)
  particleSystem.particleTexture = createSparkTexture(scene)
  particleSystem.applyFog = true
  /** 從火塘頂面往上半格冒出來，五格十字的範圍裡 */
  particleSystem.emitter = new Vector3(CAMP_CENTER.x, groundY + 0.1, CAMP_CENTER.z)
  particleSystem.minEmitBox = new Vector3(-0.9, 0, -0.9)
  particleSystem.maxEmitBox = new Vector3(0.9, 0.6, 0.9)
  /** 剛迸出來是亮黃，越往上越紅、越暗，最後熄掉 */
  particleSystem.color1 = new Color4(1.6, 1.05, 0.4, 1)
  particleSystem.color2 = new Color4(1.4, 0.6, 0.18, 1)
  particleSystem.colorDead = new Color4(0.5, 0.08, 0, 0)
  particleSystem.minSize = 0.05
  particleSystem.maxSize = 0.11
  particleSystem.minLifeTime = 0.9
  particleSystem.maxLifeTime = 2.4
  particleSystem.emitRate = 12
  /** 熱氣往上托，再被風往一側帶一點 */
  particleSystem.gravity = new Vector3(0.15, 0.9, 0.08)
  particleSystem.direction1 = new Vector3(-0.6, 1.6, -0.6)
  particleSystem.direction2 = new Vector3(0.6, 2.6, 0.6)
  particleSystem.minEmitPower = 0.6
  particleSystem.maxEmitPower = 1.3
  particleSystem.minAngularSpeed = 0
  particleSystem.maxAngularSpeed = 0
  particleSystem.updateSpeed = 0.012
  /** 火星自己會發光，加法混合疊在夜色上才亮得起來 */
  particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD
  particleSystem.start()
  return particleSystem
}

export function createCampfireFires({ scene, worldState }: { scene: Scene; worldState: Uint8Array }): { dispose: () => void } {
  const smokeList: CampfireSmoke[] = []

  for (const fire of CAMP_FIRE_LIST) {
    const offsetList = fire.isBonfire ? BONFIRE_EMBER_OFFSET_LIST : [{ x: 0, z: 0 }]
    for (const offset of offsetList) {
      smokeList.push(createCampfireSmoke(scene, worldState, { x: fire.x + offset.x, z: fire.z + offset.z }))
    }
  }

  const sparks = createBonfireSparks(scene, getGroundY(worldState, CAMP_CENTER.x, CAMP_CENTER.z))

  return {
    dispose() {
      for (const smoke of smokeList) {
        smoke.dispose()
      }
      /** 粒子系統預設會連貼圖一起釋放 */
      sparks.dispose()
    },
  }
}
