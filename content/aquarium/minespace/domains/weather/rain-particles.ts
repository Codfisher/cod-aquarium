import type { Scene, UniversalCamera } from '@babylonjs/core'
import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Texture,
  Vector3,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../composables/use-babylon-scene'
import { WORLD_SIZE } from '../world/world-constants'

/** 雨的覆蓋範圍（以玩家為中心的半邊長） */
const RAIN_AREA_HALF_SIZE = 22
/** 雨的生成高度 */
const RAIN_SPAWN_HEIGHT = 16
/** 落地水花的覆蓋範圍，只需要玩家腳邊看得到的那一圈 */
const SPLASH_AREA_HALF_SIZE = 9
/** 水花離地一點點，免得一半陷進方塊裡被遮掉 */
const SPLASH_SURFACE_OFFSET = 0.03
/**
 * 開始出現水花的雨勢
 *
 * 雨區邊緣只飄著幾條雨絲，腳邊卻濺起一片水花會很出戲，
 * 等雨真的下起來才開始濺
 */
const SPLASH_START_RATIO = 0.25
/**
 * 每幀重新取樣的落點數量
 *
 * 落點是隨機挑格子打射線問來的，數量同時也是「頭頂開不開闊」的取樣數：
 * 打得到地面的比例越低，水花就越少
 */
const SPLASH_SPOT_COUNT = 48

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

/**
 * 用 Canvas 畫一塊方形水珠碎片
 *
 * Minecraft 的粒子沒有柔邊，就是一格一格的色塊，
 * 所以這裡畫硬邊方塊，再配上鄰近取樣避免縮放時被模糊掉
 */
function createSplashTexture(scene: Scene): DynamicTexture {
  const size = 8
  const texture = new DynamicTexture(
    'rain-splash',
    { width: size, height: size },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D

  /** 底色鋪滿整格，粒子邊緣才會是俐落的方角 */
  context.fillStyle = 'rgba(214, 230, 255, 1)'
  context.fillRect(0, 0, size, size)

  /** 左上角補一塊亮面，看起來才像有明暗兩階的像素貼圖 */
  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(0, 0, size / 2, size / 2)

  texture.update()
  texture.hasAlpha = true
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE

  return texture
}

export interface RainParticles {
  /** 更新雨的位置與強度，ratio 為 0 ~ 1 */
  update: (camera: UniversalCamera, ratio: number) => void;
  dispose: () => void;
}

export interface CreateRainParticlesParams {
  scene: Scene;
  maxParticleCount: number;
  /**
   * 從天空往指定格柱打一道射線，取得雨滴打到的表面高度（世界座標 Y）
   *
   * 回傳 null 代表那一格柱空無一物，雨滴沒有東西可以打
   */
  castRainRay: (blockX: number, blockZ: number) => number | null;
}

/**
 * 雨的粒子系統
 *
 * 雨雲跟著玩家走，只在頭頂一小塊區域生成粒子，
 * 遠處的雨交給霧氣表現，省下大量粒子
 */
export function createRainParticles({
  scene,
  maxParticleCount,
  castRainRay,
}: CreateRainParticlesParams): RainParticles {
  /** 發射點以參考傳入，每幀直接改座標讓雨跟著玩家走 */
  const emitterPosition = new Vector3()

  /**
   * 射線結果查過就記著
   *
   * 地形生成後不再變動，而射線每幀要打好幾十道，
   * 每道都重掃一整根格柱太浪費。null 以 NaN 記著，代表那一格柱是空的
   */
  const impactYMap = new Map<number, number>()

  function readImpactY(blockX: number, blockZ: number): number {
    const key = blockX * WORLD_SIZE + blockZ
    const cached = impactYMap.get(key)
    if (cached !== undefined)
      return cached

    const impactY = castRainRay(blockX, blockZ) ?? Number.NaN
    impactYMap.set(key, impactY)

    return impactY
  }

  /** 這一幀可以濺水花的落點，每三個數字為一組座標 */
  const splashSpotList = new Float32Array(SPLASH_SPOT_COUNT * 3)
  let splashSpotCount = 0

  /**
   * 在腳邊隨機挑幾格打射線，收集雨滴真的打得到的落點
   *
   * 射線從天而降，被屋頂或樹冠擋下時落點會停在玩家頭上，
   * 那種格子直接丟掉：頭頂有東西擋著，腳邊本來就不該濺水
   */
  function collectSplashSpotList(eyeY: number) {
    splashSpotCount = 0

    for (let index = 0; index < SPLASH_SPOT_COUNT; index++) {
      const x = emitterPosition.x + (Math.random() * 2 - 1) * SPLASH_AREA_HALF_SIZE
      const z = emitterPosition.z + (Math.random() * 2 - 1) * SPLASH_AREA_HALF_SIZE
      const impactY = readImpactY(Math.floor(x + 0.5), Math.floor(z + 0.5))

      if (Number.isNaN(impactY) || impactY > eyeY)
        continue

      const offset = splashSpotCount * 3
      splashSpotList[offset] = x
      splashSpotList[offset + 1] = impactY + SPLASH_SURFACE_OFFSET
      splashSpotList[offset + 2] = z
      splashSpotCount++
    }
  }

  const particleSystem = new ParticleSystem('rain', maxParticleCount, scene)
  particleSystem.particleTexture = createRainTexture(scene)
  particleSystem.emitter = emitterPosition
  /**
   * 雨畫在最後一層
   *
   * 陰天罩是罩在鏡頭外的一層灰，雨勢一大它的不透明度就接近全滿。
   * 雨絲若畫在它前面，抬頭與望向天邊的那些雨會被整片灰蓋掉，
   * 只剩打在地形前的那幾條——看起來就是「沒在下雨，地上卻有水花」
   */
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP
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
  const splashCount = Math.round(maxParticleCount * 0.25)
  const splashSystem = new ParticleSystem('rain-splash', splashCount, scene)
  splashSystem.particleTexture = createSplashTexture(scene)
  splashSystem.emitter = emitterPosition
  splashSystem.renderingGroupId = WEATHER_RENDERING_GROUP
  /** 方形碎片要正對鏡頭才不會被壓成一條線，低頭看也還是方的 */
  splashSystem.billboardMode = ParticleSystem.BILLBOARDMODE_ALL
  /**
   * 直接把水花放到射線算出來的落點上
   *
   * 發射盒是相對發射點的，跟著玩家就會跟著跳；
   * 改成每一顆都挑一個射線落點，玩家跳起來、走上坡、站在水邊，
   * 水花都還是貼著地
   */
  splashSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    if (splashSpotCount === 0)
      return

    const offset = Math.floor(Math.random() * splashSpotCount) * 3
    positionToUpdate.set(
      splashSpotList[offset] ?? 0,
      splashSpotList[offset + 1] ?? 0,
      splashSpotList[offset + 2] ?? 0,
    )
  }
  splashSystem.color1 = new Color4(0.85, 0.9, 1, 0.95)
  splashSystem.color2 = new Color4(0.7, 0.78, 0.92, 0.8)
  splashSystem.colorDead = new Color4(0.8, 0.86, 1, 0)
  splashSystem.minSize = 0.05
  splashSystem.maxSize = 0.11
  /** 碎片維持正方，不隨機拉長，才像從方塊世界濺出來的 */
  splashSystem.minInitialRotation = 0
  splashSystem.maxInitialRotation = 0
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

  let isRainStarted = false
  let isSplashStarted = false

  return {
    update(camera, ratio) {
      emitterPosition.copyFrom(camera.position)
      collectSplashSpotList(camera.position.y)

      /**
       * 小雨時只有零星雨絲，水花要等雨勢起來才跟上；
       * 再乘上射線打得到地面的比例，屋簷下與樹蔭裡自然就不會濺水
       */
      const openRatio = splashSpotCount / SPLASH_SPOT_COUNT
      const splashRatio = Math.max(0, ratio - SPLASH_START_RATIO) / (1 - SPLASH_START_RATIO) * openRatio

      particleSystem.emitRate = maxParticleCount * ratio
      splashSystem.emitRate = splashCount * splashRatio

      if (ratio > 0.01 && !isRainStarted) {
        particleSystem.start()
        isRainStarted = true
      }
      else if (ratio <= 0.01 && isRainStarted) {
        particleSystem.stop()
        isRainStarted = false
      }

      if (splashRatio > 0.01 && !isSplashStarted) {
        splashSystem.start()
        isSplashStarted = true
      }
      else if (splashRatio <= 0.01 && isSplashStarted) {
        splashSystem.stop()
        isSplashStarted = false
      }
    },
    dispose() {
      particleSystem.dispose()
      splashSystem.dispose()
    },
  }
}
