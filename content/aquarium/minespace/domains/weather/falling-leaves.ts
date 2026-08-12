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
import { getGarden } from '../garden/garden-layout'
import { createParticleDimmer } from './particle-tint'

/** 金葉苑，落葉只飄在這一座木座上 */
const AUTUMN_GARDEN = getGarden('autumn')
/** 落葉飄散的半徑，比木座小一點，葉子才不會飄到外面的白沙上 */
const LEAF_RADIUS = AUTUMN_GARDEN.halfSize - 2
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
  /** 跟著日夜調亮度，1 為大白天 */
  setBrightness: (ratio: number) => void;
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
  /**
   * 葉子也要吃霧
   *
   * Babylon 的粒子預設不套用場景霧氣。少了這一行，遠處的葉子會維持
   * 飽滿的金黃浮在一片白霧前面，像貼在螢幕上的貼紙——
   * 整個場景靠霧把遠方藏起來，粒子是唯一的漏網之魚
   */
  particleSystem.applyFog = true
  particleSystem.emitter = new Vector3(AUTUMN_GARDEN.center.x, 0, AUTUMN_GARDEN.center.z)
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
    const x = AUTUMN_GARDEN.center.x + Math.cos(angle) * radius
    const z = AUTUMN_GARDEN.center.z + Math.sin(angle) * radius
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
  /**
   * 一片葉子活多久
   *
   * 這個值要跟著下墜速度一起調：飄得快、壽命就得短，
   * 否則葉子早就落到地面以下，還在繼續往下飄
   */
  particleSystem.minLifeTime = 13
  particleSystem.maxLifeTime = 20
  particleSystem.emitRate = maxParticleCount / 44

  /**
   * 落法
   *
   * 初速只給一點點，葉子是從枝頭鬆脫的，不是被彈出去的；
   * 重力也壓得很小，剩下的交給下面的速度上限
   */
  particleSystem.gravity = new Vector3(0, -0.5, 0)
  particleSystem.direction1 = new Vector3(-0.25, -0.3, -0.25)
  particleSystem.direction2 = new Vector3(0.25, -0.15, 0.25)
  particleSystem.minEmitPower = 0.4
  particleSystem.maxEmitPower = 0.8

  /**
   * 速度上限：調整落葉快慢的主要旋鈕
   *
   * 重力與亂流都是往速度上累加的，不設限的話葉子只會越飄越快。
   * 速度一超過上限就打對折，於是很快就穩定在上限附近，
   * 之後既不加速也不停下來——那正是空氣阻力下的等速下墜。
   * 兩端給同一個值代表整段壽命都適用。
   *
   * 想再快就把這個數字調大、想更慢就調小；
   * 只影響落下的速度，橫向飄動與翻面的節奏不變
   */
  particleSystem.addLimitVelocityGradient(0, 3)
  particleSystem.addLimitVelocityGradient(1, 3)
  /**
   * 阻尼放鬆一點
   *
   * 這個值是超過速度上限時被拉回來的力道。拉得太緊，
   * 亂流每次把葉子推出去都立刻被壓平，擺盪的幅度出不來，
   * 葉子只會直直往下掉
   */
  particleSystem.limitVelocityDamping = 0.35

  /**
   * 阻力：整體再放慢一成
   *
   * Babylon 的阻力扣的是「這一幀移動多少」，不是速度本身，
   * 所以它不會讓葉子停下來，效果單純是把移動整個放慢，
   * 但壽命照原速走完，因此葉子飄過的距離也跟著縮短
   */
  particleSystem.addDragGradient(0, 0.1)
  particleSystem.addDragGradient(1, 0.1)

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
  noiseTexture.animationSpeedFactor = 0.35
  noiseTexture.brightness = 0.5
  noiseTexture.octaves = 4
  noiseTexture.persistence = 1.6
  particleSystem.noiseTexture = noiseTexture
  /**
   * 橫向推得比縱向多，葉子才會飄開而不是上下彈跳
   *
   * 有了阻力之後，這股推力不會一直累積，而是被拉回來，
   * 於是葉子是左右盪過去又盪回來，不是被吹著一路衝
   */
  /**
   * 橫向推力給大一點，這是「翻轉看得出來」的關鍵
   *
   * 關掉廣告板之後，葉片的朝向是由它自己的行進方向決定的。
   * 若下墜速度遠大於橫向速度，方向就永遠指著地面，葉片一直維持同一個姿態，
   * 只會繞著垂直軸打轉——看起來是閃爍，不是翻滾。
   * 把橫向推力拉到與下墜速度同一個量級，方向才會左右大幅擺盪，
   * 葉面跟著一下攤開、一下側過去，那才是落葉翻著飄下來的樣子
   */
  particleSystem.noiseStrength = new Vector3(6, 2, 6)

  /**
   * 翻轉的節奏
   *
   * 每片葉子一邊落一邊翻面，正反兩面的明暗交替出現，
   * 才看得出它是一片薄薄的東西而不是一顆色點。
   *
   * 但翻轉的速度不能是固定的——那會變成一個等速轉動的機械零件。
   * 真正的落葉是有節奏的：攤平滑翔一段、忽然失速猛翻幾圈、再攤開、再翻。
   * 這裡沿著壽命鋪一條起伏的曲線，快慢交替出現；
   * 每一段又給正負兩端，同一時刻不同葉子的轉向與快慢都不一樣，
   * 甚至會在半途反轉——那正是葉子吃到一陣風、翻回去的樣子。
   *
   * 一旦用了梯度，min/maxAngularSpeed 就會被忽略，所以那兩個不用再設。
   * 想整體調快調慢，把下面每一段的數字等比放大縮小即可
   */
  const angularRhythmList: [number, number][] = [
    /** 剛從枝頭鬆脫，帶著各自的初速 */
    [0, 6],
    /** 攤平滑翔，幾乎不轉 */
    [0.18, 1],
    /** 失速，猛翻幾圈 */
    [0.34, 8],
    [0.52, 2],
    [0.71, 7],
    /** 快落地時慢下來 */
    [0.88, 1.5],
    [1, 5],
  ]
  for (const [life, speed] of angularRhythmList) {
    particleSystem.addAngularSpeedGradient(life, -speed, speed)
  }

  particleSystem.minInitialRotation = 0
  particleSystem.maxInitialRotation = Math.PI * 2
  /**
   * 立體地翻，不是平面地轉
   *
   * 粒子預設是廣告板：永遠正面朝著鏡頭，angularSpeed 只能讓它在畫面上打轉，
   * 看起來像一枚在原地旋轉的貼紙。
   * 關掉廣告板之後，葉片會依自己的行進方向立在空間裡，
   * 一邊被風推著改變方向、一邊繞著自己的軸翻面——
   * 於是有時看到整片葉面、有時只看到側面那一條線，那才是葉子在飄
   */
  particleSystem.isBillboardBased = false
  /**
   * 整套模擬跑得多快：調整快慢的第二個旋鈕
   *
   * 位移與壽命都照這個速度推進，所以調小是把同一條軌跡整個放慢，
   * 葉子飄過的路線不變，落地前的時間跟著拉長。
   * 與上面的速度上限差別在於：那個只管往下掉，這個連橫向飄動與翻面一起加速
   */
  particleSystem.updateSpeed = 0.011
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

  const dimmer = createParticleDimmer([particleSystem])

  return {
    setBrightness: dimmer.setBrightness,
    dispose() {
      particleSystem.dispose()
      noiseTexture.dispose()
    },
  }
}
