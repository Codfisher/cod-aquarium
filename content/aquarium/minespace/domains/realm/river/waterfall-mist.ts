import type { Scene } from '@babylonjs/core'
import type { AtmosphereState } from '../../weather/atmosphere'
import type { RealmBackdrop } from '../realm-definition'
import { Color4, DynamicTexture, ParticleSystem, Vector3 } from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../../composables/use-babylon-scene'
import { createWaterfallCurtain } from './waterfall-curtain'

/**
 * 瀑布底下的水霧
 *
 * 水落進潭裡會炸出一團細水沫，再散成一片慢慢飄開的白霧；少了它，
 * 方塊疊出來的水幕落進潭裡就只是兩塊顏色相接。兩套粒子：
 *
 * - 水沫：小而快，從水幕落點往外、往上噴，一兩秒就散
 * - 水霧：大而淡，從潭面升起，順著溪往下游慢慢飄，七八秒才散
 *
 * 顏色每幀照此刻的光算：天光打底、直射光往上加，太陽照到時水沫是亮的暖白，
 * 夜裡跟著暗下來，不會浮在暗景前面發光。
 * 屬於世界層：由 backdrop 建、跟著換場景拆（見 RealmBackdrop.waterfallMist）
 */

/** 水沫與水霧的透明度：水沫實一點，水霧很淡，靠疊起來才看得出一團 */
const SPRAY_ALPHA = 0.42
const MIST_ALPHA = 0.2

/** 光的權重：天光打底，直射光往上加，水沫迎著太陽的那一面才會亮 */
const AMBIENT_WEIGHT = 0.75
const SUN_WEIGHT = 0.55

/** 一片柔邊的霧，與晨霧同一種畫法 */
function createPuffTexture(scene: Scene): DynamicTexture {
  const size = 64
  const texture = new DynamicTexture('waterfall-mist', { width: size, height: size }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.35)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true
  return texture
}

export interface WaterfallMist {
  dispose: () => void;
}

interface CreateWaterfallMistParam {
  scene: Scene;
  atmosphere: AtmosphereState;
  setting: NonNullable<RealmBackdrop['waterfallMist']>;
}

export function createWaterfallMist({ scene, atmosphere, setting }: CreateWaterfallMistParam): WaterfallMist {
  const texture = createPuffTexture(scene)
  /** 水幕：流水外面那層往下捲的白水紋，另一份網格，一起建、一起拆 */
  const curtain = createWaterfallCurtain({ scene, atmosphere })

  /** 水沫：水幕落點那一排，往下游與上方噴 */
  const spray = new ParticleSystem('waterfall-spray', 240, scene)
  spray.particleTexture = texture
  spray.emitter = new Vector3(setting.x, setting.y, setting.z)
  spray.minEmitBox = new Vector3(0, 0, -setting.halfWidth)
  spray.maxEmitBox = new Vector3(1.5, 0.6, setting.halfWidth)
  spray.direction1 = new Vector3(0.8, 1.2, -0.8)
  spray.direction2 = new Vector3(3, 3, 0.8)
  spray.minEmitPower = 0.6
  spray.maxEmitPower = 1.6
  spray.gravity = new Vector3(0, -0.8, 0)
  spray.minSize = 1.2
  spray.maxSize = 3.2
  spray.minLifeTime = 1.2
  spray.maxLifeTime = 2.4
  spray.emitRate = 100
  spray.minAngularSpeed = -0.6
  spray.maxAngularSpeed = 0.6

  /** 水霧：潭面上一大片，順著溪往下游飄、慢慢升高散掉 */
  const mist = new ParticleSystem('waterfall-mist', 70, scene)
  mist.particleTexture = texture
  mist.emitter = new Vector3(setting.x, setting.y, setting.z)
  mist.minEmitBox = new Vector3(0, 0, -setting.halfWidth - 2)
  mist.maxEmitBox = new Vector3(setting.halfWidth + 2, 1.5, setting.halfWidth + 2)
  mist.direction1 = new Vector3(0.3, 0.1, -0.15)
  mist.direction2 = new Vector3(0.8, 0.35, 0.15)
  mist.minEmitPower = 0.4
  mist.maxEmitPower = 0.9
  mist.gravity = new Vector3(0, 0.05, 0)
  mist.minSize = 6
  mist.maxSize = 13
  mist.minLifeTime = 6
  mist.maxLifeTime = 10
  mist.emitRate = 8
  mist.minAngularSpeed = -0.08
  mist.maxAngularSpeed = 0.08

  for (const system of [spray, mist]) {
    system.renderingGroupId = WEATHER_RENDERING_GROUP
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD
    system.applyFog = true
    system.colorDead = new Color4(1, 1, 1, 0)
    system.start()
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    const ambient = atmosphere.ambientIntensity * atmosphere.ambientRatio * AMBIENT_WEIGHT
    const sun = atmosphere.lightIntensity * atmosphere.lightRatio * SUN_WEIGHT
    const red = Math.min(1, atmosphere.ambientSkyColor.r * ambient + atmosphere.lightColor.r * sun)
    const green = Math.min(1, atmosphere.ambientSkyColor.g * ambient + atmosphere.lightColor.g * sun)
    const blue = Math.min(1, atmosphere.ambientSkyColor.b * ambient + atmosphere.lightColor.b * sun)
    spray.color1.set(red, green, blue, SPRAY_ALPHA)
    spray.color2.set(red * 0.92, green * 0.95, blue, SPRAY_ALPHA * 0.7)
    mist.color1.set(red, green, blue, MIST_ALPHA)
    mist.color2.set(red * 0.94, green * 0.97, blue, MIST_ALPHA * 0.75)
  })

  return {
    dispose() {
      scene.onBeforeRenderObservable.remove(observer)
      curtain.dispose()
      /** 兩套粒子共用一張貼圖，各自不拆，最後拆一次 */
      spray.dispose(false)
      mist.dispose(false)
      texture.dispose()
    },
  }
}
