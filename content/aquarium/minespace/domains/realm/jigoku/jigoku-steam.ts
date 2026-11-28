import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import { Color4, DynamicTexture, ParticleSystem, Texture, Vector3 } from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../../composables/use-babylon-scene'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getBlock } from '../../world/world-access'
import { WORLD_HEIGHT } from '../../world/world-constants'
import { combineDecorationList } from '../realm-signature-kit'
import { createJigokuAshPall } from './jigoku-ash-pall'
import { createJigokuFarCone } from './jigoku-far-cone'
import { createJigokuLavaFalls } from './jigoku-lava-falls'
import { createJigokuLavaSurface } from './jigoku-lava-surface'
import { HOT_POOL_LIST, LAKE_Y, SPILL_SPRING, STEAM_VENT_LIST, SULPHUR_TERRACE, TERRACE_Y } from './jigoku-layout'

/**
 * 湯煙谷的渲染端裝飾（屬於世界層）：蒸氣與氣泡，加上熔岩湖的湖面、熔岩瀑的流動與遠火山
 *
 * 地獄谷的熱氣只做在霧上（壓近、染成岩漿的顏色）；台地上的熱泉、泥池與噴氣孔得看得到它們在冒煙，
 * 否則只是幾池靜水。
 *
 * 蒸氣照爐火壇的煙那一套：一顆一顆硬邊的像素方塊往上飄，不做寫實的柔邊煙霧，跟方塊世界對得起來。
 * 整座台地只用一組粒子，冒出點從一份清單裡抽：噴氣孔最常抽到（一道一道粗的煙柱），
 * 熱泉整池水面上都會冒，泥池與硫磺階地少一點；湯瀧落在湖邊那一點權重最高，
 * 水碰到熔岩，那是整座熔岩湖唯一冒白煙的地方。
 * 氣泡是另一組，很小的灰點從熱泉與泥池的水面跳起來就破掉。
 *
 * 兩組都排在天氣那一層（WEATHER_RENDERING_GROUP）：粒子在半透明的水之前畫，
 * 留在預設那一層的話，池面上的蒸氣會被後畫的水面整片蓋掉。
 *
 * 熔岩湖面的殼與縫在 jigoku-lava-surface，熔岩瀑的流幕、落潭與熔岩花在 jigoku-lava-falls，
 * 遠火山在 jigoku-far-cone、上空的煙幕在 jigoku-ash-pall，都從這裡一起建、一起拆
 * （realm-decoration 每座場景只掛一個進入點）
 */

/** 水面的世界高度：水面那一層方塊的頂面再矮八分之一格 */
const POOL_SURFACE_Y = TERRACE_Y + 0.5 - 0.125

/** 一個冒出點：圓心、半徑（零就是一個點）、高度與被抽到的權重 */
interface SteamSource {
  x: number;
  y: number;
  z: number;
  radius: number;
  weight: number;
}

/**
 * 湯瀧落在哪裡：水幕最底下那一格流水
 *
 * 崖線吃噪音，落點是地形生的時候才定的，不寫死：從泉池往北找第一根流水的格柱
 */
function findSpillFoot(worldState: Uint8Array): { x: number; y: number; z: number } | null {
  for (let z = SPILL_SPRING.z; z > SPILL_SPRING.z - 24; z--) {
    for (let y = LAKE_Y + 1; y < WORLD_HEIGHT; y++) {
      if (getBlock(worldState, SPILL_SPRING.x, y, z) === BlockId.FLOWING_WATER)
        return { x: SPILL_SPRING.x, y: y - 0.5, z }
    }
  }
  return null
}

function createSteamSourceList(worldState: Uint8Array): SteamSource[] {
  const sourceList: SteamSource[] = [
    /** 噴氣孔：洞口在台地那一層，蒸氣從洞裡冒出來 */
    ...STEAM_VENT_LIST.map((vent) => ({ x: vent.x, y: TERRACE_Y, z: vent.z, radius: 0.3, weight: 5 })),
    ...HOT_POOL_LIST.map((pool) => ({
      x: pool.x,
      y: POOL_SURFACE_Y,
      z: pool.z,
      radius: pool.radius * 0.8,
      weight: pool.kind === 'spring' ? pool.radius * 1.2 : 1.5,
    })),
    { x: SPILL_SPRING.x, y: POOL_SURFACE_Y, z: SPILL_SPRING.z, radius: SPILL_SPRING.radius * 0.8, weight: 3 },
    /** 硫磺階地：三階各積著一窪熱水，整片淡淡地冒 */
    { x: SULPHUR_TERRACE.x, y: TERRACE_Y + 2, z: SULPHUR_TERRACE.z, radius: SULPHUR_TERRACE.radius * 0.6, weight: 4 },
  ]
  const spillFoot = findSpillFoot(worldState)
  if (spillFoot)
    sourceList.push({ ...spillFoot, radius: 1.6, weight: 16 })
  return sourceList
}

/** 依權重抽一個冒出點，再在它的圓裡抽一點 */
function createSourcePicker(sourceList: SteamSource[]): (target: Vector3) => void {
  const totalWeight = sourceList.reduce((sum, source) => sum + source.weight, 0)
  const random = createSeededRandom('jigoku-steam')
  return (target) => {
    let roll = random() * totalWeight
    let picked = sourceList[0]!
    for (const source of sourceList) {
      roll -= source.weight
      if (roll <= 0) {
        picked = source
        break
      }
    }
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * picked.radius
    target.set(picked.x + Math.cos(angle) * distance, picked.y, picked.z + Math.sin(angle) * distance)
  }
}

/**
 * 蒸氣的貼圖：八格見方、四個角削掉的像素塊
 *
 * 與爐火壇的煙同一種做法（硬邊、NEAREST），顏色更白；削掉四角，一顆一顆浮起來時不是死板的正方形
 */
function createSteamTexture(scene: Scene): DynamicTexture {
  const size = 8
  const texture = new DynamicTexture('jigoku-steam-texture', { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE)
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, size, size)
  context.fillStyle = '#f4f2ee'
  context.fillRect(1, 0, size - 2, size)
  context.fillRect(0, 1, size, size - 2)
  context.fillStyle = '#dcd9d3'
  for (const [pixelX, pixelY] of [[2, 2], [5, 1], [1, 5], [5, 5], [3, 6]] as const) {
    context.fillRect(pixelX, pixelY, 2, 1)
  }
  texture.update()
  texture.hasAlpha = true
  return texture
}

function createSteam(scene: Scene, worldState: Uint8Array): ParticleSystem {
  const particleSystem = new ParticleSystem('jigoku-steam', 460, scene)
  particleSystem.particleTexture = createSteamTexture(scene)
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP
  particleSystem.applyFog = true
  const pickSource = createSourcePicker(createSteamSourceList(worldState))
  particleSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    pickSource(positionToUpdate)
  }
  /** 一冒出來最濃，越往上越淡、越散，最後化掉 */
  particleSystem.color1 = new Color4(1, 1, 1, 0.55)
  particleSystem.color2 = new Color4(0.92, 0.92, 0.9, 0.42)
  particleSystem.colorDead = new Color4(0.9, 0.9, 0.9, 0)
  particleSystem.minSize = 0.45
  particleSystem.maxSize = 1.1
  particleSystem.addSizeGradient(0, 0.6)
  particleSystem.addSizeGradient(1, 2.2)
  particleSystem.minLifeTime = 2.6
  particleSystem.maxLifeTime = 5
  particleSystem.emitRate = 80
  /** 熱的往上衝，再被火口裡的一點風帶著往東飄 */
  particleSystem.gravity = new Vector3(0.18, 0.25, 0.05)
  particleSystem.direction1 = new Vector3(-0.25, 0.9, -0.25)
  particleSystem.direction2 = new Vector3(0.25, 1.6, 0.25)
  particleSystem.minEmitPower = 0.5
  particleSystem.maxEmitPower = 1.1
  particleSystem.minAngularSpeed = 0
  particleSystem.maxAngularSpeed = 0
  particleSystem.updateSpeed = 0.012
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
  /** 一開場就有一整片台地的煙，不是看著它一縷一縷長出來 */
  particleSystem.preWarmCycles = 300
  particleSystem.preWarmStepOffset = 2
  particleSystem.start()
  return particleSystem
}

/** 氣泡的貼圖：一格灰點 */
function createBubbleTexture(scene: Scene): DynamicTexture {
  const size = 4
  const texture = new DynamicTexture('jigoku-bubble-texture', { width: size, height: size }, scene, false, Texture.NEAREST_SAMPLINGMODE)
  const context = texture.getContext() as CanvasRenderingContext2D
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true
  return texture
}

function createBubbles(scene: Scene): ParticleSystem {
  const particleSystem = new ParticleSystem('jigoku-bubbles', 120, scene)
  particleSystem.particleTexture = createBubbleTexture(scene)
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP
  particleSystem.applyFog = true
  const pickSource = createSourcePicker(HOT_POOL_LIST.map((pool) => ({
    x: pool.x,
    y: POOL_SURFACE_Y,
    z: pool.z,
    radius: pool.radius * 0.85,
    /** 泥池小但滾得兇，權重拉到與熱泉差不多 */
    weight: pool.kind === 'mud' ? 4 : pool.radius,
  })))
  particleSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    pickSource(positionToUpdate)
  }
  /** 灰白的泡，跳起來一下就破 */
  particleSystem.color1 = new Color4(0.78, 0.76, 0.72, 0.9)
  particleSystem.color2 = new Color4(0.6, 0.58, 0.55, 0.85)
  particleSystem.colorDead = new Color4(0.7, 0.7, 0.7, 0)
  particleSystem.minSize = 0.08
  particleSystem.maxSize = 0.2
  particleSystem.minLifeTime = 0.25
  particleSystem.maxLifeTime = 0.55
  particleSystem.emitRate = 45
  particleSystem.gravity = new Vector3(0, -2.5, 0)
  particleSystem.direction1 = new Vector3(-0.15, 0.8, -0.15)
  particleSystem.direction2 = new Vector3(0.15, 1.4, 0.15)
  particleSystem.minEmitPower = 0.6
  particleSystem.maxEmitPower = 1
  particleSystem.minAngularSpeed = 0
  particleSystem.maxAngularSpeed = 0
  particleSystem.updateSpeed = 0.012
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
  particleSystem.start()
  return particleSystem
}

export function createJigokuSteam({ scene, worldState, atmosphere }: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState }): { dispose: () => void } {
  const steam = createSteam(scene, worldState)
  const bubbles = createBubbles(scene)
  return combineDecorationList([
    {
      dispose() {
        /** 粒子系統預設會連貼圖一起釋放 */
        steam.dispose()
        bubbles.dispose()
      },
    },
    createJigokuLavaSurface({ scene, worldState, atmosphere }),
    createJigokuLavaFalls({ scene, worldState }),
    createJigokuFarCone({ scene, atmosphere }),
    createJigokuAshPall({ scene, atmosphere }),
  ])
}
