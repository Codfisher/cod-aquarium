import type { Scene, Texture } from '@babylonjs/core'
import type { RealmParticleArea, RealmWeatherParticle } from '../realm/realm-definition'
import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Vector3,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../composables/use-babylon-scene'
import { getGarden } from '../garden/garden-layout'
import { sampleParticleArea } from './particle-area'
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
/** 大廳的霧片範圍：整座蛙聲澤，不跟著鏡頭走 */
export const HUB_MIST_AREA: SwampMistArea = {
  centerX: SWAMP_GARDEN.center.x,
  centerZ: SWAMP_GARDEN.center.z,
  radius: MIST_RADIUS,
  followRadius: MIST_RADIUS,
}

/** 大場景的霧片範圍：多了水面高度與霧片的高度範圍，見 RealmWeatherParticle */
export type SwampMistArea = RealmParticleArea & Partial<Pick<NonNullable<RealmWeatherParticle['swampMist']>, 'waterSurfaceY' | 'heightRange'>>

/**
 * 某個時刻的霧片濃度
 *
 * 給大場景用：清晨與傍晚最濃（peakDensity），白天收到 dayDensity，夜裡介於兩者之間。
 * 時刻零是午夜、四分之一是日出、四分之三是日落；晨昏那兩段各前後約一個半小時
 */
export function measureMistDensity(timeOfDay: number, dayDensity: number, peakDensity: number): number {
  const twilightDistance = Math.min(Math.abs(timeOfDay - 0.25), Math.abs(timeOfDay - 0.75))
  const twilight = 1 - Math.min(1, Math.max(0, (twilightDistance - 0.03) / 0.07))
  const isDay = timeOfDay > 0.25 && timeOfDay < 0.75
  const base = isDay ? dayDensity : (dayDensity + peakDensity) / 2
  return base + (peakDensity - base) * twilight * twilight * (3 - 2 * twilight)
}

/**
 * 大場景裡一片霧最多抽幾次落點
 *
 * 抽到木棧、泥灘或枯木上就重抽；抽滿了還沒落在水上就用最後那一點，
 * 霧只是薄一點，不會整片缺掉
 */
const WATER_PICK_ATTEMPT_COUNT = 4

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
  /**
   * 霧片鋪在哪一片，null 是關掉
   *
   * 大廳是蛙聲澤（HUB_MIST_AREA），千蛙沼由場景定義給；別的場景同一個座標可能是湖心，整個關掉。
   * 換了範圍或關掉時，連飄在半空的那些一起清掉：換場景時霧正蓋滿畫面，看不到它們消失
   */
  setArea: (area: SwampMistArea | null) => void;
  /**
   * 濃度倍率（零到一），乘在生成速度上，1 是原本的濃度
   *
   * 大廳一直是 1；千蛙沼照時刻給（見 measureMistDensity）。
   * 改的是生成速度，霧片是一片一片慢慢多起來、慢慢少下去，不會整團跳一下
   */
  setDensity: (ratio: number) => void;
  dispose: () => void;
}

export interface CreateSwampMistParams {
  scene: Scene;
  /** 容量：大場景跟著鏡頭鋪的那一圈比蛙聲澤大，給到大廳那一份的三倍 */
  maxParticleCount: number;
  /** 大廳那一份的片數，生成速度照它算：大廳的濃度與加容量之前一模一樣 */
  baseParticleCount: number;
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
  baseParticleCount,
  castRainRay,
}: CreateSwampMistParams): SwampMist {
  const particleSystem = new ParticleSystem('swamp-mist', maxParticleCount, scene)
  particleSystem.particleTexture = createMistTexture(scene)
  particleSystem.applyFog = true
  const emitterPosition = new Vector3(HUB_MIST_AREA.centerX, 0, HUB_MIST_AREA.centerZ)
  particleSystem.emitter = emitterPosition
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP
  let area: SwampMistArea | null = HUB_MIST_AREA

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
     * 越往外霧片越少，外圍自然散開。大場景的範圍跟著鏡頭走，見 particle-area
     */
    const currentArea = area ?? HUB_MIST_AREA
    let { x, z } = sampleParticleArea(scene, currentArea, 0.7)
    let surfaceY = castRainRay(Math.floor(x + 0.5), Math.floor(z + 0.5)) ?? 0

    /** 大場景：霧貼著水面積，落在木棧、泥灘、枯木上的重抽（見 WATER_PICK_ATTEMPT_COUNT） */
    const waterSurfaceY = currentArea.waterSurfaceY
    if (waterSurfaceY !== undefined) {
      for (let attempt = 1; attempt < WATER_PICK_ATTEMPT_COUNT && surfaceY > waterSurfaceY + 0.05; attempt++) {
        ({ x, z } = sampleParticleArea(scene, currentArea, 0.7))
        surfaceY = castRainRay(Math.floor(x + 0.5), Math.floor(z + 0.5)) ?? 0
      }
    }

    const [minHeight, maxHeight] = currentArea.heightRange ?? [MIST_MIN_HEIGHT, MIST_MAX_HEIGHT]
    positionToUpdate.set(
      x,
      surfaceY + minHeight + Math.random() * (maxHeight - minHeight),
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
  const baseEmitRate = baseParticleCount / 20
  particleSystem.emitRate = baseEmitRate

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
    setArea(nextArea) {
      if (nextArea === area && (nextArea !== null) === particleSystem.isStarted())
        return

      area = nextArea
      particleSystem.stop()
      particleSystem.reset()
      if (nextArea) {
        emitterPosition.set(nextArea.centerX, 0, nextArea.centerZ)
        particleSystem.start()
      }
    },
    setDensity(ratio) {
      particleSystem.emitRate = baseEmitRate * ratio
    },
    dispose() {
      particleSystem.dispose()
    },
  }
}
