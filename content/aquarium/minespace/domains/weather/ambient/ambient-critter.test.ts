import type { AmbientParticle } from '../../realm/realm-definition'
import type { CritterFlightParam } from './ambient-critter-flight'
import type { AmbientKindSpec } from './ambient-kind-spec'
import type { AmbientFrame } from './ambient-layer'
import type { AmbientWorld } from './ambient-spot'
import { NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core'
import { describe, expect, it, vi } from 'vitest'
import { AMBIENT_PARTICLE_KIND_LIST } from '../../realm/realm-definition'
import { countVoxelFace, VOXEL_FACE_LIST } from '../../realm/realm-voxel-kit'
import { measureAmbientCapacity } from './ambient-budget'
import { createCritterFlock, measureCritterFade, measureHoverFactor, stepCritterFlock } from './ambient-critter-flight'
import { CRITTER_PART, CRITTER_SPECIES_MAP, CRITTER_TONE_COUNT, measureCritterSpan } from './ambient-critter-shape'
import { AMBIENT_KIND_SPEC_MAP } from './ambient-kind-spec'

/**
 * 體素生物（蜻蜓、蝴蝶、蛾）
 *
 * 形體與飛行是純計算，直接驗數字；畫的那一層拿 NullEngine 跑，畫不出畫面，
 * 只看建得起來、該出現時網格開著、沒有東西時整個停用、收掉之後不留網格與材質
 */

/** 真正的 use-babylon-scene 會把整個渲染環境一起拉進來，這裡只要那個常數 */
vi.mock('../../../composables/use-babylon-scene', () => ({ WEATHER_RENDERING_GROUP: 2 }))

const { createAmbientCritterLayer, CRITTER_SLOT_COUNT } = await import('./ambient-critter-layer')

const critterKindList = AMBIENT_PARTICLE_KIND_LIST.filter((kind) => AMBIENT_KIND_SPEC_MAP[kind].critter !== undefined)

describe('體素生物的形體', () => {
  it('種類表裡改成體素的就是蜻蜓、蝴蝶與蛾，三種都會拍翅', () => {
    expect([...critterKindList].sort()).toEqual(['butterfly', 'dragonfly', 'moth'])
    for (const kind of critterKindList)
      expect(AMBIENT_KIND_SPEC_MAP[kind].flap, kind).toBeDefined()
  })

  for (const [key, species] of Object.entries(CRITTER_SPECIES_MAP)) {
    describe(key, () => {
      it('每個方盒都有體積，部位與色調的編號都認得', () => {
        for (const box of species.boxList) {
          for (const axis of [0, 1, 2] as const)
            expect(box.max[axis], `${key} 的方盒`).toBeGreaterThan(box.min[axis])
          expect(Object.values(CRITTER_PART)).toContain(box.part)
          expect(box.tone).toBeGreaterThanOrEqual(0)
          expect(box.tone).toBeLessThan(CRITTER_TONE_COUNT)
          for (const faceIndex of box.faceIndexList ?? [])
            expect(faceIndex).toBeLessThan(VOXEL_FACE_LIST.length)
        }
        expect(species.toneRuleList).toHaveLength(CRITTER_TONE_COUNT)
      })

      it('身體在中線上左右對稱，翅膀左右成對、從翅根往外長', () => {
        const wingList = species.boxList.filter((box) => box.part !== CRITTER_PART.body)
        for (const box of species.boxList.filter((item) => item.part === CRITTER_PART.body)) {
          expect(box.side).toBe(0)
          expect(box.min[2]).toBeCloseTo(-box.max[2])
        }
        expect(wingList.length).toBeGreaterThanOrEqual(4)
        for (const wing of wingList.filter((box) => box.side === 1)) {
          expect(wing.min[2]).toBeGreaterThanOrEqual(0)
          const mirrored = wingList.find((box) => box.side === -1 && box.part === wing.part && box.tone === wing.tone
            && box.min.every((value, axis) => value === wing.min[axis]) && box.max.every((value, axis) => value === wing.max[axis]))
          expect(mirrored, `${key} 的翅膀少了另一邊`).toBeDefined()
        }
        expect(wingList.filter((box) => box.side === 1)).toHaveLength(wingList.length / 2)
        /** 前後翅都要有：拍翅時後翅晚一點跟上 */
        expect(wingList.some((box) => box.part === CRITTER_PART.foreWing)).toBe(true)
        expect(wingList.some((box) => box.part === CRITTER_PART.hindWing)).toBe(true)
      })

      it('span 與方盒攤開的大小一致，換成方盒後的大小是原本方片的一到一點五倍', () => {
        expect(measureCritterSpan(species)).toBeCloseTo(species.span, 5)
        expect(species.sizeScale).toBeGreaterThanOrEqual(1)
        expect(species.sizeScale).toBeLessThanOrEqual(1.5)
      })

      it('一隻不超過一百個三角形', () => {
        expect(countVoxelFace(species.boxList) * 2).toBeLessThanOrEqual(100)
      })
    })
  }

  it('一格體素在世界裡是幾百分之一格：近看分得出方塊，整隻仍然是小蟲', () => {
    for (const kind of critterKindList) {
      const spec = AMBIENT_KIND_SPEC_MAP[kind]
      const species = CRITTER_SPECIES_MAP[spec.critter!]
      const voxelSize = spec.size[1] * species.sizeScale / species.span
      expect(voxelSize, kind).toBeGreaterThan(0.02)
      expect(voxelSize, kind).toBeLessThan(0.08)
      expect(spec.size[1] * species.sizeScale, kind).toBeLessThan(0.5)
    }
  })
})

/** 固定順序的亂數，測試才每次一樣 */
function createSequenceRandom(): () => number {
  let state = 12345
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7FFFFFFF
    return state / 0x7FFFFFFF
  }
}

function createFlightParam(spec: AmbientKindSpec, overrides: Partial<CritterFlightParam> = {}): CritterFlightParam {
  return {
    spec,
    bank: { gain: 0.16, maxRadian: 0.6 },
    deltaSecond: 1 / 60,
    windX: 0,
    windZ: 0,
    emitRate: 0,
    placeCritter(positionList, offset) {
      positionList[offset] = 10
      positionList[offset + 1] = 5
      positionList[offset + 2] = 10
    },
    random: createSequenceRandom(),
    ...overrides,
  }
}

describe('體素生物的飛行', () => {
  const dragonflySpec = AMBIENT_KIND_SPEC_MAP.dragonfly

  it('照生成速度一隻一隻生，不滿一隻的份量留到下一幀', () => {
    const flock = createCritterFlock(40)
    const param = createFlightParam(dragonflySpec, { emitRate: 5 })
    for (let frame = 0; frame < 120; frame++)
      stepCritterFlock(flock, param)
    expect(flock.aliveCount).toBeGreaterThanOrEqual(9)
    expect(flock.aliveCount).toBeLessThanOrEqual(10)
    expect(new Set(flock.idList.slice(0, flock.aliveCount)).size).toBe(flock.aliveCount)
  })

  it('生得再快也不超過容量', () => {
    const flock = createCritterFlock(12)
    const param = createFlightParam(dragonflySpec, { emitRate: 1000 })
    for (let frame = 0; frame < 60; frame++)
      stepCritterFlock(flock, param)
    expect(flock.aliveCount).toBe(12)
  })

  it('不再生之後，活著的照壽命走完，一隻不剩；途中活著的永遠排在前面', () => {
    const flock = createCritterFlock(20)
    const param = createFlightParam(dragonflySpec, { emitRate: 30 })
    for (let frame = 0; frame < 40; frame++)
      stepCritterFlock(flock, param)
    expect(flock.aliveCount).toBe(20)

    param.emitRate = 0
    let previousCount = flock.aliveCount
    for (let frame = 0; frame < 60 * (dragonflySpec.life[1] + 1); frame++) {
      stepCritterFlock(flock, param)
      expect(flock.aliveCount).toBeLessThanOrEqual(previousCount)
      previousCount = flock.aliveCount
      for (let index = 0; index < flock.aliveCount; index++) {
        expect(flock.ageList[index]).toBeLessThan(flock.lifeList[index]!)
        expect(flock.lifeList[index]).toBeGreaterThanOrEqual(dragonflySpec.life[0])
        expect(flock.lifeList[index]).toBeLessThanOrEqual(dragonflySpec.life[1])
      }
    }
    expect(flock.aliveCount).toBe(0)
  })

  it('轉彎只改方向不改速率，頭跟著飛的方向走', () => {
    const flock = createCritterFlock(4)
    const spec: AmbientKindSpec = { ...dragonflySpec, meander: { turn: 4, frequency: 0.8, isSharp: true } }
    const param = createFlightParam(spec, { emitRate: 60 })
    stepCritterFlock(flock, param)
    param.emitRate = 0
    const speed = Math.hypot(flock.directionList[0]!, flock.directionList[2]!)
    for (let frame = 0; frame < 300; frame++)
      stepCritterFlock(flock, param)
    expect(Math.hypot(flock.directionList[0]!, flock.directionList[2]!)).toBeCloseTo(speed, 4)
    const flightAngle = Math.atan2(flock.directionList[2]!, flock.directionList[0]!)
    const difference = flock.headingList[0]! - flightAngle
    expect(Math.abs(difference - Math.round(difference / (Math.PI * 2)) * Math.PI * 2)).toBeLessThan(0.4)
    expect(Math.abs(flock.bankList[0]!)).toBeLessThanOrEqual(0.6)
  })

  it('幾乎沒在動的時候朝向不變，也不會算出非數', () => {
    const flock = createCritterFlock(4)
    const spec: AmbientKindSpec = { ...dragonflySpec, horizontalSpeed: [0, 0], verticalSpeed: [0, 0], meander: undefined }
    const param = createFlightParam(spec, { emitRate: 60 })
    stepCritterFlock(flock, param)
    param.emitRate = 0
    const heading = flock.headingList[0]!
    for (let frame = 0; frame < 120; frame++)
      stepCritterFlock(flock, param)
    expect(flock.headingList[0]).toBe(heading)
    expect(flock.bankList[0]).toBe(0)
    expect(Number.isFinite(flock.pitchList[0]!)).toBe(true)
    expect(flock.positionList[0]).toBe(10)
  })

  it('懸停：一輪開頭那一段水平速度收到零，其餘時間照常飛', () => {
    const hover = { period: 5, ratio: 0.3 }
    expect(measureHoverFactor(0.5, 0, hover)).toBe(0)
    expect(measureHoverFactor(1.2, 0, hover)).toBe(0)
    expect(measureHoverFactor(3, 0, hover)).toBe(1)
    /** 一輪的最後一小段先收速，接上下一輪的懸停才不會急煞 */
    expect(measureHoverFactor(4.95, 0, hover)).toBeLessThan(0.2)
    /** 每一隻的輪次依編號錯開 */
    expect(measureHoverFactor(0.5, 1, hover)).toBe(1)
  })

  it('蜻蜓有懸停：停著的時候水平不動、照樣上下起伏', () => {
    expect(dragonflySpec.meander?.hover).toBeDefined()
    const flock = createCritterFlock(2)
    const param = createFlightParam(dragonflySpec, { emitRate: 60 })
    stepCritterFlock(flock, param)
    param.emitRate = 0
    /** 編號零的那一隻一出生就在懸停的那一段裡 */
    const startX = flock.positionList[0]!
    const startZ = flock.positionList[2]!
    for (let frame = 0; frame < 30; frame++)
      stepCritterFlock(flock, param)
    expect(flock.positionList[0]).toBeCloseTo(startX, 5)
    expect(flock.positionList[2]).toBeCloseTo(startZ, 5)
    expect(Math.hypot(flock.directionList[0]!, flock.directionList[2]!)).toBeGreaterThan(1)
  })

  it('一生的明暗：頭尾是零，中間是一', () => {
    expect(measureCritterFade(0)).toBe(0)
    expect(measureCritterFade(1)).toBe(0)
    expect(measureCritterFade(0.5)).toBe(1)
    expect(measureCritterFade(0.075)).toBeCloseTo(0.5)
    expect(measureCritterFade(0.9)).toBeCloseTo(0.5)
  })
})

describe('體素生物那一層', () => {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const camera = new UniversalCamera('camera', new Vector3(50, 12, 50), scene)
  scene.activeCamera = camera
  expect(scene.defaultMaterial).toBeTruthy()

  /** 撒在空中的層用不到世界，給一個什麼都找不到的 */
  const world = {
    anchorIndex: { sampleNear: () => 0 },
    readSurfaceY: () => Number.NaN,
    readWaterY: () => -1,
  } as unknown as AmbientWorld

  function createFrame(overrides: Partial<AmbientFrame> = {}): AmbientFrame {
    return {
      camera,
      deltaSecond: 1 / 60,
      phaseWeight: { day: 1, night: 0, dawn: 0, dusk: 0 },
      rainRatio: 0,
      snowRatio: 0,
      visibleRatio: 1,
      brightness: 1,
      windX: 0.5,
      windZ: 0.2,
      ...overrides,
    }
  }

  for (const kind of critterKindList) {
    it(`${kind}：一個網格一份材質，白天長出來、下雨躲掉、收掉不留東西`, () => {
      const definition: AmbientParticle = {
        kind,
        count: 10,
        activity: { day: 1, night: 0 },
        spawn: { anchor: 'air', height: [0, 2] },
      }
      const baseMeshCount = scene.meshes.length
      const baseMaterialCount = scene.materials.length
      const baseTextureCount = scene.textures.length
      const baseGeometryCount = scene.geometries.length
      const baseParticleSystemCount = scene.particleSystems.length

      const layer = createAmbientCritterLayer({ scene, definition, particleRatio: 1, world })
      expect(scene.meshes.length).toBe(baseMeshCount + 1)
      expect(scene.materials.length).toBe(baseMaterialCount + 1)
      expect(scene.textures.length).toBe(baseTextureCount)
      expect(scene.particleSystems.length).toBe(baseParticleSystemCount)

      const mesh = scene.getMeshByName(`ambient-critter-${kind}`)!
      const species = CRITTER_SPECIES_MAP[AMBIENT_KIND_SPEC_MAP[kind].critter!]
      const capacity = measureAmbientCapacity(10)
      expect(capacity).toBeLessThanOrEqual(CRITTER_SLOT_COUNT)
      expect(mesh.getTotalIndices() / 3).toBe(countVoxelFace(species.boxList) * 2 * capacity)
      expect(mesh.isEnabled()).toBe(false)

      const flock = (mesh.metadata as { critterFlock: { aliveCount: number } }).critterFlock
      for (let frame = 0; frame < 60 * 20; frame++) {
        layer.update(createFrame())
        scene.render()
      }
      expect(flock.aliveCount).toBeGreaterThan(5)
      expect(flock.aliveCount).toBeLessThanOrEqual(capacity)
      expect(mesh.isEnabled()).toBe(true)

      for (let frame = 0; frame < 60 * 20; frame++)
        layer.update(createFrame({ rainRatio: 1 }))
      expect(flock.aliveCount).toBe(0)
      expect(mesh.isEnabled()).toBe(false)

      layer.dispose()
      expect(scene.meshes.length).toBe(baseMeshCount)
      expect(scene.materials.length).toBe(baseMaterialCount)
      expect(scene.geometries.length).toBe(baseGeometryCount)
    })
  }
})
