import type { Particle, Scene, UniversalCamera } from '@babylonjs/core'
import type { AmbientParticle } from '../../realm/realm-definition'
import type { AmbientPhaseWeight } from './ambient-activity'
import type { AmbientKindSpec } from './ambient-kind-spec'
import type { AmbientWorld } from './ambient-spot'
import { Color4, Lerp, ParticleSystem, RandomRange, Vector3 } from '@babylonjs/core'
import { WEATHER_RENDERING_GROUP } from '../../../composables/use-babylon-scene'
import { createParticleDimmer } from '../particle-tint'
import { measureAmbientCapacity } from './ambient-budget'
import { createAmbientEmitter } from './ambient-emitter'
import { AMBIENT_KIND_SPEC_MAP } from './ambient-kind-spec'
import { createAmbientTexture } from './ambient-shape'

/**
 * 一層環境粒子：一個粒子系統
 *
 * 發射點不跟著鏡頭走，而是每顆出生時才挑位置：空中的撒在鏡頭四周的方盒裡，
 * 其餘的（地面、水面、樹冠、花、燈…）先每隔一小段時間在鏡頭四周挑出十幾個「落腳點」，
 * 新的粒子從這些落腳點附近冒出來。顆粒生出後就留在世界座標上，人走過去自然被留在身後。
 * 什麼時候生、生在哪裡這一段在 ambient-emitter，與體素生物那一層（ambient-critter-layer）共用。
 *
 * 動法分兩層：粒子系統自己處理位移、壽命、顏色與拍翅的精靈圖；
 * 轉彎、順風、上浮下沉這些「飛行」的部分在系統更新之後，由系統的更新函式逐顆改速度。
 *
 * 所有位置與速度都用真實的秒與格：updateSpeed 設成一幀的長度（六十分之一），
 * 粒子系統內部是「速度 × updateSpeed × 動畫比例」，剛好等於真實的位移
 */

/** 黃金角：每顆粒子依編號取一個彼此錯開的相位 */
const GOLDEN_ANGLE = 2.399963

/** 吃光的粒子在全黑的夜裡留幾成亮度（落葉與雨絲留三成，這裡同一個尺度） */
const NIGHT_BRIGHTNESS_FLOOR = 0.3

/** 每一幀由管理端算好、交給每一層的天色與天氣 */
export interface AmbientFrame {
  camera: UniversalCamera;
  deltaSecond: number;
  phaseWeight: AmbientPhaseWeight;
  rainRatio: number;
  snowRatio: number;
  /** 洞穴、世界邊界與開關決定的整體可見程度，零到一 */
  visibleRatio: number;
  /** 天色的亮度，零是深夜、一是白天，吃光的粒子乘它 */
  brightness: number;
  /** 此刻的風（格／秒），已含場景的風速與陣風 */
  windX: number;
  windZ: number;
}

export interface AmbientLayer {
  update: (frame: AmbientFrame) => void;
  dispose: () => void;
}

export interface CreateAmbientLayerParams {
  scene: Scene;
  definition: AmbientParticle;
  /** 畫質等級的粒子倍率，乘在 count 上 */
  particleRatio: number;
  world: AmbientWorld;
}

/** 這層的顏色（含透明度）：場景覆寫 RGB，透明度一律用種類的 */
export function resolveAmbientColorPair(definition: AmbientParticle, spec: AmbientKindSpec): [Color4, Color4] {
  const [startR, startG, startB] = definition.color ?? spec.colorA
  const [endR, endG, endB] = definition.colorAlt
    ?? (spec.fade === 'ember' || !definition.color ? spec.colorB : definition.color)

  return [
    new Color4(startR, startG, startB, spec.colorA[3]),
    new Color4(endR, endG, endB, spec.colorB[3]),
  ]
}

/** 一生的明暗：用顏色梯度做，與螢火、落葉同一個寫法 */
function applyFadeGradient(system: ParticleSystem, spec: AmbientKindSpec, start: Color4, end: Color4): void {
  const scaleColor = (color: Color4, rgbScale: number, alphaScale: number) =>
    new Color4(color.r * rgbScale, color.g * rgbScale, color.b * rgbScale, color.a * alphaScale)

  switch (spec.fade) {
    case 'soft':
      system.addColorGradient(0, scaleColor(start, 1, 0), scaleColor(end, 1, 0))
      system.addColorGradient(0.15, start, end)
      system.addColorGradient(0.8, start, end)
      system.addColorGradient(1, scaleColor(start, 1, 0), scaleColor(end, 1, 0))
      break
    case 'blink':
      /** 加法混合，暗下去就是把顏色壓低 */
      system.addColorGradient(0, scaleColor(start, 0.45, 1), scaleColor(end, 0.45, 1))
      system.addColorGradient(0.25, start, end)
      system.addColorGradient(0.6, start, end)
      system.addColorGradient(1, scaleColor(start, 0.45, 1), scaleColor(end, 0.45, 1))
      break
    case 'twinkle':
      /** 兩次快閃：升、跌、再升、滅 */
      system.addColorGradient(0, scaleColor(start, 1, 0), scaleColor(end, 1, 0))
      system.addColorGradient(0.25, start, end)
      system.addColorGradient(0.45, scaleColor(start, 1, 0.3), scaleColor(end, 1, 0.3))
      system.addColorGradient(0.7, start, end)
      system.addColorGradient(1, scaleColor(start, 1, 0), scaleColor(end, 1, 0))
      break
    case 'ember': {
      /** 火星：亮橘 → 中間色 → 冷卻的暗紅 → 熄（加法混合，熄就是壓到近黑） */
      const middle = new Color4(
        Lerp(start.r, end.r, 0.5),
        Lerp(start.g, end.g, 0.5),
        Lerp(start.b, end.b, 0.5),
        1,
      )
      system.addColorGradient(0, start, start)
      system.addColorGradient(0.45, middle, middle)
      system.addColorGradient(1, scaleColor(end, 0.25, 1), scaleColor(end, 0.25, 1))
      break
    }
  }
}

export function createAmbientLayer({
  scene,
  definition,
  particleRatio,
  world,
}: CreateAmbientLayerParams): AmbientLayer {
  const spec = AMBIENT_KIND_SPEC_MAP[definition.kind]
  const count = Math.max(2, Math.round(definition.count * particleRatio))
  const meanLife = (spec.life[0] + spec.life[1]) / 2
  const sizeRange = definition.size ?? spec.size
  /** 什麼時候生、生在哪裡：與體素生物那一層共用同一套（見 ambient-emitter） */
  const emitter = createAmbientEmitter({ definition, spec, count, world })

  const system = new ParticleSystem(`ambient-${definition.kind}`, measureAmbientCapacity(count), scene)
  const ambientTexture = createAmbientTexture(scene, `ambient-${definition.kind}-texture`, spec.shape)
  system.particleTexture = ambientTexture.texture
  /** 發射點在這一層用不到（出生位置自己算），但粒子系統要有個 Vector3 才會被畫 */
  system.emitter = new Vector3()
  /** 與空氣顆粒、落葉同樣吃霧：世界邊界與霧濃的場景裡，遠方的粒子不能浮在白幕前面 */
  system.applyFog = true
  system.renderingGroupId = WEATHER_RENDERING_GROUP
  system.updateSpeed = 1 / 60
  system.blendMode = spec.blend === 'add' ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD
  system.emitRate = 0

  system.minSize = sizeRange[0]
  system.maxSize = sizeRange[1]
  system.minLifeTime = spec.life[0]
  system.maxLifeTime = spec.life[1]
  /** 初速在出生方向函式裡直接給格／秒，不再乘發射力道 */
  system.minEmitPower = 1
  system.maxEmitPower = 1
  system.gravity = new Vector3(0, spec.gravity ?? 0, 0)

  if (spec.billboard === 'stretched') {
    /** 沿著速度方向拉長：吹雪的線、滴下的水珠 */
    system.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED
    system.minScaleX = spec.stretch!.x[0]
    system.maxScaleX = spec.stretch!.x[1]
    system.minScaleY = spec.stretch!.y[0]
    system.maxScaleY = spec.stretch!.y[1]
  }

  if (spec.spin) {
    system.minAngularSpeed = spec.spin[0]
    system.maxAngularSpeed = spec.spin[1]
    system.minInitialRotation = 0
    system.maxInitialRotation = Math.PI * 2
  }
  else {
    system.minAngularSpeed = 0
    system.maxAngularSpeed = 0
    system.minInitialRotation = 0
    system.maxInitialRotation = 0
  }

  if (spec.flap) {
    /**
     * 拍翅：精靈圖兩格循環。每個週期數 = spriteCellChangeSpeed（一生走幾輪），
     * 所以每秒拍幾下 = 週期數 ÷ 壽命，乘上平均壽命就得到想要的頻率
     */
    system.isAnimationSheetEnabled = true
    system.spriteCellWidth = ambientTexture.cellWidth
    system.spriteCellHeight = ambientTexture.cellHeight
    system.startSpriteCellID = 0
    system.endSpriteCellID = ambientTexture.frameCount - 1
    system.spriteCellLoop = true
    system.spriteRandomStartCell = true
    system.spriteCellChangeSpeed = spec.flap.hz * meanLife
  }

  const [colorStart, colorEnd] = resolveAmbientColorPair(definition, spec)
  applyFadeGradient(system, spec, colorStart, colorEnd)

  if (spec.grow) {
    /** 尺寸梯度給的是絕對值，不是倍率，所以要自己乘上去 */
    system.addSizeGradient(0, sizeRange[0] * spec.grow[0], sizeRange[1] * spec.grow[0])
    system.addSizeGradient(1, sizeRange[0] * spec.grow[1], sizeRange[1] * spec.grow[1])
  }

  /** 這一幀的長度，每幀由 update 寫進來，飛行函式讀它；此刻的風在 emitter 上 */
  const state = { deltaSecond: 0.016 }

  /** 出生的方向：水平隨機（跟風的朝風向），垂直照種類給 */
  system.startDirectionFunction = (_worldMatrix, direction) => {
    const horizontal = RandomRange(spec.horizontalSpeed[0], spec.horizontalSpeed[1])
    const vertical = RandomRange(spec.verticalSpeed[0], spec.verticalSpeed[1])
    const hasWind = Math.hypot(emitter.windX, emitter.windZ) > 0.01
    const angle = spec.isWindAligned && hasWind
      ? Math.atan2(emitter.windZ, emitter.windX) + RandomRange(-0.3, 0.3)
      : Math.random() * Math.PI * 2

    direction.set(Math.cos(angle) * horizontal, vertical, Math.sin(angle) * horizontal)
  }

  system.startPositionFunction = (_worldMatrix, position) => {
    emitter.pickSpawnPoint()
    position.set(emitter.spawnPoint.x, emitter.spawnPoint.y, emitter.spawnPoint.z)
  }

  /**
   * 飛行：在系統更新之後逐顆調整速度
   *
   * 系統自己的更新可能回收死掉的粒子（和最後一顆交換位置），
   * 所以要等它跑完再走訪，與雨滴的落地判斷同一個順序
   */
  const hasMotion = !!spec.meander || spec.windFollow > 0 || !!spec.verticalTarget
  const defaultUpdate = system.updateFunction
  system.updateFunction = (particleList: Particle[]) => {
    defaultUpdate.call(system, particleList)
    if (!hasMotion)
      return

    const { deltaSecond } = state
    const { windX, windZ } = emitter
    const windRate = Math.min(1, spec.windFollow * deltaSecond * 1.5)
    const verticalRate = spec.verticalTarget ? Math.min(1, spec.verticalTarget.rate * deltaSecond) : 0
    const meander = spec.meander

    for (const particle of particleList) {
      const { direction, age } = particle
      const phase = particle.id * GOLDEN_ANGLE

      if (meander) {
        const wave = Math.sin(age * meander.frequency + phase)
        let turn = meander.isSharp ? wave * wave * wave : wave
        turn *= meander.turn
        if (meander.isCircling)
          turn = meander.turn * (particle.id % 2 === 0 ? 1 : -1) * (0.75 + 0.25 * wave)

        /** 水平速度繞 Y 軸轉過去，速率不變，路徑就是一條彎彎的線 */
        const angle = turn * deltaSecond
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const nextX = direction.x * cos - direction.z * sin
        direction.z = direction.x * sin + direction.z * cos
        direction.x = nextX

        if (meander.bob !== undefined)
          direction.y = Math.cos(age * (meander.bobFrequency ?? meander.frequency) + phase * 1.7) * meander.bob
      }

      if (windRate > 0) {
        direction.x += (windX - direction.x) * windRate
        direction.z += (windZ - direction.z) * windRate
      }

      if (verticalRate > 0)
        direction.y += (spec.verticalTarget!.speed - direction.y) * verticalRate
    }
  }

  system.start()

  const dimmer = createParticleDimmer([system])

  return {
    update(frame) {
      state.deltaSecond = frame.deltaSecond

      if (spec.isDimmedAtNight)
        dimmer.setBrightness(Lerp(NIGHT_BRIGHTNESS_FLOOR, 1, frame.brightness))

      /** 關著時是零：不再生新的，已經飄著的讓它自己走完 */
      system.emitRate = emitter.update(frame)
    },
    dispose() {
      /** 預設連貼圖一起釋放：每層的貼圖都是自己建的，沒有共用 */
      system.dispose()
    },
  }
}
