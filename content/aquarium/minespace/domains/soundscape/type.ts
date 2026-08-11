import type { BiomeId } from '../world/biome'

/** 音源所屬的區域，洞穴與湖泊不是地表生態區，另外列出來 */
export type SoundZone = BiomeId | 'cave' | 'river' | 'pond'

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
