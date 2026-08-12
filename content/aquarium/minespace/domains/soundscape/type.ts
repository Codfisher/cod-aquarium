import type { GardenId } from '../garden/garden-layout'

/**
 * 音源所屬的區域
 *
 * 一座箱庭就是一個區域。走在箱庭之間的白沙上時不屬於任何一個，
 * 那是刻意留的空白：整趟漫遊的節奏就是「有聲—無聲—有聲」
 */
export type SoundZone = GardenId

/** 播放模式 */
export type SoundPlayMode =
  /** 無縫循環，適合風、水、火這類持續的環境音 */
  | { type: 'loop' }
  /** 每隔一段隨機時間播一次，適合鳥叫、蛙鳴這類點綴音 */
  | { type: 'interval'; rangeSecond: [number, number] }

export interface LocalizedText {
  'zh-hant': string;
  'en': string;
}

export interface SoundEmitterDefinition {
  id: string;
  /** 音檔名稱（不含資料夾與副檔名） */
  sound: string;
  title: LocalizedText;
  zone: SoundZone;
  /** 水平座標 */
  x: number;
  z: number;
  /** 指定高度，未指定時自動貼齊地面 */
  y?: number;
  /** 貼齊地面時額外抬高的高度 */
  heightOffset?: number;
  mode: SoundPlayMode;
  /** 音源基礎音量 0 ~ 1 */
  volume: number;
  /** 開始衰減的距離，此距離內為滿音量 */
  minDistance: number;
  /** 完全聽不到的距離 */
  maxDistance: number;
  /** 下雨時是否安靜下來，鳥與蟲都會躲雨 */
  silentInRain?: boolean;
  /**
   * 只在白天或只在夜裡出現，未指定則整天都在
   *
   * 這是同一座箱庭在一天之內換一副面孔的辦法：
   * 蟲聲叢白天是蟬、夜裡是蟋蟀；市井坊的人聲入夜就散了，只剩灶上的火。
   * 音量的交叉淡入淡出跟著日出日落走，不是到點切換
   */
  activeAt?: 'day' | 'night';
}

/** 天氣狀態 */
export type Weather = 'clear' | 'rain'

/** 正在發聲的音源狀態，供 HUD 顯示 */
export interface AudibleSound {
  id: string;
  title: LocalizedText;
  zone: SoundZone;
  /** 依距離估算的響度 0 ~ 1 */
  loudness: number;
  /** 與玩家的距離 */
  distance: number;
}
