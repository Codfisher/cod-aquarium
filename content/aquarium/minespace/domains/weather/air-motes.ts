import type { Scene, UniversalCamera } from '@babylonjs/core'
import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Texture,
  Vector3,
} from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../composables/use-babylon-scene'
import { measureSection } from '../../composables/use-performance-probe'

/**
 * 懸浮物散布的半徑
 *
 * 只鋪在鏡頭周圍這一圈。再遠的顆粒在畫面上小到看不見，
 * 卻照樣要進每一幀的更新與排序
 */
const SPREAD_RADIUS = 11
/** 懸浮物相對於鏡頭的高度範圍，蹲著與站著都看得到 */
const SPREAD_BELOW = 2.5
const SPREAD_ABOVE = 4

/** 顆粒重新繞回鏡頭附近的間隔（秒），走路時不必每一幀重算 */
const RECENTER_INTERVAL = 0.25

/** 白天的花粉：偏金的暖色 */
const POLLEN_COLOR = new Color4(1, 0.94, 0.72, 0.5)
const POLLEN_COLOR_FADED = new Color4(0.94, 0.9, 0.78, 0.28)
/** 洞裡的塵：冷灰，沒有一點暖 */
const CAVE_COLOR = new Color4(0.72, 0.76, 0.84, 0.42)
const CAVE_COLOR_FADED = new Color4(0.6, 0.64, 0.72, 0.24)

/** 螢火的顏色，走相加混合，數字給得比一還高才亮得起來 */
const FIREFLY_COLOR = new Color4(0.78, 1, 0.5, 1)
const FIREFLY_COLOR_DIM = new Color4(0.4, 0.62, 0.26, 1)

/** 這兩種顆粒各自的最高發射率 */
const MOTE_EMIT_RATE = 26
const FIREFLY_EMIT_RATE = 9

/** 螢火只在夠暗的時候出來，這是牠們開始現身的白晝程度 */
const FIREFLY_DAY_THRESHOLD = 0.35

export interface AirMotes {
  /**
   * 每一幀更新
   *
   * dayRatio 為白晝的程度、caveRatio 為被地形包住的程度，
   * 兩者一起決定此刻空氣裡飄的是什麼。
   *
   * visibleRatio 是另一回事：它不管該飄什麼，只管此刻該不該看得見，
   * 貼近世界邊界時收到零。這一項必須自己一個參數，不能折進 dayRatio——
   * 螢火是拿 1 - dayRatio 反推的，把邊界折進去等於告訴牠們天黑了，
   * 大白天走到邊界反而會召出一群螢火
   */
  update: (
    camera: UniversalCamera,
    dayRatio: number,
    caveRatio: number,
    visibleRatio: number,
  ) => void;
  dispose: () => void;
}

export interface CreateAirMotesParams {
  scene: Scene;
  /** 浮塵與螢火各自的上限 */
  moteCount: number;
  fireflyCount: number;
}

/**
 * 一顆硬邊的方形顆粒
 *
 * 柔邊漸層做出來的是攝影機拍到的散景，那是寫實遊戲的語彙。
 * 這個世界裡連水滴與煙都是看得出邊界的方塊，浮塵沒有理由例外——
 * 一顆兩三格見方的白點，取樣用 NEAREST 保住硬邊
 */
function createMoteTexture(name: string, scene: Scene): DynamicTexture {
  const size = 4
  const texture = new DynamicTexture(
    name,
    { width: size, height: size },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  const context = texture.getContext() as CanvasRenderingContext2D
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, size, size)
  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.fillRect(1, 1, 2, 2)
  texture.update()
  texture.hasAlpha = true

  return texture
}

/**
 * 空氣裡的懸浮物
 *
 * 這個場景的空氣一直是空的：霧是一層數學，光束是一道後製，
 * 兩者之間什麼都沒有。人之所以「看得見」陽光，正是因為空氣裡有東西
 * 擋在光路上——沒有那些顆粒，光是不可見的。
 *
 * 做法是把發射器綁在鏡頭上，只在身邊十來格內撒顆粒。
 * 顆粒撒出去之後就留在世界座標上，人往前走，它們自然被留在身後，
 * 幾秒之後壽命到了再從新的位置生出來——於是走到哪裡身邊都有東西在飄，
 * 卻不會有「一團顆粒黏著鏡頭跑」那種假。
 *
 * 三種空氣共用同一組系統，只換顏色與數量：
 * 白天是被太陽照亮的花粉，夜裡換成幾點螢火，洞裡則是冷灰的塵
 */
export function createAirMotes({
  scene,
  moteCount,
  fireflyCount,
}: CreateAirMotesParams): AirMotes {
  const moteEmitter = new Vector3()
  const fireflyEmitter = new Vector3()

  const moteSystem = new ParticleSystem('air-mote', moteCount, scene)
  moteSystem.particleTexture = createMoteTexture('air-mote-texture', scene)
  moteSystem.emitter = moteEmitter
  /**
   * 吃霧
   *
   * 顆粒只散在身邊十來格內，平常那個距離連最濃的沼澤霧都還沒開始作用，
   * 這一項確實換不到任何看得出來的差別。
   *
   * 世界邊界那道白幕是例外：它半格外就起霧、六格外全白，
   * 顆粒整片都落在裡面。不吃霧的話，四周白成一片時
   * 這些顆粒依然清清楚楚地浮在白幕前面，跨過邊界就整批換了一組。
   *
   * 停止發射只管得到還沒生出來的那些，已經飄在空中的要等壽命走完，
   * 而那段時間人早就走到邊界了。只有霧管得到它們
   */
  moteSystem.applyFog = true
  moteSystem.renderingGroupId = WEATHER_RENDERING_GROUP
  moteSystem.minEmitBox = new Vector3(-SPREAD_RADIUS, -SPREAD_BELOW, -SPREAD_RADIUS)
  moteSystem.maxEmitBox = new Vector3(SPREAD_RADIUS, SPREAD_ABOVE, SPREAD_RADIUS)
  moteSystem.color1 = POLLEN_COLOR.clone()
  moteSystem.color2 = POLLEN_COLOR_FADED.clone()
  moteSystem.colorDead = new Color4(POLLEN_COLOR.r, POLLEN_COLOR.g, POLLEN_COLOR.b, 0)
  /**
   * 顆粒要小到接近一個像素
   *
   * 大一點就不是浮塵而是雪。這個尺寸在畫面上只佔幾個像素，
   * 看得見卻不搶戲——空氣感本來就該是察覺不到自己在看什麼
   */
  moteSystem.minSize = 0.035
  moteSystem.maxSize = 0.075
  moteSystem.minLifeTime = 6
  moteSystem.maxLifeTime = 13
  /**
   * 起手不發射，也不預熱
   *
   * 發射點還沒對齊鏡頭之前它停在世界原點，預熱等於在那個角落
   * 憑空堆出一團看不到的顆粒。等第一次 update 把發射點擺好，
   * 兩三秒內身邊自然就飄滿了
   */
  moteSystem.emitRate = 0
  /**
   * 幾乎沒有重力，只有一點點往上的浮力
   *
   * 灰塵在靜止的空氣裡是懸著的，不是落下的。
   * 讓它慢慢往上飄一點點，再配上左右的微幅擾動，
   * 那種「空氣本身在動」的感覺才出得來
   */
  moteSystem.gravity = new Vector3(0, 0.012, 0)
  moteSystem.direction1 = new Vector3(-0.06, 0.02, -0.06)
  moteSystem.direction2 = new Vector3(0.06, 0.09, 0.06)
  moteSystem.minEmitPower = 0.04
  moteSystem.maxEmitPower = 0.16
  moteSystem.minAngularSpeed = 0
  moteSystem.maxAngularSpeed = 0
  moteSystem.updateSpeed = 0.02
  moteSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD
  moteSystem.start()

  const fireflySystem = new ParticleSystem('air-firefly', fireflyCount, scene)
  fireflySystem.particleTexture = createMoteTexture('air-firefly-texture', scene)
  fireflySystem.emitter = fireflyEmitter
  /**
   * 同樣吃霧，理由與浮塵一致
   *
   * 螢火走相加混合，吃霧等於把加上去的那道光往霧色收。
   * 牠們只在夜裡出來，而夜裡的霧色是一片深藍——
   * 收過去就是暗下來，正是要的效果
   */
  fireflySystem.applyFog = true
  fireflySystem.renderingGroupId = WEATHER_RENDERING_GROUP
  /** 螢火貼著草叢飛，範圍收窄、也不往高處去 */
  fireflySystem.minEmitBox = new Vector3(-SPREAD_RADIUS * 0.8, -SPREAD_BELOW, -SPREAD_RADIUS * 0.8)
  fireflySystem.maxEmitBox = new Vector3(SPREAD_RADIUS * 0.8, 1.2, SPREAD_RADIUS * 0.8)
  /**
   * 一生的亮度：亮起、撐住、熄掉
   *
   * 螢火不是持續亮著的燈，牠是一明一滅的。
   * 用一整條壽命走完一次明滅，一群螢火各自的壽命又不一樣，
   * 整片看過去就是此起彼落地閃
   */
  fireflySystem.addColorGradient(0, FIREFLY_COLOR_DIM, FIREFLY_COLOR_DIM)
  fireflySystem.addColorGradient(0.25, FIREFLY_COLOR, FIREFLY_COLOR)
  fireflySystem.addColorGradient(0.6, FIREFLY_COLOR, FIREFLY_COLOR)
  fireflySystem.addColorGradient(1, FIREFLY_COLOR_DIM, FIREFLY_COLOR_DIM)
  fireflySystem.minSize = 0.06
  fireflySystem.maxSize = 0.11
  fireflySystem.minLifeTime = 3
  fireflySystem.maxLifeTime = 7
  fireflySystem.emitRate = 0
  fireflySystem.gravity = new Vector3(0, 0.02, 0)
  fireflySystem.direction1 = new Vector3(-0.35, -0.1, -0.35)
  fireflySystem.direction2 = new Vector3(0.35, 0.25, 0.35)
  fireflySystem.minEmitPower = 0.1
  fireflySystem.maxEmitPower = 0.45
  fireflySystem.updateSpeed = 0.02
  /**
   * 相加混合
   *
   * 螢火是自己在發光的東西，混合模式必須是相加而不是覆蓋。
   * 這也是它繞開材質那道亮度上限的方式：加上去的顏色不受任何 clamp，
   * 一點螢火在深夜的草間才真的會亮
   */
  fireflySystem.blendMode = ParticleSystem.BLENDMODE_ADD
  fireflySystem.start()

  let recenterElapsed = RECENTER_INTERVAL

  return {
    update(camera, dayRatio, caveRatio, visibleRatio) {
      measureSection('空氣顆粒', () => {
        const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

        /**
         * 發射點跟著鏡頭走，但不必每一幀跟
         *
         * 顆粒是撒在鏡頭周圍二十二格見方的盒子裡的，
         * 走路一秒也才五六格，四分之一秒對齊一次完全看不出落差
         */
        recenterElapsed += deltaTime
        if (recenterElapsed >= RECENTER_INTERVAL) {
          recenterElapsed = 0
          moteEmitter.copyFrom(camera.position)
          fireflyEmitter.copyFrom(camera.position)
        }

        /**
         * 洞裡換一種空氣
         *
         * 洞穴的顆粒是從岩壁落下的細塵，冷、灰、沒有生氣，
         * 與地表那片被太陽照亮的花粉是兩回事。
         * 顏色就地插值，不重建系統，連活著的顆粒都會跟著換色
         */
        Color4.LerpToRef(POLLEN_COLOR, CAVE_COLOR, caveRatio, moteSystem.color1)
        Color4.LerpToRef(POLLEN_COLOR_FADED, CAVE_COLOR_FADED, caveRatio, moteSystem.color2)

        /**
         * 白天才有花粉，夜裡收掉
         *
         * 浮塵之所以看得見，是因為有光照在它身上。
         * 夜裡沒有那道光，一群還在發亮的顆粒只會像浮在畫面上的雜訊。
         * 洞裡則相反：那裡永遠是暗的，但有燈火，塵照樣看得見
         */
        const litRatio = Math.max(dayRatio, caveRatio * 0.7)
        moteSystem.emitRate = MOTE_EMIT_RATE * litRatio * visibleRatio

        /**
         * 螢火只在地表的夜裡出來
         *
         * 洞裡沒有螢火——那裡沒有草。天一亮牠們也就散了
         */
        const nightRatio = Math.max(0, 1 - dayRatio / FIREFLY_DAY_THRESHOLD)
        fireflySystem.emitRate = FIREFLY_EMIT_RATE * nightRatio * (1 - caveRatio) * visibleRatio
      })
    },
    dispose() {
      moteSystem.dispose()
      fireflySystem.dispose()
    },
  }
}
