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
import { createParticleDimmer } from './particle-tint'

/**
 * 雪的覆蓋範圍（以玩家為中心的半邊長）
 *
 * 比雨小得多，而且是照著能見度收的：霧在六格外就一片空白，
 * 鋪到七格以外的雪一片都看不到，那些粒子等於白畫。
 * 收進看得見的那顆泡泡裡，同樣的數量密度就高了好幾倍
 */
const SNOW_AREA_HALF_SIZE = 7
/**
 * 雪的生成高度
 *
 * 同樣照著能見度收。霧在六格外就全白，生成點擺得再高也只是
 * 讓雪在看不見的地方飄。五格剛好在那顆泡泡的頂上，
 * 抬頭看得到雪從白裡冒出來，低頭看得到它落地
 */
const SNOW_SPAWN_HEIGHT = 5

/**
 * 生成盒往上風處推多遠
 *
 * 風往 −x 吹、略微偏 +z，上風處因此在 +x、−z 那一側。
 * 這兩個數字要與 direction 那組向量一起改：風向轉了而偏移沒跟著轉，
 * 雪會整片從畫面外飛過去
 */
const WIND_UPWIND_OFFSET_X = 3
const WIND_UPWIND_OFFSET_Z = -1

/**
 * 一片雪
 *
 * 硬邊的方塊，與雨的水花同一種處理：這個世界的粒子沒有柔邊。
 * 中央挖掉一角讓它不是完美的正方形，飄起來才不會像一群像素同步移動
 */
function createSnowTexture(scene: Scene): DynamicTexture {
  const size = 8
  const texture = new DynamicTexture(
    'snow-flake',
    { width: size, height: size },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D

  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(0, 0, size, size)

  /** 右下角缺一小塊，八格見方的雪片才有個朝向 */
  context.clearRect(size - size / 4, size - size / 4, size / 4, size / 4)

  texture.update()
  texture.hasAlpha = true

  return texture
}

export interface SnowParticles {
  update: (camera: UniversalCamera, ratio: number) => void;
  setBrightness: (brightness: number) => void;
  dispose: () => void;
}

export interface CreateSnowParticlesParams {
  scene: Scene;
  maxParticleCount: number;
  /** 與雨共用的那道射線，用來讓屋頂底下不飄雪 */
  castRainRay: (blockX: number, blockZ: number) => number | null;
}

/**
 * 雪的粒子系統
 *
 * 與雨是同一套骨架，差別全在物理：
 * 雨是被重力拉下來的線，雪是浮在空氣裡被吹著走的片。
 *
 * 所以雪沒有水花——它落地不濺；
 * 沒有拉長的比例——它不是一條；
 * 重力只有雨的四十分之一，而橫向的風比垂直的重力還大，
 * 於是雪是斜著飄過畫面，而不是垂直落下
 */
export function createSnowParticles({
  scene,
  maxParticleCount,
  castRainRay,
}: CreateSnowParticlesParams): SnowParticles {
  const emitterPosition = new Vector3()

  /** 與雨同樣的射線快取：地形不動，查過就記著 */
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

  const particleSystem = new ParticleSystem('snow', maxParticleCount, scene)
  particleSystem.particleTexture = createSnowTexture(scene)
  particleSystem.applyFog = true
  particleSystem.emitter = emitterPosition
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP
  /**
   * 雪片正對鏡頭
   *
   * 雨鎖在 Y 軸是為了讓雨絲永遠是垂直的一條。
   * 雪片沒有方向，抬頭看它也該是一片而不是一條線
   */
  particleSystem.billboardMode = ParticleSystem.BILLBOARDMODE_ALL
  /**
   * 生成盒往上風處偏
   *
   * 這是雪與雨最不一樣的地方。雨幾乎垂直落下，生成盒對準鏡頭就好；
   * 雪是斜著飛的，盒子若也對準鏡頭，有一半的雪一出生就往下風飄走，
   * 根本不會經過眼前——畫面上因此只剩零星幾片。
   *
   * 偏移量是算出來的：雪從生成高度落到地面約兩秒半，
   * 這段時間橫向會走八格左右，所以把整個盒子往上風推四格，
   * 雪片下降到視線高度時剛好穿過鏡頭這一帶
   */
  particleSystem.minEmitBox = new Vector3(
    -SNOW_AREA_HALF_SIZE + WIND_UPWIND_OFFSET_X,
    SNOW_SPAWN_HEIGHT,
    -SNOW_AREA_HALF_SIZE + WIND_UPWIND_OFFSET_Z,
  )
  particleSystem.maxEmitBox = new Vector3(
    SNOW_AREA_HALF_SIZE + WIND_UPWIND_OFFSET_X,
    SNOW_SPAWN_HEIGHT + 3,
    SNOW_AREA_HALF_SIZE + WIND_UPWIND_OFFSET_Z,
  )

  /** 雪本身不必染色，白就是白，只讓遠處的那些淡一點 */
  particleSystem.color1 = new Color4(1, 1, 1, 0.92)
  particleSystem.color2 = new Color4(0.93, 0.96, 1, 0.72)
  particleSystem.colorDead = new Color4(1, 1, 1, 0)

  particleSystem.minSize = 0.07
  particleSystem.maxSize = 0.16

  /**
   * 活得比雨久得多
   *
   * 雨從生成高度落到地面不到一秒，雪要飄好幾秒。
   * 壽命短了雪會在半空中憑空消失，而那是最難不看到的破綻
   */
  particleSystem.minLifeTime = 4
  particleSystem.maxLifeTime = 7
  particleSystem.emitRate = 0

  /**
   * 風寫在初速上，不寫在重力上
   *
   * 這一條踩過一次坑：橫向的風原本掛在 gravity 上給了 −9，
   * 但重力是加速度不是速度——四秒之後橫向位移是 ½×9×4²，
   * 也就是七十幾格。而這座箱庭的能見度只有十七格，
   * 雪片因此在還沒降下來之前就已經衝出視野，
   * 看起來就是「在高空飄走了，地面附近什麼都沒有」。
   *
   * 真正的風是等速的：初速一次給足，重力只留下微弱的下沉。
   * 雪片於是斜著穿過眼前這一段，而不是被加速甩出去
   */
  particleSystem.gravity = new Vector3(0, -1, 0)
  /** 往下的分量與橫向的分量差不多，那個斜率就是雪被吹斜的角度 */
  particleSystem.direction1 = new Vector3(-1, -0.9, 0.2)
  particleSystem.direction2 = new Vector3(-0.72, -0.66, 0.5)
  particleSystem.minEmitPower = 3.5
  particleSystem.maxEmitPower = 5
  /** 雪片自己會轉，那是它與雨最容易分辨的地方 */
  particleSystem.minAngularSpeed = -2.4
  particleSystem.maxAngularSpeed = 2.4
  particleSystem.updateSpeed = 0.02
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
  particleSystem.preWarmCycles = 0

  /**
   * 屋頂底下不飄雪
   *
   * 與雨同一件事、同一道射線：粒子落到那一格柱的表面以下就回收。
   * 少了這個，躲進屋子裡照樣滿臉雪，而這座箱庭的重點
   * 正是「外面在颳、這裡不颳」的那個對比
   */
  const updateParticles = particleSystem.updateFunction
  particleSystem.updateFunction = (particleList) => {
    updateParticles.call(particleSystem, particleList)

    for (const particle of particleList) {
      const impactY = readImpactY(
        Math.floor(particle.position.x + 0.5),
        Math.floor(particle.position.z + 0.5),
      )
      if (Number.isNaN(impactY))
        continue

      if (particle.position.y <= impactY) {
        particle.age = particle.lifeTime
      }
    }
  }

  let isStarted = false

  const dimmer = createParticleDimmer([particleSystem])

  return {
    setBrightness: dimmer.setBrightness,
    update(camera, ratio) {
      emitterPosition.copyFrom(camera.position)
      particleSystem.emitRate = maxParticleCount * ratio

      if (ratio > 0.01 && !isStarted) {
        particleSystem.start()
        isStarted = true
      }
      else if (ratio <= 0.01 && isStarted) {
        particleSystem.stop()
        isStarted = false
      }
    },
    dispose() {
      particleSystem.dispose()
    },
  }
}
