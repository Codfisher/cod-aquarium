import type { Scene, Texture } from '@babylonjs/core'
import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Vector3,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../composables/use-babylon-scene'
import { getGarden } from '../garden/garden-layout'
import { createParticleDimmer } from './particle-tint'

/** 蛙聲澤，霧只罩在這一座木座上 */
const SWAMP_GARDEN = getGarden('swamp')

/**
 * 霧氣鋪滿的半徑
 *
 * 一片霧本身就有十幾格寬，散布半徑得比木座再往內收，
 * 霧的外緣才會剛好停在木框上，不會漫到外面那片乾淨的白沙
 */
const MIST_RADIUS = SWAMP_GARDEN.halfSize - 4
/** 霧貼著地面浮動的高度範圍 */
const MIST_MIN_HEIGHT = 0.5
const MIST_MAX_HEIGHT = 5

/** 帶一點綠的濕冷灰，與沼澤的場景霧同一個調性 */
const MIST_TINT_LIGHT = new Color4(0.78, 0.83, 0.76, 0.3)
const MIST_TINT_DARK = new Color4(0.68, 0.74, 0.7, 0.22)
/** 只把 alpha 歸零，色調要留著，不然淡入淡出時霧會透出一層灰黑 */
const MIST_TINT_LIGHT_CLEAR = new Color4(MIST_TINT_LIGHT.r, MIST_TINT_LIGHT.g, MIST_TINT_LIGHT.b, 0)
const MIST_TINT_DARK_CLEAR = new Color4(MIST_TINT_DARK.r, MIST_TINT_DARK.g, MIST_TINT_DARK.b, 0)

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
  /** 跟著日夜調亮度，1 為大白天 */
  setBrightness: (ratio: number) => void;
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
  particleSystem.applyFog = true
  particleSystem.emitter = new Vector3(SWAMP_GARDEN.center.x, 0, SWAMP_GARDEN.center.z)
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP

  /**
   * 霧片貼著地面長出來
   *
   * 沼澤有高有低，還有幾片水塘，霧照著地形的高度鋪才會像窪地裡積起來的濕氣。
   * 越靠沼澤中心霧越低越濃，邊緣則稀疏地掛在半空
   */
  particleSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    /**
     * 稍微偏向中心取樣
     *
     * 開根號會讓霧在圓面上均勻分布，邊緣密度與中心一樣，
     * 遠看就是一塊邊界清楚的圓餅。指數壓低一點，
     * 越往外霧片越少，外圍自然散開
     */
    const radius = Math.random() ** 0.7 * MIST_RADIUS
    const angle = Math.random() * Math.PI * 2
    const x = SWAMP_GARDEN.center.x + Math.cos(angle) * radius
    const z = SWAMP_GARDEN.center.z + Math.sin(angle) * radius
    const surfaceY = castRainRay(Math.floor(x + 0.5), Math.floor(z + 0.5)) ?? 0

    positionToUpdate.set(
      x,
      surfaceY + MIST_MIN_HEIGHT + Math.random() * (MIST_MAX_HEIGHT - MIST_MIN_HEIGHT),
      z,
    )
  }

  /**
   * 一生的透明度：淡入、撐住、淡出
   *
   * 預設只有淡出，霧片是以全不透明的狀態憑空出現的，
   * 一片接一片閃現，整團霧看起來就像在閃爍。
   * 前三成的壽命拿來淡入，後四成拿來淡出，
   * 每片霧都是慢慢浮出來、慢慢化掉，接替的過程才看不出來
   */
  particleSystem.addColorGradient(0, MIST_TINT_LIGHT_CLEAR, MIST_TINT_DARK_CLEAR)
  particleSystem.addColorGradient(0.3, MIST_TINT_LIGHT, MIST_TINT_DARK)
  particleSystem.addColorGradient(0.6, MIST_TINT_LIGHT, MIST_TINT_DARK)
  particleSystem.addColorGradient(1, MIST_TINT_LIGHT_CLEAR, MIST_TINT_DARK_CLEAR)

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

  const dimmer = createParticleDimmer([particleSystem])

  return {
    setBrightness: dimmer.setBrightness,
    dispose() {
      particleSystem.dispose()
    },
  }
}
