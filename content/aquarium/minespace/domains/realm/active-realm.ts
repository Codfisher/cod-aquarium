import type { Color3 } from '@babylonjs/core'
import type { CloudWeather } from '../weather/volumetric-cloud/cloud-daily-weather'
import type { RealmAtmosphereProfile, RealmBoundary, RealmColorSetting, RealmDefinition, RealmId, RealmNumberSetting } from './realm-definition'
import { clamp } from 'remeda'
import { createSeededRandom } from '../../utils/noise'
import { HUB_REALM } from './realm-list'

/**
 * 目前所在的場景
 *
 * 與 volumetricCloudState 同一種寫法：放在模組上，換場景時由 render-runtime 寫，
 * 每幀要看場景旗標的那幾支（玩家控制器、雲、天氣、日夜）自己來讀。
 * 一條執行緒上只會有一份渲染執行期，所以模組層級的單例是安全的。
 *
 * 換場景時直接整份換掉，下一幀就是新場景的氣氛——設計上這一刻霧已經蓋滿畫面，不做漸變
 */
export const activeRealmState: {
  realmId: RealmId;
  isLooping: boolean;
  hasGardens: boolean;
  /** 地底的場景：天空整套不畫、洞穴程度恆為全滿、光照固定在深夜，見 RealmDefinition.isUnderground */
  isUnderground: boolean;
  atmosphere: RealmAtmosphereProfile;
  /** 不循環的場景才有：深水減速與推回岸邊，見 use-fps-controller 的 applyRealmBoundary */
  boundary: RealmBoundary | null;
} = {
  realmId: HUB_REALM.id,
  isLooping: HUB_REALM.isLooping,
  hasGardens: HUB_REALM.hasGardens,
  isUnderground: HUB_REALM.isUnderground ?? false,
  atmosphere: HUB_REALM.atmosphere,
  boundary: HUB_REALM.boundary ?? null,
}

export function activateRealm(realm: RealmDefinition): void {
  activeRealmState.realmId = realm.id
  activeRealmState.isLooping = realm.isLooping
  activeRealmState.hasGardens = realm.hasGardens
  activeRealmState.isUnderground = realm.isUnderground ?? false
  activeRealmState.atmosphere = realm.atmosphere
  activeRealmState.boundary = realm.boundary ?? null
}

/**
 * 場景有沒有改到霧與光
 *
 * 開始漫遊之前天氣系統還沒建，霧與光的倍率由一個輕量的觀察者先套上（見 use-weather 的 trackRealmBaseline）。
 * 大廳整份留空，那個觀察者什麼都不能做，否則開始面板後面的畫面會與原本差一點點
 */
export function hasRealmFogOrLight(): boolean {
  const { fog, light } = activeRealmState.atmosphere
  return !!(fog?.tint || fog?.start || fog?.end || light?.lightRatio || light?.ambientRatio || light?.specularRatio)
}

/**
 * 把一個數值欄位套在原本的值上
 *
 * 沒寫就原封不動回傳，連夾限也不做：大廳整份留空，
 * 算出來的每一個數字都必須與沒有場景系統時一模一樣。
 * 有寫才照 range 夾住，免得偏移把零到一的量推出範圍
 */
export function applyRealmNumber(
  base: number,
  setting: RealmNumberSetting | undefined,
  range?: { min?: number; max?: number },
): number {
  if (!setting)
    return base

  let result = base
  if ('value' in setting)
    result = setting.value
  else if ('offset' in setting)
    result = base + setting.offset
  else
    result = base * setting.scale

  return range ? clamp(result, range) : result
}

/**
 * 把一個顏色欄位套在原本的顏色上，寫進 out
 *
 * out 可以就是 base。沒寫就照抄
 */
export function applyRealmColor(base: Color3, setting: RealmColorSetting | undefined, out: Color3): Color3 {
  if (!setting) {
    out.copyFrom(base)
    return out
  }

  if ('value' in setting) {
    out.set(setting.value[0], setting.value[1], setting.value[2])
    return out
  }

  out.set(base.r * setting.scale[0], base.g * setting.scale[1], base.b * setting.scale[2])
  return out
}

const UNIT_RANGE = { min: 0, max: 1 }

/**
 * 把場景的雲設定疊在每日天氣推出來的雲參數上
 *
 * 由體積雲在 deriveCloudWeather 之後呼叫，就地改寫。
 * 雲底高度不在 CloudWeather 裡（它是雲層的幾何，不是天氣），見 getRealmCloudBaseHeight
 */
export function applyRealmCloudWeather(cloudWeather: CloudWeather): void {
  const setting = activeRealmState.atmosphere.cloud
  if (!setting)
    return

  cloudWeather.coverageOffset = applyRealmNumber(cloudWeather.coverageOffset, setting.coverageOffset, { min: -1, max: 1 })
  cloudWeather.stratusBlend = applyRealmNumber(cloudWeather.stratusBlend, setting.stratus, UNIT_RANGE)
  cloudWeather.congestusBlend = applyRealmNumber(cloudWeather.congestusBlend, setting.congestus, UNIT_RANGE)
  cloudWeather.altocumulusCoverage = applyRealmNumber(cloudWeather.altocumulusCoverage, setting.altocumulus, UNIT_RANGE)
  cloudWeather.windSpeedScale = applyRealmNumber(cloudWeather.windSpeedScale, setting.windSpeed, { min: 0 })
}

/**
 * 雲底高度
 *
 * 只能往下壓一點、往上抬一點：雲頂加上雲塔最多高出雲底一百六十格，
 * 而高積雲從三百格起，抬太高會撞進去；世界最高四十格，壓太低鏡頭會鑽進雲裡
 */
export function getRealmCloudBaseHeight(baseHeight: number): number {
  return applyRealmNumber(baseHeight, activeRealmState.atmosphere.cloud?.baseHeight, { min: 70, max: 135 })
}

/** 晨霧抽籤的快取：同一天每一幀都要查 */
const MIST_DAY_CACHE_LIMIT = 8
const mistDrawCache = new Map<number, number>()

function drawMistDay(dayIndex: number): number {
  const cached = mistDrawCache.get(dayIndex)
  if (cached !== undefined)
    return cached

  const draw = createSeededRandom(`minespace-ground-mist-${dayIndex}`)()
  if (mistDrawCache.size >= MIST_DAY_CACHE_LIMIT) {
    const oldest = mistDrawCache.keys().next().value
    if (oldest !== undefined)
      mistDrawCache.delete(oldest)
  }
  mistDrawCache.set(dayIndex, draw)
  return draw
}

/**
 * 晨霧要乘多少
 *
 * 機率是「這一天的清晨有沒有霧」，用日序抽一次籤，同一天整個清晨結果一樣；
 * 濃度直接乘上去。兩個都沒寫就是 1，乘了等於沒乘。
 *
 * dayPosition 是連續的日期（整數部分是第幾天），見 volumetricCloudState.dayPosition
 */
export function getRealmGroundMistRatio(dayPosition: number): number {
  const setting = activeRealmState.atmosphere.groundMist
  if (!setting?.chance && !setting?.density)
    return 1

  const chance = applyRealmNumber(1, setting.chance, UNIT_RANGE)
  const density = applyRealmNumber(1, setting.density, { min: 0 })
  return drawMistDay(Math.floor(dayPosition)) < chance ? density : 0
}
