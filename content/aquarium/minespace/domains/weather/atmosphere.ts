import { Color3 } from '@babylonjs/core'
import { SKY_COLOR } from '../../composables/use-babylon-scene'

/**
 * 地表大氣狀態
 *
 * 由天氣系統寫入、漫遊控制器讀取後套用到場景。
 * 兩邊都直接改 scene 的話，洞穴變暗與下雨變暗會互相蓋掉。
 */
export interface AtmosphereState {
  /** 地表霧氣顏色 */
  fogColor: Color3;
  /** 霧氣起點距離 */
  fogStart: number;
  /** 霧氣終點距離 */
  fogEnd: number;
  /** 光線強度倍率，陰天會壓低 */
  lightRatio: number;
  /** 閃電補光，0 ~ 1 */
  flashRatio: number;
}

/** 晴天的大氣參數 */
export const CLEAR_ATMOSPHERE = {
  fogColor: SKY_COLOR,
  fogStart: 60,
  fogEnd: 280,
  lightRatio: 1,
} as const

/**
 * 沼澤的大氣參數
 *
 * 不是陰天，光線照樣亮，只是空氣裡浮著一層帶綠的濕氣。
 * 能見度收到只剩二十幾格，走進去只看得到眼前那幾棵枯木，
 * 岸邊的東西全埋在白霧裡
 */
export const SWAMP_ATMOSPHERE = {
  fogColor: new Color3(0.68, 0.73, 0.66),
  fogStart: 2,
  fogEnd: 28,
  lightRatio: 0.8,
} as const

/** 雨天的大氣參數 */
export const RAIN_ATMOSPHERE = {
  fogColor: new Color3(0.5, 0.54, 0.6),
  fogStart: 8,
  fogEnd: 80,
  lightRatio: 0.5,
} as const

export function createAtmosphereState(): AtmosphereState {
  return {
    fogColor: CLEAR_ATMOSPHERE.fogColor.clone(),
    fogStart: CLEAR_ATMOSPHERE.fogStart,
    fogEnd: CLEAR_ATMOSPHERE.fogEnd,
    lightRatio: CLEAR_ATMOSPHERE.lightRatio,
    flashRatio: 0,
  }
}
