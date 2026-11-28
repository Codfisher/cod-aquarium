import type { AtmosphereState } from '../weather/atmosphere'
import type { BlockLightSource } from '../world/light-source'
import { Color3, NullEngine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core'
import { describe, expect, it } from 'vitest'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { createAutumnGeese } from './autumn/autumn-geese'
import { createBlizzardLightPillars } from './blizzard/blizzard-light-pillars'
import { createCampfireComet } from './campfire/campfire-comet'
import { createCicadaCloudTower } from './cicada/cicada-cloud-tower'
import { createCoastSeaSparkle } from './coast/coast-sea-sparkle'
import { createForestFoxProcession } from './forest/forest-fox-procession'
import { createJigokuSkyGlow } from './jigoku/jigoku-sky-glow'
import { createLakeMoonPath } from './lake/lake-moon-path'
import { createMeadowMeteors } from './meadow/meadow-meteors'
import { createRainvaleSheetLightning } from './rainvale/rainvale-sheet-lightning'
import { WATERFALL_POINT } from './river/river-layout'
import { createWaterfallRainbow } from './river/waterfall-rainbow'
import { createRuinsRingedMoon } from './ruins/ruins-ringed-moon'
import { createSongbirdMurmuration } from './songbird/songbird-murmuration'
import { createSwampMoonHalo } from './swamp/swamp-moon-halo'
import { createVillageSkyLanterns } from './village/village-sky-lanterns'
import { createWheatfieldGalaxy } from './wheatfield/wheatfield-galaxy'

/**
 * 招牌景象的生命週期（拿 NullEngine 跑，不需要瀏覽器）
 *
 * 畫不出畫面，著色器也不會真的編譯，所以只看三件事：
 * 一、每一個都建得起來，各種時段與天氣餵進去跑幾幀不會丟例外；
 * 二、該出現的時候網格是開著的、不該出現的時候整個停用（停用就沒有那一次繪製）；
 * 三、收掉之後場景裡的網格、材質、貼圖與每幀觀察者都回到原本的數量（沒有洩漏）
 */

/** 幾種要餵的情境：太陽方向、天體露出多少、人在不在洞裡 */
type ConditionName = 'noon' | 'dusk' | 'night' | 'nightRain' | 'nightCave'

const CONDITION_MAP: Record<ConditionName, { sunDirection: Vector3; skyBodyFade: number; caveRatio: number }> = {
  /** 太陽在東南高空 */
  noon: { sunDirection: new Vector3(0.3, 0.9, 0.3).normalize(), skyBodyFade: 1, caveRatio: 0 },
  /** 太陽貼著地平線 */
  dusk: { sunDirection: new Vector3(0.9, 0.08, 0.4).normalize(), skyBodyFade: 1, caveRatio: 0 },
  /** 太陽在腳下，月亮（太陽的正對面）在半空 */
  night: { sunDirection: new Vector3(-0.3, -0.55, -0.5).normalize(), skyBodyFade: 1, caveRatio: 0 },
  nightRain: { sunDirection: new Vector3(-0.3, -0.55, -0.5).normalize(), skyBodyFade: 0, caveRatio: 0 },
  nightCave: { sunDirection: new Vector3(-0.3, -0.55, -0.5).normalize(), skyBodyFade: 1, caveRatio: 1 },
}

function createAtmosphere(): AtmosphereState {
  return {
    fogColor: new Color3(0.8, 0.85, 0.9),
    fogStart: 100,
    fogEnd: 220,
    lightRatio: 1,
    ambientRatio: 1,
    specularRatio: 1,
    flashRatio: 0,
    baseFogColor: new Color3(0.8, 0.85, 0.9),
    lightColor: new Color3(1, 0.95, 0.85),
    ambientSkyColor: new Color3(0.6, 0.7, 0.9),
    ambientGroundColor: new Color3(0.4, 0.4, 0.35),
    fillColor: new Color3(0, 0, 0),
    lightIntensity: 1.3,
    ambientIntensity: 0.8,
    cloudBrightness: 1,
    skyZenithColor: new Color3(0.3, 0.5, 0.9),
    skyMidColor: new Color3(0.5, 0.65, 0.9),
    skyGlowColor: new Color3(1, 0.8, 0.6),
    skyCounterColor: new Color3(0.7, 0.6, 0.8),
    skyGlowStrength: 0.12,
    sunDirection: new Vector3(0, 1, 0),
    caveRatio: 0,
    skyBodyFade: 1,
    edgeRatio: 0,
  }
}

interface SignatureCase {
  name: string;
  meshName: string;
  create: (param: { scene: Scene; worldState: Uint8Array; atmosphere: AtmosphereState; lightSourceList: BlockLightSource[] }) => { dispose: () => void };
  /** 各情境下網格該不該開著；沒列的情境只跑不驗（亮度剛好在門檻附近） */
  expected: Partial<Record<ConditionName, boolean>>;
  /** 三角形的上限，不給是六百；體素拼的實體（環月、雁、椋鳥、天燈）面多，各自給 */
  triangleLimit?: number;
}

/** 只在晴朗的夜裡出現（跟著星空同進同退） */
const CLEAR_NIGHT_ONLY = { noon: false, dusk: false, night: true, nightRain: false, nightCave: false }
/** 天黑就出現，不管下不下雨；洞裡收掉 */
const ANY_NIGHT = { noon: false, dusk: false, night: true, nightRain: true, nightCave: false }
/** 只在晴朗的晨昏出現 */
const TWILIGHT_ONLY = { noon: false, dusk: true, night: false, nightRain: false, nightCave: false }
/** 只要在露天就有，日夜雨晴都在 */
const ALWAYS_OUTDOOR = { noon: true, dusk: true, night: true, nightRain: true, nightCave: false }

const CASE_LIST: SignatureCase[] = [
  { name: '湖中島的月光路', meshName: 'lake-moon-path', create: createLakeMoonPath, expected: CLEAR_NIGHT_ONLY },
  { name: '海中沙島的藍眼淚', meshName: 'coast-sea-sparkle', create: createCoastSeaSparkle, expected: ANY_NIGHT },
  { name: '林海的狐火行列', meshName: 'forest-fox-procession', create: createForestFoxProcession, expected: ANY_NIGHT },
  { name: '金葉林的雁行', meshName: 'autumn-geese', create: createAutumnGeese, expected: TWILIGHT_ONLY, triangleLimit: 3200 },
  { name: '千蛙沼的月暈', meshName: 'swamp-moon-halo', create: createSwampMoonHalo, expected: CLEAR_NIGHT_ONLY },
  { name: '村落的天燈', meshName: 'village-sky-lanterns', create: createVillageSkyLanterns, expected: CLEAR_NIGHT_ONLY, triangleLimit: 1800 },
  { name: '溪谷的瀑布彩虹', meshName: 'river-waterfall-rainbow', create: createWaterfallRainbow, expected: { noon: true, night: false, nightRain: false, nightCave: false } },
  { name: '千頃麥浪的銀河', meshName: 'wheatfield-galaxy', create: createWheatfieldGalaxy, expected: CLEAR_NIGHT_ONLY },
  { name: '風露原的流星雨', meshName: 'meadow-meteors', create: createMeadowMeteors, expected: CLEAR_NIGHT_ONLY },
  { name: '拓荒原的彗星', meshName: 'campfire-comet', create: createCampfireComet, expected: CLEAR_NIGHT_ONLY },
  { name: '石殿遺址的環月', meshName: 'ruins-ringed-moon', create: createRuinsRingedMoon, expected: { noon: true, dusk: true, night: true, nightRain: false, nightCave: false }, triangleLimit: 4200 },
  { name: '湯煙谷的火映', meshName: 'jigoku-sky-glow', create: createJigokuSkyGlow, expected: ALWAYS_OUTDOOR },
  { name: '百囀林苑的椋鳥群舞', meshName: 'songbird-murmuration', create: createSongbirdMurmuration, expected: TWILIGHT_ONLY, triangleLimit: 5000 },
  { name: '蟬雨深林的積雨雲', meshName: 'cicada-cloud-tower', create: createCicadaCloudTower, expected: { noon: true, dusk: true, night: false, nightRain: false, nightCave: false } },
  { name: '聽雨林的片狀閃電', meshName: 'rainvale-sheet-lightning', create: createRainvaleSheetLightning, expected: ALWAYS_OUTDOOR },
  { name: '白矇雪原的光柱', meshName: 'blizzard-light-pillars', create: createBlizzardLightPillars, expected: ANY_NIGHT },
]

describe('招牌景象的生命週期', () => {
  const engine = new NullEngine()
  engine.getDeltaTime = () => 16
  const scene = new Scene(engine)
  /** 場景的預設材質是第一次有人讀才建的，先讀掉，免得算進第一個景象的帳 */
  expect(scene.defaultMaterial).toBeTruthy()
  /** 站在溪谷瀑布的下游、比每一座場景的水面都高：彩虹與月光路都要看鏡頭的位置 */
  const camera = new UniversalCamera('camera', new Vector3(WATERFALL_POINT.x + 30, 24, WATERFALL_POINT.z), scene)
  scene.activeCamera = camera

  const atmosphere = createAtmosphere()
  const worldState = new Uint8Array(0)
  const lightSourceList: BlockLightSource[] = [
    { x: 140, y: 12, z: 140, level: 1, color: [1, 0.8, 0.5], isFire: false, isAreaLight: false },
    { x: 150, y: 12, z: 132, level: 1, color: [1, 0.6, 0.3], isFire: true, isAreaLight: false },
    /** 岩漿那種面光源不該長出光柱 */
    { x: 120, y: 9, z: 120, level: 1, color: [1, 0.5, 0.2], isFire: true, isAreaLight: true },
  ]
  const { state: devToggle } = useDevToggles()

  function applyCondition(name: ConditionName): void {
    const condition = CONDITION_MAP[name]
    atmosphere.sunDirection.copyFrom(condition.sunDirection)
    atmosphere.skyBodyFade = condition.skyBodyFade
    atmosphere.caveRatio = condition.caveRatio
    atmosphere.edgeRatio = 0
  }

  /**
   * 還掛著的每幀觀察者有幾個
   *
   * Babylon 的 Observable.remove 只先標記、下一個 tick 才真的從陣列拿掉，
   * 所以數的是「沒被標記要拿掉」的那些
   */
  function countObserver(): number {
    return scene.onBeforeRenderObservable.observers.filter((observer) => !observer._willBeUnregistered).length
  }

  function step(frameCount: number): void {
    for (let index = 0; index < frameCount; index++) {
      scene.render()
    }
  }

  for (const signature of CASE_LIST) {
    it(`${signature.name}：建得起來、照時段與天氣開關、收掉不留東西`, () => {
      const baseMeshCount = scene.meshes.length
      const baseMaterialCount = scene.materials.length
      const baseTextureCount = scene.textures.length
      const baseObserverCount = countObserver()

      const decoration = signature.create({ scene, worldState, atmosphere, lightSourceList })
      expect(scene.meshes.length).toBe(baseMeshCount + 1)
      expect(scene.materials.length).toBe(baseMaterialCount + 1)
      expect(countObserver()).toBe(baseObserverCount + 1)
      const mesh = scene.getMeshByName(signature.meshName)!
      expect(mesh).toBeTruthy()
      /** 一個景象一個網格，三角形不超過各自的上限（方片類六百個） */
      expect(mesh.getTotalIndices() / 3).toBeLessThanOrEqual(signature.triangleLimit ?? 600)

      for (const conditionName of Object.keys(CONDITION_MAP) as ConditionName[]) {
        applyCondition(conditionName)
        step(3)
        const expected = signature.expected[conditionName]
        if (expected !== undefined) {
          expect(mesh.isEnabled(), `${signature.name} 在 ${conditionName}`).toBe(expected)
        }
      }

      /** 貼近世界邊界或換場景的霧幕裡，全部都要收 */
      applyCondition('night')
      atmosphere.edgeRatio = 1
      step(2)
      expect(mesh.isEnabled()).toBe(false)
      applyCondition('noon')
      atmosphere.edgeRatio = 1
      step(2)
      expect(mesh.isEnabled()).toBe(false)

      /** 除錯面板把招牌景象關掉，任何時段都不畫 */
      devToggle.realmSignature = false
      for (const conditionName of Object.keys(CONDITION_MAP) as ConditionName[]) {
        applyCondition(conditionName)
        step(1)
        expect(mesh.isEnabled()).toBe(false)
      }
      devToggle.realmSignature = true

      decoration.dispose()
      expect(scene.meshes.length).toBe(baseMeshCount)
      expect(scene.materials.length).toBe(baseMaterialCount)
      expect(scene.textures.length).toBe(baseTextureCount)
      expect(countObserver()).toBe(baseObserverCount)
      /** 收掉之後再跑幾幀，不會有殘留的觀察者去碰已經釋放的網格 */
      step(2)
    })
  }

  it('反覆建了又收二十輪，場景裡的東西不累積', () => {
    const baseMeshCount = scene.meshes.length
    const baseMaterialCount = scene.materials.length
    const baseObserverCount = countObserver()
    const baseGeometryCount = scene.geometries.length
    for (let round = 0; round < 20; round++) {
      for (const signature of CASE_LIST) {
        const decoration = signature.create({ scene, worldState, atmosphere, lightSourceList })
        applyCondition(round % 2 === 0 ? 'night' : 'noon')
        step(1)
        decoration.dispose()
      }
    }
    expect(scene.meshes.length).toBe(baseMeshCount)
    expect(scene.materials.length).toBe(baseMaterialCount)
    expect(scene.geometries.length).toBe(baseGeometryCount)
    expect(countObserver()).toBe(baseObserverCount)
  })

  it('白矇雪原沒有燈火時什麼都不建', () => {
    const baseMeshCount = scene.meshes.length
    const decoration = createBlizzardLightPillars({ scene, worldState, atmosphere, lightSourceList: [] })
    expect(scene.meshes.length).toBe(baseMeshCount)
    decoration.dispose()
  })
})
