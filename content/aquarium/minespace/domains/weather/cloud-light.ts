import type { DayNightSample } from './day-night'
import type { TwilightKind, TwilightPalette } from './twilight'
import { Color3 } from '@babylonjs/core'
import { smoothRange } from './day-night'
import {
  createTwilightPalette,
  fillTwilightPalette,
  getGrazingHeight,
  getHueClipRatio,
  getMoonLightGate,
  getTwilightAmbientScale,
  getTwilightNightFade,
  getTwilightRatio,
  isCloudSunLit,
  sampleTwilightLight,
  smoothstep,
} from './twilight'

/**
 * 這一刻雲被什麼光照著
 *
 * 從日夜循環拆出來的純計算（原本寫在 use-day-night 的 applyToCloud 裡）：
 * 進來是這一刻的日夜取樣與當天的燃燒強度，出去是雲要的光色、天光與晨昏那幾個比例。
 * 拆出來是為了能在 Node 裡逐時刻列表、寫測試：正午與深夜必須與改動前一個數字都不差
 *
 * 不直接沿用平行光那一份，有三處不同。
 *
 * 一是換邊的時間點。平行光在太陽一碰到地平線就換成月亮，貼著地平線那一段還會整個關掉
 * （避免影子翻面）。但雲在一百多格高，太陽落到地平線下時它們還照得到，
 * 日落後天上那片燒紅的雲正是這樣來的。所以太陽要沉到很深（見 TWILIGHT_HANDOVER_HEIGHT）才換月亮。
 *
 * 二是顏色。白天沿用平行光的顏色、往天邊的暖光靠一些；太陽一貼近地平線，
 * 就換成晨昏自己的色階（金、橘、緋紅、玫瑰，見 twilight），亮度也不再跟著 cloudBrightness 一起掉——
 * 那條曲線是為「整片雲一起暗」調的，照著走的話最該紅的那十幾秒雲已經暗了一半。
 *
 * 三是天光。晨昏時雲的天光是天頂與中空的藕紫，不壓的話與紅光相加出來是鮭魚粉；
 * 燒得越兇的日子壓得越多，雲頂退成暗紫灰，紅才撐得住
 */

/** CPU 這一側的光色以哪個高度的雲為準（格）：積雲的中段 */
const REFERENCE_ALTITUDE = 160

/** 雲底開始被從下面照亮的太陽高度範圍：太陽在地平線上一點點就開始，沉下去一些就是滿的 */
const UNDERSIDE_START_HEIGHT = 0.05
const UNDERSIDE_FULL_HEIGHT = -0.08

export interface CloudLightInput {
  /** 當天的燃燒強度，零到一（見 cloud-daily-weather 的 deriveBurnIntensity） */
  burnIntensity: number;
  /** 現在算清晨還是黃昏，決定用哪一組色階 */
  kind: TwilightKind;
  /** 月光打幾折（月相），滿月是一 */
  moonLightRatio: number;
  /** 星球半徑（格），與體積雲的球殼同一個 */
  planetRadius: number;
}

export interface CloudLight {
  /** 光源是太陽還是月亮 */
  isSunLit: boolean;
  /** 光的顏色，已乘過這一刻的亮度。晨昏時是「頭頂積雲中段」那一點的顏色 */
  lightColor: Color3;
  ambientTop: Color3;
  ambientBottom: Color3;
  /** 晨昏的比例：著色器照它把上面的光色換成逐點算的色階。月光時為零 */
  twilightRatio: number;
  /** 高光保色壓縮的比例 */
  hueClipRatio: number;
  /** 雲底受光翻轉的比例：光從下面打上來時，變成雲底亮、雲頂暗 */
  undersideRatio: number;
  /** 這一刻的色階，交給著色器 */
  palette: TwilightPalette;
}

export function createCloudLight(): CloudLight {
  return {
    isSunLit: true,
    lightColor: new Color3(1, 1, 1),
    ambientTop: new Color3(),
    ambientBottom: new Color3(),
    twilightRatio: 0,
    hueClipRatio: 0,
    undersideRatio: 0,
    palette: createTwilightPalette(),
  }
}

const referenceColor: [number, number, number] = [0, 0, 0]

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

export function computeCloudLight(sample: DayNightSample, input: CloudLightInput, out: CloudLight): CloudLight {
  const { sunHeight } = sample
  const isSunLit = isCloudSunLit(sunHeight)
  out.isSunLit = isSunLit

  fillTwilightPalette(input.kind, input.burnIntensity, sunHeight, out.palette)

  if (isSunLit) {
    const glowRatio = 1 - smoothRange(sunHeight, 0, 0.3)
    const twilightRatio = getTwilightRatio(sunHeight)
    sampleTwilightLight(
      getGrazingHeight(REFERENCE_ALTITUDE, sunHeight, input.planetRadius),
      out.palette,
      referenceColor,
    )

    out.lightColor.set(
      lerp(lerp(sample.lightColor.r, sample.skyGlowColor.r, glowRatio) * sample.cloudBrightness, referenceColor[0], twilightRatio),
      lerp(lerp(sample.lightColor.g, sample.skyGlowColor.g, glowRatio) * sample.cloudBrightness, referenceColor[1], twilightRatio),
      lerp(lerp(sample.lightColor.b, sample.skyGlowColor.b, glowRatio) * sample.cloudBrightness, referenceColor[2], twilightRatio),
    )
    out.twilightRatio = twilightRatio
  }
  else {
    const brightness = sample.cloudBrightness * getMoonLightGate(sunHeight) * input.moonLightRatio
    out.lightColor.set(
      sample.lightColor.r * brightness,
      sample.lightColor.g * brightness,
      sample.lightColor.b * brightness,
    )
    out.twilightRatio = 0
  }

  out.hueClipRatio = getHueClipRatio(sunHeight)
  out.undersideRatio = smoothstep(UNDERSIDE_START_HEIGHT, UNDERSIDE_FULL_HEIGHT, sunHeight) * getTwilightNightFade(sunHeight)

  /**
   * 天光：雲頂吃天頂與中空的平均，雲底吃中空與地面反上來的光
   *
   * 白沙會把陽光反上去，晴天的雲底因此帶一點暖；
   * 天色本身已經跟著日夜暗下來了，不必再乘一次亮度。晨昏另外打折，見檔頭
   */
  const ambientScale = getTwilightAmbientScale(sunHeight, input.burnIntensity)
  out.ambientTop.set(
    (sample.skyZenithColor.r + sample.skyMidColor.r) * 0.5 * ambientScale,
    (sample.skyZenithColor.g + sample.skyMidColor.g) * 0.5 * ambientScale,
    (sample.skyZenithColor.b + sample.skyMidColor.b) * 0.5 * ambientScale,
  )
  const groundBounce = sample.cloudBrightness * 0.3
  out.ambientBottom.set(
    (sample.skyMidColor.r + sample.ambientGroundColor.r * groundBounce) * 0.5 * ambientScale,
    (sample.skyMidColor.g + sample.ambientGroundColor.g * groundBounce) * 0.5 * ambientScale,
    (sample.skyMidColor.b + sample.ambientGroundColor.b * groundBounce) * 0.5 * ambientScale,
  )

  return out
}
