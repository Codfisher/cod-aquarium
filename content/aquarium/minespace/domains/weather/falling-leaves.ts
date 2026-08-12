import type { Scene } from '@babylonjs/core'
import {
  Color4,
  DynamicTexture,
  NoiseProceduralTexture,
  ParticleSystem,
  Texture,
  Vector3,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../composables/use-babylon-scene'
import { AUTUMN_GROVE } from '../world/biome'

/** 落葉飄散的半徑，比生態區小一點，讓葉子集中在真的長著樹的那一圈 */
const LEAF_RADIUS = AUTUMN_GROVE.radius - 6
/** 葉子從樹冠往上這個範圍內冒出來，看起來才像剛從枝頭鬆脫 */
const CANOPY_OFFSET_RANGE: [number, number] = [-1.5, 1.5]
/** 樹冠射線打不到東西時的保底高度 */
const FALLBACK_SPAWN_HEIGHT = 24

/**
 * 一片葉子的貼圖
 *
 * 方塊世界的粒子沒有柔邊，就是幾格色塊，
 * 所以這裡用硬邊畫一片斜的葉子：中間一道葉脈，兩側各一塊深淺不同的葉面。
 * 顏色留給粒子系統染，這張圖只負責形狀與明暗
 */
function createLeafTexture(scene: Scene): DynamicTexture {
  const size = 8
  const texture = new DynamicTexture(
    'autumn-leaf',
    { width: size, height: size },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, size, size)

  /** 葉面：一片斜著的菱形，每一列的寬度自己指定，形狀才控制得住 */
  const rowList = [
    { start: 3, width: 2 },
    { start: 2, width: 4 },
    { start: 1, width: 5 },
    { start: 1, width: 6 },
    { start: 1, width: 6 },
    { start: 2, width: 5 },
    { start: 3, width: 3 },
    { start: 4, width: 1 },
  ]

  rowList.forEach((row, index) => {
    /** 上半片亮、下半片暗，翻轉時才看得出正反面 */
    context.fillStyle = index < 4 ? 'rgba(255, 255, 255, 1)' : 'rgba(196, 196, 196, 1)'
    context.fillRect(row.start, index, row.width, 1)
  })

  /** 葉脈：從葉柄斜斜往上的一道暗線 */
  context.fillStyle = 'rgba(150, 150, 150, 1)'
  for (let index = 0; index < 6; index++) {
    context.fillRect(3 - Math.floor(index / 3) + Math.floor(index / 2), index + 1, 1, 1)
  }

  texture.update()
  texture.hasAlpha = true
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE

  return texture
}

export interface FallingLeaves {
  dispose: () => void;
}

export interface CreateFallingLeavesParams {
  scene: Scene;
  maxParticleCount: number;
  /** 從天空往指定格柱打射線，取得樹冠（或地面）的高度 */
  castRainRay: (blockX: number, blockZ: number) => number | null;
}

/**
 * 落葉林的飄落葉子
 *
 * 樹是靜止的方塊，光靠顏色只能看出「這裡的葉子是黃的」。
 * 讓葉子一片片從樹冠鬆脫、邊轉邊斜著飄下來，
 * 這片林子才會是活的：風一直在吹，葉子一直在掉
 */
export function createFallingLeaves({
  scene,
  maxParticleCount,
  castRainRay,
}: CreateFallingLeavesParams): FallingLeaves {
  const particleSystem = new ParticleSystem('autumn-leaves', maxParticleCount, scene)
  particleSystem.particleTexture = createLeafTexture(scene)
  particleSystem.emitter = new Vector3(AUTUMN_GROVE.x, 0, AUTUMN_GROVE.z)
  particleSystem.renderingGroupId = WEATHER_RENDERING_GROUP

  /**
   * 葉子從樹冠上鬆脫
   *
   * 射線由上往下打，第一個碰到的就是樹冠；沒有樹的空地打到的是地面，
   * 葉子便貼著地面生成——那正好是風把落葉捲起來的樣子
   */
  particleSystem.startPositionFunction = (_worldMatrix, positionToUpdate) => {
    /** 開根號讓取樣在圓面上是均勻的，不會全擠在中心 */
    const radius = Math.sqrt(Math.random()) * LEAF_RADIUS
    const angle = Math.random() * Math.PI * 2
    const x = AUTUMN_GROVE.x + Math.cos(angle) * radius
    const z = AUTUMN_GROVE.z + Math.sin(angle) * radius
    const canopyY = castRainRay(Math.floor(x + 0.5), Math.floor(z + 0.5)) ?? FALLBACK_SPAWN_HEIGHT
    const [minOffset, maxOffset] = CANOPY_OFFSET_RANGE

    positionToUpdate.set(
      x,
      canopyY + minOffset + Math.random() * (maxOffset - minOffset),
      z,
    )
  }

  /**
   * 與樹上那兩種葉子同一組秋色
   *
   * 粒子不吃光照，顏色直接就是看到的結果，
   * 所以要比方塊的色調再亮一階，才對得上被陽光照著的樹冠
   */
  const LEAF_AMBER = new Color4(0.85, 0.42, 0.08, 1)
  const LEAF_GOLD = new Color4(0.98, 0.82, 0.14, 1)
  const LEAF_AMBER_CLEAR = new Color4(LEAF_AMBER.r, LEAF_AMBER.g, LEAF_AMBER.b, 0)
  const LEAF_GOLD_CLEAR = new Color4(LEAF_GOLD.r, LEAF_GOLD.g, LEAF_GOLD.b, 0)

  /**
   * 一生的透明度：淡入、飄落、淡出
   *
   * 葉子沒有碰撞，落到地面只會繼續穿下去。
   * 讓它在最後三成的壽命慢慢淡掉，看起來就像落地後混進地上的落葉裡。
   * 出生那一下也要淡入，否則會在半空中憑空冒出來
   */
  particleSystem.addColorGradient(0, LEAF_AMBER_CLEAR, LEAF_GOLD_CLEAR)
  particleSystem.addColorGradient(0.12, LEAF_AMBER, LEAF_GOLD)
  particleSystem.addColorGradient(0.7, LEAF_AMBER, LEAF_GOLD)
  particleSystem.addColorGradient(1, LEAF_AMBER_CLEAR, LEAF_GOLD_CLEAR)

  particleSystem.minSize = 0.28
  particleSystem.maxSize = 0.5
  /** 從樹冠飄到地面得花上二十秒左右，落葉才不是一路直墜 */
  particleSystem.minLifeTime = 16
  particleSystem.maxLifeTime = 26
  particleSystem.emitRate = maxParticleCount / 40

  /**
   * 落法
   *
   * 葉子那麼輕，空氣阻力早就把它拖成等速下降了，
   * 所以重力只留一點點，讓它慢慢變快而不是自由落體。
   * 下降的速度主要由初速決定，橫向的初速給得比縱向還大，
   * 葉子才是斜斜地飄過去，而不是原地垂直落下
   */
  particleSystem.gravity = new Vector3(0, -0.05, 0)
  particleSystem.direction1 = new Vector3(-0.5, -0.5, -0.5)
  particleSystem.direction2 = new Vector3(0.5, -0.25, 0.5)
  particleSystem.minEmitPower = 1
  particleSystem.maxEmitPower = 1.6

  /**
   * 風
   *
   * 只有初速的話，每片葉子都是一條筆直的斜線。
   * 掛上一張會動的噪音貼圖當作亂流，每片葉子都各自被推來推去，
   * 路徑於是彎彎曲曲，看起來才像被風捲著走
   */
  const noiseTexture = new NoiseProceduralTexture('autumn-leaf-noise', 128, scene)
  /**
   * 亂流本身變化得慢一點
   *
   * 這個值調的是噪音場自己翻動的速度，不是葉子的速度。
   * 轉得太快，葉子等於每一瞬間都被推往不同方向，看起來是在抖；
   * 慢慢翻動才會變成一陣風推過去、再換另一陣的長弧線
   */
  noiseTexture.animationSpeedFactor = 0.45
  noiseTexture.brightness = 0.5
  noiseTexture.octaves = 4
  noiseTexture.persistence = 1.6
  particleSystem.noiseTexture = noiseTexture
  /** 橫向推得比縱向多，葉子才會飄開而不是上下彈跳 */
  particleSystem.noiseStrength = new Vector3(10, 3, 10)

  /** 邊飄邊翻面 */
  particleSystem.minAngularSpeed = -1.8
  particleSystem.maxAngularSpeed = 1.8
  particleSystem.minInitialRotation = 0
  particleSystem.maxInitialRotation = Math.PI * 2
  /**
   * 整套模擬跑得多快
   *
   * 位移與壽命都照這個速度推進，所以調小只是把同一條軌跡放慢，
   * 葉子飄過的路線不變，落地前的時間跟著拉長
   */
  particleSystem.updateSpeed = 0.009
  particleSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD

  const texture = particleSystem.particleTexture as Texture
  texture.hasAlpha = true

  /**
   * 先跑一段時間再顯示
   *
   * 不預熱的話，第一次望向林子會看到葉子整批從樹冠同時出發，
   * 像有人把一桶葉子倒下來
   */
  particleSystem.preWarmCycles = 150
  /** 預熱的步幅要夠大，一輪跑完才走得完一片葉子的一生 */
  particleSystem.preWarmStepOffset = 20
  particleSystem.start()

  return {
    dispose() {
      particleSystem.dispose()
      noiseTexture.dispose()
    },
  }
}
