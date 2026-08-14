import type { Scene, Texture, UniversalCamera } from '@babylonjs/core'
import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Vector3,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../composables/use-babylon-scene'
import { measureSection } from '../../composables/use-performance-probe'
import { createParticleDimmer } from './particle-tint'

/**
 * 霧鋪開的半徑
 *
 * 比場景霧開始作用的距離再遠一點：走在裡面時前方那一片是連續的，
 * 再遠的地方交給場景霧接手，兩者之間沒有一條看得出來的界線
 */
const MIST_RADIUS = 34
/** 貼著地面的高度範圍，過腰而不過肩 */
const MIST_MIN_HEIGHT = 0.1
const MIST_MAX_HEIGHT = 1.9

/** 發射點重新對齊鏡頭的間隔（秒） */
const RECENTER_INTERVAL = 0.4

/**
 * 晨霧的時間窗
 *
 * 破曉是 0.18、日出是 0.24。霧要在天還沒亮的時候就已經積在那裡，
 * 太陽一出來才被曬散——那個「曬散」的過程本身就是晨霧最好看的一段，
 * 所以淡出拖得比淡入長
 */
const MIST_RISE_FROM = 0.09
const MIST_RISE_TO = 0.18
const MIST_FADE_FROM = 0.27
const MIST_FADE_TO = 0.41

/** 帶一點藍的冷白，是天還沒亮透時該有的顏色 */
const MIST_TINT_LIGHT = new Color4(0.9, 0.92, 0.95, 0.26)
const MIST_TINT_DARK = new Color4(0.8, 0.83, 0.88, 0.18)
const MIST_TINT_LIGHT_CLEAR = new Color4(MIST_TINT_LIGHT.r, MIST_TINT_LIGHT.g, MIST_TINT_LIGHT.b, 0)
const MIST_TINT_DARK_CLEAR = new Color4(MIST_TINT_DARK.r, MIST_TINT_DARK.g, MIST_TINT_DARK.b, 0)

/**
 * 這一刻該有多濃的晨霧，0 為沒有、1 為最濃
 *
 * 只看時刻。要不要真的鋪出來還得看人在哪裡——
 * 洞裡、雨中與沼澤上都不該有它，那是呼叫端的事
 */
export function getDawnMistRatio(timeOfDay: number): number {
  if (timeOfDay <= MIST_RISE_FROM || timeOfDay >= MIST_FADE_TO)
    return 0

  if (timeOfDay < MIST_RISE_TO)
    return smoothRange(timeOfDay, MIST_RISE_FROM, MIST_RISE_TO)

  if (timeOfDay > MIST_FADE_FROM)
    return 1 - smoothRange(timeOfDay, MIST_FADE_FROM, MIST_FADE_TO)

  return 1
}

export interface GroundMist {
  /** ratio 為此刻該有多濃，0 會讓它完全停下來 */
  update: (camera: UniversalCamera, ratio: number) => void;
  /** 跟著日夜調亮度，1 為大白天 */
  setBrightness: (ratio: number) => void;
  dispose: () => void;
}

export interface CreateGroundMistParams {
  scene: Scene;
  maxParticleCount: number;
  /** 從天空往指定格柱打射線，取得地面（或水面）高度 */
  castRainRay: (blockX: number, blockZ: number) => number | null;
}

/**
 * 一片霧的貼圖
 *
 * 與沼澤那片同一個道理：霧本來就沒有輪廓，硬邊會露出貼圖的形狀，
 * 所以這裡破例用柔邊，靠幾十片疊起來才成為一團看得見厚度的霧
 */
function createMistTexture(scene: Scene): DynamicTexture {
  const size = 64
  const texture = new DynamicTexture('ground-mist', { width: size, height: size }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.45)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true

  return texture
}

/**
 * 貼地的晨霧
 *
 * 蛙聲澤那片霧是綁死在一座木座上的：它是那座箱庭的一部分，
 * 終年不散，也不該散。這一片是另一件事——它跟著時刻走，
 * 天亮前積在整片禪庭的木座之間，太陽一升起就被曬掉。
 *
 * 做法與沼澤同一套：霧片貼著地形的高度長出來，
 * 只是發射點改成跟著鏡頭移動，於是走到哪裡腳邊都是那層白。
 * 兩者可以同時存在——走進沼澤時它會自己收掉，
 * 那裡本來就已經有一片更濃的了
 */
export function createGroundMist({
  scene,
  maxParticleCount,
  castRainRay,
}: CreateGroundMistParams): GroundMist {
  const emitter = new Vector3()

  const particleSystem = new ParticleSystem('ground-mist', maxParticleCount, scene)
  particleSystem.particleTexture = createMistTexture(scene)
  particleSystem.applyFog = true
  particleSystem.emitter = emitter
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP

  /**
   * 霧片貼著地面長出來
   *
   * 禪庭是一座座抬高的木座加上木座之間的白沙，高低差有好幾格。
   * 照著地形的高度鋪，霧才會積在低處、繞著木座的邊緣走；
   * 給一個固定的高度只會得到一片橫穿所有東西的白板
   */
  particleSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    /** 稍微偏向中心取樣，越往外霧片越疏，邊緣才自然散開 */
    const radius = Math.random() ** 0.7 * MIST_RADIUS
    const angle = Math.random() * Math.PI * 2
    const x = emitter.x + Math.cos(angle) * radius
    const z = emitter.z + Math.sin(angle) * radius
    const surfaceY = castRainRay(Math.floor(x + 0.5), Math.floor(z + 0.5)) ?? 0

    positionToUpdate.set(
      x,
      surfaceY + MIST_MIN_HEIGHT + Math.random() * (MIST_MAX_HEIGHT - MIST_MIN_HEIGHT),
      z,
    )
  }

  /** 一生的透明度：淡入、撐住、淡出，接替的過程才看不出來 */
  particleSystem.addColorGradient(0, MIST_TINT_LIGHT_CLEAR, MIST_TINT_DARK_CLEAR)
  particleSystem.addColorGradient(0.3, MIST_TINT_LIGHT, MIST_TINT_DARK)
  particleSystem.addColorGradient(0.6, MIST_TINT_LIGHT, MIST_TINT_DARK)
  particleSystem.addColorGradient(1, MIST_TINT_LIGHT_CLEAR, MIST_TINT_DARK_CLEAR)

  particleSystem.minSize = 10
  particleSystem.maxSize = 22
  particleSystem.minLifeTime = 10
  particleSystem.maxLifeTime = 18
  particleSystem.emitRate = 0

  /** 幾乎不動，只是很慢地往一邊漂 */
  particleSystem.gravity = new Vector3(0, 0.015, 0)
  particleSystem.direction1 = new Vector3(-0.05, 0.01, -0.03)
  particleSystem.direction2 = new Vector3(0.05, 0.02, 0.03)
  particleSystem.minEmitPower = 0.1
  particleSystem.maxEmitPower = 0.4
  particleSystem.minAngularSpeed = -0.04
  particleSystem.maxAngularSpeed = 0.04
  particleSystem.updateSpeed = 0.02
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD

  const texture = particleSystem.particleTexture as Texture
  texture.hasAlpha = true

  particleSystem.start()

  const dimmer = createParticleDimmer([particleSystem])

  /** 滿檔的發射率，霧片壽命長，鋪滿一整圈不需要太快 */
  const fullEmitRate = maxParticleCount / 14
  let recenterElapsed = RECENTER_INTERVAL

  return {
    update(camera, ratio) {
      measureSection('晨霧', () => {
        const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

        particleSystem.emitRate = fullEmitRate * Math.min(1, Math.max(0, ratio))

        /**
         * 發射點跟著鏡頭走
         *
         * 已經生出來的霧片留在原地，只有新的那些照著現在的位置撒。
         * 於是走過的路上霧會慢慢散掉，前方則慢慢補上——
         * 整片霧看起來是待在世界上的，不是黏在鏡頭上的
         */
        recenterElapsed += deltaTime
        if (recenterElapsed < RECENTER_INTERVAL)
          return

        recenterElapsed = 0
        emitter.copyFrom(camera.position)
      })
    },
    setBrightness: dimmer.setBrightness,
    dispose() {
      particleSystem.dispose()
    },
  }
}

function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))

  return ratio * ratio * (3 - 2 * ratio)
}
