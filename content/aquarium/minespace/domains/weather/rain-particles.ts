import type { Scene, Texture, UniversalCamera } from '@babylonjs/core'
import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Vector3,
} from '@babylonjs/core'

/** 雨的覆蓋範圍（以玩家為中心的半邊長） */
const RAIN_AREA_HALF_SIZE = 22
/** 雨的生成高度 */
const RAIN_SPAWN_HEIGHT = 16
/** 落地水花的覆蓋範圍，只需要玩家腳邊看得到的那一圈 */
const SPLASH_AREA_HALF_SIZE = 9

/** 用 Canvas 畫一條白色雨絲，省得多一個圖檔 */
function createRainTexture(scene: Scene): DynamicTexture {
  const width = 8
  const height = 64
  const texture = new DynamicTexture('rain-drop', { width, height }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D

  const gradient = context.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.85)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  context.fillStyle = gradient
  context.fillRect(2, 0, width - 4, height)
  texture.update()
  texture.hasAlpha = true

  return texture
}

/** 用 Canvas 畫一顆濺起的小水花 */
function createSplashTexture(scene: Scene): DynamicTexture {
  const size = 16
  const texture = new DynamicTexture('rain-splash', { width: size, height: size }, scene, false)
  const context = texture.getContext() as CanvasRenderingContext2D

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  texture.update()
  texture.hasAlpha = true

  return texture
}

export interface RainParticles {
  /** 更新雨的位置與強度，ratio 為 0 ~ 1 */
  update: (camera: UniversalCamera, ratio: number, groundY: number) => void;
  dispose: () => void;
}

/**
 * 雨的粒子系統
 *
 * 雨雲跟著玩家走，只在頭頂一小塊區域生成粒子，
 * 遠處的雨交給霧氣表現，省下大量粒子
 */
export function createRainParticles(scene: Scene, maxParticleCount: number): RainParticles {
  /** 發射點以參考傳入，每幀直接改座標讓雨跟著玩家走 */
  const emitterPosition = new Vector3()
  const splashPosition = new Vector3()

  const particleSystem = new ParticleSystem('rain', maxParticleCount, scene)
  particleSystem.particleTexture = createRainTexture(scene)
  particleSystem.emitter = emitterPosition
  /**
   * 只繞 Y 軸面向鏡頭
   *
   * 預設的公告板會讓雨絲整片跟著鏡頭轉，抬頭一看全部躺平，
   * 鎖在 Y 軸雨才會一直是垂直落下的樣子
   */
  particleSystem.billboardMode = ParticleSystem.BILLBOARDMODE_Y
  particleSystem.minEmitBox = new Vector3(-RAIN_AREA_HALF_SIZE, RAIN_SPAWN_HEIGHT, -RAIN_AREA_HALF_SIZE)
  particleSystem.maxEmitBox = new Vector3(RAIN_AREA_HALF_SIZE, RAIN_SPAWN_HEIGHT + 3, RAIN_AREA_HALF_SIZE)

  particleSystem.color1 = new Color4(0.72, 0.79, 0.92, 0.5)
  particleSystem.color2 = new Color4(0.86, 0.9, 1, 0.35)
  particleSystem.colorDead = new Color4(0.8, 0.85, 1, 0)

  particleSystem.minSize = 0.3
  particleSystem.maxSize = 0.45
  particleSystem.minScaleX = 0.16
  particleSystem.maxScaleX = 0.24
  particleSystem.minScaleY = 3.4
  particleSystem.maxScaleY = 5.5

  particleSystem.minLifeTime = 0.5
  particleSystem.maxLifeTime = 0.9
  particleSystem.emitRate = 0

  /** 稍微斜著下，看起來才有風 */
  particleSystem.gravity = new Vector3(-2.5, -80, 1.5)
  particleSystem.direction1 = new Vector3(-0.4, -1, 0.2)
  particleSystem.direction2 = new Vector3(-0.2, -1, 0.4)
  particleSystem.minEmitPower = 14
  particleSystem.maxEmitPower = 20
  particleSystem.updateSpeed = 0.02
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
  particleSystem.preWarmCycles = 0

  const texture = particleSystem.particleTexture as Texture
  texture.hasAlpha = true

  /**
   * 落地水花
   *
   * 雨滴打在地上會彈起一小撮水珠，
   * 少了這個，雨看起來就只是穿過地板而已
   */
  const splashCount = Math.round(maxParticleCount * 0.4)
  const splashSystem = new ParticleSystem('rain-splash', splashCount, scene)
  splashSystem.particleTexture = createSplashTexture(scene)
  splashSystem.emitter = splashPosition
  splashSystem.billboardMode = ParticleSystem.BILLBOARDMODE_Y
  splashSystem.minEmitBox = new Vector3(-SPLASH_AREA_HALF_SIZE, 0, -SPLASH_AREA_HALF_SIZE)
  splashSystem.maxEmitBox = new Vector3(SPLASH_AREA_HALF_SIZE, 0.06, SPLASH_AREA_HALF_SIZE)
  splashSystem.color1 = new Color4(0.85, 0.9, 1, 0.75)
  splashSystem.color2 = new Color4(0.7, 0.78, 0.92, 0.55)
  splashSystem.colorDead = new Color4(0.8, 0.86, 1, 0)
  splashSystem.minSize = 0.05
  splashSystem.maxSize = 0.13
  splashSystem.minLifeTime = 0.14
  splashSystem.maxLifeTime = 0.3
  splashSystem.emitRate = 0
  splashSystem.gravity = new Vector3(0, -14, 0)
  splashSystem.direction1 = new Vector3(-0.5, 1, -0.5)
  splashSystem.direction2 = new Vector3(0.5, 1.6, 0.5)
  splashSystem.minEmitPower = 0.7
  splashSystem.maxEmitPower = 1.8
  splashSystem.updateSpeed = 0.02
  splashSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD

  const splashTexture = splashSystem.particleTexture as Texture
  splashTexture.hasAlpha = true

  let isStarted = false

  return {
    update(camera, ratio, groundY) {
      emitterPosition.copyFrom(camera.position)
      splashPosition.set(camera.position.x, groundY, camera.position.z)

      particleSystem.emitRate = maxParticleCount * ratio
      splashSystem.emitRate = splashCount * ratio

      if (ratio > 0.01 && !isStarted) {
        particleSystem.start()
        splashSystem.start()
        isStarted = true
      }
      else if (ratio <= 0.01 && isStarted) {
        particleSystem.stop()
        splashSystem.stop()
        isStarted = false
      }
    },
    dispose() {
      particleSystem.dispose()
      splashSystem.dispose()
    },
  }
}
