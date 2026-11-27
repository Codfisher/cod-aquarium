import type { AmbientActivity } from '../../realm/realm-definition'
import { smoothRange } from '../day-night'

/**
 * 環境粒子的日夜曲線
 *
 * 一天切成四段權重：白天、夜裡、清晨（天亮前後）、傍晚（天黑前後），四者相加恆為一。
 * 場景給每一段一個活躍程度（AmbientActivity），此刻的活躍程度就是權重的加權平均，
 * 天色轉換時兩段之間平順地交接，螢火不會「啪」地一下全部出現。
 *
 * 權重只看白晝的程度（dayRatio，由太陽高度算出）與時刻（分清晨與傍晚）：
 * 與空氣顆粒、晨霧用的是同一份天色，各種粒子的交接時機才對得起來
 */
export interface AmbientPhaseWeight {
  day: number;
  night: number;
  dawn: number;
  dusk: number;
}

export function createAmbientPhaseWeight(): AmbientPhaseWeight {
  return { day: 1, night: 0, dawn: 0, dusk: 0 }
}

/** 白晝程度低於這一段算全黑、高於另一段算全亮，中間是天色轉換 */
const NIGHT_FULL_UNTIL = 0.1
const NIGHT_GONE_AT = 0.45
const DAY_START_AT = 0.55
const DAY_FULL_AT = 0.9

/**
 * 依此刻的天色算出四段權重，就地寫進 out
 *
 * timeOfDay 為零到一，零點是子夜、〇點五是正午：正午以前的轉換是清晨，以後是傍晚
 */
export function measureAmbientPhaseWeight(
  dayRatio: number,
  timeOfDay: number,
  out: AmbientPhaseWeight,
): AmbientPhaseWeight {
  const night = 1 - smoothRange(dayRatio, NIGHT_FULL_UNTIL, NIGHT_GONE_AT)
  const day = smoothRange(dayRatio, DAY_START_AT, DAY_FULL_AT)
  const twilight = Math.max(0, 1 - night - day)
  const isMorning = timeOfDay < 0.5

  out.day = day
  out.night = night
  out.dawn = isMorning ? twilight : 0
  out.dusk = isMorning ? 0 : twilight
  return out
}

/** 某一段的活躍程度，沒寫的清晨與傍晚取白天與夜裡的平均 */
export function getAmbientActivityAt(activity: AmbientActivity, phase: keyof AmbientPhaseWeight): number {
  const middle = (activity.day + activity.night) / 2
  if (phase === 'dawn')
    return activity.dawn ?? middle
  if (phase === 'dusk')
    return activity.dusk ?? middle
  return activity[phase]
}

/** 此刻的活躍程度，零到一 */
export function measureAmbientActivity(activity: AmbientActivity, weight: AmbientPhaseWeight): number {
  return weight.day * activity.day
    + weight.night * activity.night
    + weight.dawn * getAmbientActivityAt(activity, 'dawn')
    + weight.dusk * getAmbientActivityAt(activity, 'dusk')
}
