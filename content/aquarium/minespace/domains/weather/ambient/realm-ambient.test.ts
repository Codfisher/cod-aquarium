import type { RealmId } from '../../realm/realm-definition'
import type { RealmAmbientFrame } from './realm-ambient'
import { NullEngine, ParticleSystem, RawTexture, Scene, UniversalCamera, Vector3 } from '@babylonjs/core'
import { describe, expect, it, vi } from 'vitest'
import { findSafeStandingPosition } from '../../player/collision'
import { getRealm } from '../../realm/realm-list'
import { generateRealmTerrain } from '../../realm/realm-terrain'
import { collectLightSourceList } from '../../world/light-source'
import { scanWaterMap } from '../../world/water-body'
import { WORLD_HEIGHT, WORLD_SIZE } from '../../world/world-constants'

/**
 * 環境粒子執行期的生命週期（拿 NullEngine 跑，不需要瀏覽器）
 *
 * 看三件事：一、夜裡與白天各自長出該長的東西；二、雨天躲起來；
 * 三、換世界的空檔整批收掉、換回來重建，粒子系統與貼圖都不累積（沒有洩漏）。
 * 畫不出畫面，所以只看粒子的數量與場景裡登記的系統、貼圖
 */

/** 真正的 use-babylon-scene 會把整個渲染環境一起拉進來，這裡只要那個常數 */
vi.mock('../../../composables/use-babylon-scene', () => ({ WEATHER_RENDERING_GROUP: 2 }))

/** 貼圖用 DynamicTexture 要畫布，Node 沒有；換成一張假的原始貼圖，數量照樣能對帳 */
vi.mock('./ambient-shape', async (importOriginal) => {
  const real = await importOriginal<typeof import('./ambient-shape')>()
  return {
    ...real,
    createAmbientTexture: (scene: Scene, name: string, shape: string) => {
      const frameCount = shape === 'butterfly' || shape === 'dragonfly' ? 2 : 1
      const texture = RawTexture.CreateRGBATexture(new Uint8Array(4 * 7 * 7 * frameCount), 7 * frameCount, 7, scene)
      texture.name = name
      texture.hasAlpha = true
      texture.isReady = () => true
      return { texture, cellWidth: 7, cellHeight: 7, frameCount }
    },
  }
})

/** NullEngine 不編譯著色器，粒子系統永遠「還沒準備好」而不更新；這裡讓它直接過 */
ParticleSystem.prototype.isReady = () => true

const { createRealmAmbient } = await import('./realm-ambient')

function createSource(realmId: RealmId) {
  const worldState = new Uint8Array(WORLD_SIZE * WORLD_SIZE * WORLD_HEIGHT)
  generateRealmTerrain(realmId, worldState)
  return {
    realmId,
    worldState,
    waterMap: scanWaterMap(worldState),
    lightSourceList: collectLightSourceList(worldState),
  }
}

function countAlive(scene: Scene): number {
  return scene.particleSystems.reduce((sum, system) => sum + system.getActiveCount(), 0)
}

describe('環境粒子的生命週期', () => {
  const engine = new NullEngine()
  engine.getDeltaTime = () => 16
  const scene = new Scene(engine)
  scene.getAnimationRatio = () => 1
  const camera = new UniversalCamera('camera', new Vector3(0, 0, 0), scene)
  scene.activeCamera = camera
  const baseTextureCount = scene.textures.length

  let source: ReturnType<typeof createSource> | null = null
  const ambient = createRealmAmbient({ scene, getParticleRatio: () => 1, getWorldSource: () => source })

  function step(frameCount: number, overrides: Partial<RealmAmbientFrame> = {}) {
    for (let index = 0; index < frameCount; index++) {
      ambient.update({
        camera,
        deltaSecond: 1 / 60,
        dayRatio: 0,
        timeOfDay: 0,
        brightness: 0.2,
        rainRatio: 0,
        snowRatio: 0,
        visibleRatio: 1,
        windScale: 1,
        ...overrides,
      })
      scene.render()
    }
  }

  function placeCamera(realmId: RealmId) {
    const realm = getRealm(realmId)
    const standing = findSafeStandingPosition(source!.worldState, realm.spawn.x, realm.spawn.z)
    camera.position.set(standing.x, standing.y + 1.6, standing.z)
  }

  it('風露原：夜裡是螢火、白天換成蝴蝶，每一層的活粒子不超過容量', () => {
    source = createSource('meadow')
    placeCamera('meadow')
    step(1)
    expect(scene.particleSystems).toHaveLength(3)

    step(60 * 12)
    const fireflySystem = scene.particleSystems.find((system) => system.name === 'ambient-firefly')!
    expect(fireflySystem.getActiveCount()).toBeGreaterThan(40)

    step(60 * 25, { dayRatio: 1, timeOfDay: 0.5, brightness: 1 })
    const butterflySystem = scene.particleSystems.find((system) => system.name === 'ambient-butterfly')!
    expect(butterflySystem.getActiveCount()).toBeGreaterThan(5)
    expect(fireflySystem.getActiveCount()).toBeLessThan(3)

    for (const system of scene.particleSystems)
      expect(system.getActiveCount()).toBeLessThanOrEqual(system.getCapacity())
  })

  it('下雨時蟲與花瓣躲起來：不再生新的，舊的走完', () => {
    step(60 * 30, { dayRatio: 1, timeOfDay: 0.5, brightness: 1, rainRatio: 1 })
    expect(countAlive(scene)).toBe(0)
  })

  it('來回換場景：世界空檔全部收掉，粒子系統與貼圖不累積', { timeout: 120000 }, () => {
    const realmIdList: RealmId[] = ['lake', 'village', 'cave', 'alpine', 'blizzard', 'rainvale']
    const sourceMap = new Map(realmIdList.map((realmId) => [realmId, createSource(realmId)]))

    for (let round = 0; round < 5; round++) {
      for (const realmId of realmIdList) {
        source = null
        step(2)
        expect(scene.particleSystems).toHaveLength(0)
        expect(scene.textures.length).toBe(baseTextureCount)

        source = sourceMap.get(realmId)!
        placeCamera(realmId)
        step(2, { dayRatio: 0.5, timeOfDay: 0.3 })
        expect(scene.particleSystems).toHaveLength(getRealm(realmId).ambientParticleList!.length)
        expect(scene.textures.length).toBe(baseTextureCount + scene.particleSystems.length)
      }
    }

    source = null
    step(1)
    expect(scene.particleSystems).toHaveLength(0)
    ambient.dispose()
    expect(scene.textures.length).toBe(baseTextureCount)
  })
})
