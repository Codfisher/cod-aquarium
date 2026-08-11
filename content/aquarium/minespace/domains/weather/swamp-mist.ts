import type { Scene, Texture } from '@babylonjs/core'
import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Vector3,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../composables/use-babylon-scene'
import { SWAMP_CENTER } from '../world/structure-generator'

/** 霧氣鋪滿的半徑，與 MIST_ZONE 的外圈對齊 */
const MIST_RADIUS = 42
/** 霧貼著地面浮動的高度範圍 */
const MIST_MIN_HEIGHT = 0.5
const MIST_MAX_HEIGHT = 5

/**
 * 一片霧的貼圖
 *
 * 單片就是一塊淡到快看不見的方形霧氣，硬邊會露出貼圖的形狀，
 * 所以這裡破例用柔邊：霧本來就沒有輪廓，
 * 靠幾十片疊在一起才成為一團看得見厚度的霧
 */
function createMistTexture(scene: Scene): DynamicTexture {
  const size = 64
  const texture = new DynamicTexture('swamp-mist', { width: size, height: size }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true

  return texture
}

export interface SwampMist {
  dispose: () => void;
}

export interface CreateSwampMistParams {
  scene: Scene;
  maxParticleCount: number;
  /** 從天空往指定格柱打射線，取得地面（或水面）高度 */
  castRainRay: (blockX: number, blockZ: number) => number | null;
}

/**
 * 沼澤的體積霧
 *
 * 場景霧是跟著鏡頭走的，只能讓「站在沼澤裡的人」看不遠，
 * 從山上望過去卻什麼也沒有，沼澤看起來跟草原沒兩樣。
 * 這裡在沼澤上空鋪一層慢慢飄的霧片，讓那團濕氣有實體：
 * 遠遠就看得到一片白霧壓在窪地上，走進去才會被它罩住
 */
export function createSwampMist({
  scene,
  maxParticleCount,
  castRainRay,
}: CreateSwampMistParams): SwampMist {
  const particleSystem = new ParticleSystem('swamp-mist', maxParticleCount, scene)
  particleSystem.particleTexture = createMistTexture(scene)
  particleSystem.emitter = new Vector3(SWAMP_CENTER.x, 0, SWAMP_CENTER.z)
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP

  /**
   * 霧片貼著地面長出來
   *
   * 沼澤有高有低，還有幾片水塘，霧照著地形的高度鋪才會像窪地裡積起來的濕氣。
   * 越靠沼澤中心霧越低越濃，邊緣則稀疏地掛在半空
   */
  particleSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    /** 開根號讓取樣在圓面上是均勻的，不會全擠在中心 */
    const radius = Math.sqrt(Math.random()) * MIST_RADIUS
    const angle = Math.random() * Math.PI * 2
    const x = SWAMP_CENTER.x + Math.cos(angle) * radius
    const z = SWAMP_CENTER.z + Math.sin(angle) * radius
    const surfaceY = castRainRay(Math.floor(x + 0.5), Math.floor(z + 0.5)) ?? 0

    positionToUpdate.set(
      x,
      surfaceY + MIST_MIN_HEIGHT + Math.random() * (MIST_MAX_HEIGHT - MIST_MIN_HEIGHT),
      z,
    )
  }

  /** 帶一點綠的濕冷灰，與沼澤的場景霧同一個調性 */
  particleSystem.color1 = new Color4(0.78, 0.83, 0.76, 0.3)
  particleSystem.color2 = new Color4(0.68, 0.74, 0.7, 0.22)
  particleSystem.colorDead = new Color4(0.72, 0.78, 0.73, 0)

  /** 一片就有十幾格寬，數量少而大才不會看起來像一堆小球 */
  particleSystem.minSize = 12
  particleSystem.maxSize = 26
  particleSystem.minLifeTime = 14
  particleSystem.maxLifeTime = 26
  particleSystem.emitRate = maxParticleCount / 20

  /** 幾乎不動，只是很慢地往一邊漂 */
  particleSystem.gravity = new Vector3(0, 0.02, 0)
  particleSystem.direction1 = new Vector3(-0.06, 0.01, -0.04)
  particleSystem.direction2 = new Vector3(0.06, 0.03, 0.04)
  particleSystem.minEmitPower = 0.15
  particleSystem.maxEmitPower = 0.5
  particleSystem.minAngularSpeed = -0.05
  particleSystem.maxAngularSpeed = 0.05
  particleSystem.updateSpeed = 0.02
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD

  const texture = particleSystem.particleTexture as Texture
  texture.hasAlpha = true

  /**
   * 先跑一段時間再顯示
   *
   * 不預熱的話，第一次望向沼澤會看著霧一片一片冒出來
   */
  particleSystem.preWarmCycles = 120
  particleSystem.preWarmStepOffset = 6
  particleSystem.start()

  return {
    dispose() {
      particleSystem.dispose()
    },
  }
}
