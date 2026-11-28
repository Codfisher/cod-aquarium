import type { TwilightKind } from '../twilight'
import { Clamp, InverseLerp, Lerp, SmoothStep } from '@babylonjs/core'
import { createSeededRandom } from '../../../utils/noise'
import { TWILIGHT_BURN_STRENGTH } from '../twilight'

/**
 * 每天各自的天氣
 *
 * 一座禪庭的天空如果永遠是同一種雲，住久了就是一張背景。
 * 這裡讓每一個遊戲日各有一組溫度、濕度與風，雲量、雲的種類、被風撕扯的程度
 * 都從這三個數字推出來——參照 Minecraft 光影模組 Photon 的做法，
 * 只取「用三個天氣量決定整片雲」這個結構，數字與曲線是照這座庭園重配的。
 *
 * ── 這不是雨 ──
 *
 * 下雨是庭園裡的天氣區（use-weather）決定的，這裡只管「晴天的多種樣子」：
 * 濕的日子雲多一點、冷而靜的日子雲鋪成一層薄毯、熱而濕的日子雲頂往上長成塔。
 * 範圍刻意收窄：禪庭要的是「今天的天空和昨天不太一樣」，
 * 不是「今天一整天都是陰天」，所以最濕的一天雲量也有上限（見 MAX_COVERAGE_OFFSET）
 *
 * ── 日界線要連續 ──
 *
 * 每天的三個數字是用日序當種子抽出來的，但兩天之間不能硬切：
 * 午夜一過整片雲突然換樣子，比雲本身是什麼樣子更醒目。
 * 所以每一天的數字落在「那一天的正午」，兩個正午之間用平滑曲線內插，
 * 午夜剛好在兩天的中點，天氣是慢慢滑過去的
 */

/** 一天的天氣原始量，都落在零到一 */
export interface DailyWeather {
  temperature: number;
  humidity: number;
  wind: number;
}

/**
 * 從天氣量推出來的雲參數
 *
 * 都是相對於「典型的晴天」的偏移或倍率：典型晴天（見 TYPICAL_WEATHER）
 * 推出來的值是零偏移、一倍，所以現有的雲樣貌就是這組數字的原點
 */
export interface CloudWeather {
  /** 積雲覆蓋率要加多少（可為負），濕的日子雲多 */
  coverageOffset: number;
  /** 風速要乘多少 */
  windSpeedScale: number;
  /** 積雲往層雲偏多少，零到一：冷而靜的日子雲壓扁成一整層 */
  stratusBlend: number;
  /** 積雨雲塔的程度，零到一：熱而濕的日子雲頂長成塔 */
  congestusBlend: number;
  /** 被風撕碎的程度，零到一：風大的日子雲邊被啃得碎 */
  tornFactor: number;
  /** 高積雲的覆蓋率，零到一 */
  altocumulusCoverage: number;
  /** 卷雲覆蓋率要乘多少 */
  cirrusScale: number;
  /** 這一天夜光雲出不出現，零到一，不出現的日子是零 */
  noctilucentRarity: number;
}

/**
 * 典型的晴天
 *
 * 目前雲的樣貌（覆蓋率零點三八、風速一點五等）就是在這個天氣量上調出來的。
 * 下面每一條曲線都以它為原點，偏移與倍率在這一點剛好是零與一
 */
export const TYPICAL_WEATHER: DailyWeather = { temperature: 0.55, humidity: 0.5, wind: 0.38 }

/**
 * 最濕的一天雲量最多加多少
 *
 * 雲量多一成，內顯每幀就多花好幾毫秒（見 CLEAR_COVERAGE 那段），
 * 而且滿天雲的禪庭也不是想要的——所以這個上限比「物理上可以」小很多
 */
const MAX_COVERAGE_OFFSET = 0.09
const MIN_COVERAGE_OFFSET = -0.14

/** 日序到天氣原始量的快取：同一天每一幀都要查，每次重抽沒有意義 */
const DAY_CACHE_LIMIT = 8
const dayRandomCache = new Map<number, DayRandom>()

interface DayRandom extends DailyWeather {
  /** 夜光雲出不出現的籤，零到一，越大越有機會 */
  noctilucentDraw: number;
}

/** 從 a 到 b 的平滑階梯，a 大於 b 時是反過來的下降 */
function smoothRange(value: number, from: number, to: number): number {
  return SmoothStep(0, 1, InverseLerp(from, to, value))
}

/**
 * 抽出某一天的天氣
 *
 * 範圍不取滿零到一：溫度與風的兩端都留一截，極端值的日子在畫面上
 * 不是「更好看」而是「壞掉了」。濕度取兩次亂數的平均，
 * 讓中間值比兩端常見，大多數日子與典型晴天差不多，極端的日子才稀罕
 */
function drawDay(dayIndex: number): DayRandom {
  const cached = dayRandomCache.get(dayIndex)
  if (cached)
    return cached

  const random = createSeededRandom(`minespace-cloud-day-${dayIndex}`)
  const drawn: DayRandom = {
    temperature: Lerp(0.12, 0.95, random()),
    humidity: Lerp(0.12, 0.92, (random() + random()) * 0.5),
    wind: Lerp(0.08, 0.92, random()),
    noctilucentDraw: random(),
  }

  if (dayRandomCache.size >= DAY_CACHE_LIMIT) {
    const oldest = dayRandomCache.keys().next().value
    if (oldest !== undefined)
      dayRandomCache.delete(oldest)
  }
  dayRandomCache.set(dayIndex, drawn)
  return drawn
}

/**
 * 某一刻的天氣量
 *
 * dayPosition 是連續的：整數部分是第幾天，小數部分是那一天的時刻
 * （零為子夜、零點五為正午）。每一天的值落在正午，所以先把位置往前挪半天，
 * 取整是「前一個正午」、小數是走到下一個正午的進度
 */
export function sampleDailyWeather(dayPosition: number, out: DailyWeather): DailyWeather {
  const shifted = dayPosition - 0.5
  const previousIndex = Math.floor(shifted)
  const progress = SmoothStep(0, 1, shifted - previousIndex)
  const previous = drawDay(previousIndex)
  const next = drawDay(previousIndex + 1)

  out.temperature = Lerp(previous.temperature, next.temperature, progress)
  out.humidity = Lerp(previous.humidity, next.humidity, progress)
  out.wind = Lerp(previous.wind, next.wind, progress)
  return out
}

/**
 * 把天氣量換成雲的參數
 *
 * 每一條都有自己的道理，與 Photon 的對應關係是「結構照抄、數字重配」：
 *
 *   雲量：濕度越高雲越多，非常熱時略少（熱空氣裡的水氣反而不容易凝）。
 *         冷而靜的層雲再加一點，成一整層
 *   層雲：要「冷」和「靜」同時成立才出現。冷的空氣容易在低處成層，
 *         風大又會把層攪散成團，所以兩個條件相乘
 *   塔：要「熱」和「濕」同時成立：地面加熱得夠狠、水氣又夠，上升氣流才撐得起雲塔。
 *       層雲優先，已經壓成一層的天不會再長塔
 *   撕碎：風大才有，而且層雲不撕——一整層薄毯被風吹起來是皺，不是碎
 *   高積雲：濕、有風、不太熱。濕度是門檻，風讓它成排
 *   夜光雲：與天氣量無關，純粹是稀有的運氣，另外抽籤
 */
export function deriveCloudWeather(weather: DailyWeather, dayIndex: number, out: CloudWeather): CloudWeather {
  const { temperature, humidity, wind } = weather

  const stratusBlend = smoothRange(temperature, 0.45, 0.12)
    * smoothRange(wind, 0.5, 0.15)
    * 0.85
  const congestusBlend = smoothRange(temperature, 0.55, 0.9)
    * smoothRange(humidity, 0.45, 0.8)
    * Lerp(0.55, 1, smoothRange(wind, 0.1, 0.5))
    * (1 - stratusBlend)
  const hotDryness = smoothRange(temperature, 0.7, 1)

  out.coverageOffset = Clamp(
    (humidity - TYPICAL_WEATHER.humidity) * 0.3 - hotDryness * 0.03 + stratusBlend * 0.1 - congestusBlend * 0.02,
    MIN_COVERAGE_OFFSET,
    MAX_COVERAGE_OFFSET,
  )
  out.windSpeedScale = 0.45 + 1.45 * wind
  out.stratusBlend = stratusBlend
  out.congestusBlend = congestusBlend
  out.tornFactor = smoothRange(wind, 0.55, 0.95) * (1 - stratusBlend)
  out.altocumulusCoverage = smoothRange(humidity, 0.3, 0.75)
    * Lerp(0.45, 1, smoothRange(wind, 0.2, 0.7))
    * (1 - 0.5 * hotDryness)
  out.cirrusScale = Clamp(1.25 - 0.5 * humidity + 0.4 * (0.55 - temperature), 0.55, 1.4)
  const noctilucentDraw = drawDay(dayIndex).noctilucentDraw
  out.noctilucentRarity = smoothRange(noctilucentDraw, 0.8, 0.84) * Lerp(0.6, 1, smoothRange(noctilucentDraw, 0.8, 1))
  return out
}

/**
 * 這一刻算清晨還是黃昏的那一支籤
 *
 * 正午與子夜各換一次：那兩個時刻晨昏的光都是零，換籤看不出來
 */
export function getTwilightKind(dayPosition: number): TwilightKind {
  return dayPosition - Math.floor(dayPosition) < 0.5 ? 'dawn' : 'dusk'
}

/** 晨昏那兩支籤，都落在零到一 */
export interface TwilightDraw {
  /** 空氣的通透度：越大光越乾淨、顏色越濃 */
  clarity: number;
  /** 太陽那一側的天邊有沒有缺口讓光鑽進來：零是被遠方的雲牆整個擋住 */
  horizonGap: number;
}

const twilightDrawCache = new Map<string, TwilightDraw>()

/**
 * 抽出某一天清晨或黃昏的籤
 *
 * 用自己的種子字串，不碰 drawDay 那一串亂數：多抽一支籤，現有每一天的雲一朵都不會變。
 * 晨與昏各自獨立，早上燒過，傍晚照樣可能平淡
 */
export function drawTwilight(dayIndex: number, kind: TwilightKind): TwilightDraw {
  const key = `${dayIndex}-${kind}`
  const cached = twilightDrawCache.get(key)
  if (cached)
    return cached

  const random = createSeededRandom(`minespace-cloud-twilight-${key}`)
  const drawn: TwilightDraw = { clarity: random(), horizonGap: random() }

  if (twilightDrawCache.size >= DAY_CACHE_LIMIT * 2) {
    const oldest = twilightDrawCache.keys().next().value
    if (oldest !== undefined)
      twilightDrawCache.delete(oldest)
  }
  twilightDrawCache.set(key, drawn)
  return drawn
}

/**
 * 燃燒強度：這個清晨或黃昏的雲會燒得多兇，零到一
 *
 * 三件事相乘：
 *
 *   畫布：天上要有東西可燒。高處的雲（高積雲、卷雲）最要緊，它們在地面全暗之後還照得到；
 *         其次是積雲量落在中段，太少沒東西染、太多又把光擋死
 *   缺口：太陽那一側的天邊要有縫，光才鑽得進來。壓著一堵雲牆的傍晚不會燒
 *   通透：空氣乾淨，顏色才濃。這一項的範圍最寬，是每天差異的主要來源
 *
 * 層雲把整片天蓋成一層灰毯，直接扣；下雨時歸零（陰天罩本來也會把雲淡掉）。
 * 只改雲與天色的顏色，不碰雲量：雲多一成每幀多好幾毫秒，整片陰天也被否決過。
 *
 * 缺口用抽籤而不是真的去量太陽那一側的雲：雲的位置含風吹過的總距離，
 * 那是這一次開啟以來累積的，同一天每次打開都不同。抽籤的話同一天永遠是同一個強度，
 * 想再看一次某個傍晚，指定日序就看得到（見 reload-handoff 的 dayIndex）
 *
 * 常數是照四百天的分布調的（約三成平淡、四成一般、一成半好看、一成多整片燒，
 * 連續平淡不超過五天），改了要重跑 cloud-daily-weather.test.ts 看分布還在不在範圍裡
 */
export function deriveBurnIntensity(cloudWeather: CloudWeather, draw: TwilightDraw, rainRatio: number): number {
  const cirrusCanvas = smoothRange(cloudWeather.cirrusScale, 0.75, 1.3)
  const highCanvas = Math.max(cloudWeather.altocumulusCoverage, cirrusCanvas * 0.85)
  const cumulusCanvas = 1 - Math.min(1, Math.abs(cloudWeather.coverageOffset + 0.01) / 0.13)
  const canvas = 0.2 + 0.55 * highCanvas + 0.25 * cumulusCanvas

  const gap = Clamp((draw.horizonGap - 0.12) / 0.6, 0, 1)
  const clarity = Lerp(0.35, 1.2, SmoothStep(0, 1, draw.clarity))

  return Clamp(
    canvas
    * (0.5 + 0.5 * gap)
    * (1 - 0.8 * cloudWeather.stratusBlend)
    * clarity
    * 1.3
    * (1 - Clamp(rainRatio, 0, 1))
    * TWILIGHT_BURN_STRENGTH,
    0,
    1,
  )
}

/** 建一份空的，每幀重複使用，免得每幀配置物件 */
export function createDailyWeather(): DailyWeather {
  return { ...TYPICAL_WEATHER }
}

export function createCloudWeather(): CloudWeather {
  return {
    coverageOffset: 0,
    windSpeedScale: 1,
    stratusBlend: 0,
    congestusBlend: 0,
    tornFactor: 0,
    altocumulusCoverage: 0,
    cirrusScale: 1,
    noctilucentRarity: 0,
  }
}
