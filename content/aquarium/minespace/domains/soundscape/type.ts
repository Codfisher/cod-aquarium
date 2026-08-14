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
  /**
   * 自己不響，等外面來觸發
   *
   * 給那種「必須跟著別的東西一起發生」的聲音用。
   * 目前只有聽雨亭的雷：閃光先到、聲音隔一段才來，
   * 兩者若各走各的計時器就對不起來，看起來會像雷聲亂響
   */
  | { type: 'trigger' }

/**
 * 音源怎麼移動
 *
 * 大部分的聲音是釘死在某個點上的——瀑布、灶火、簷下的滴水都不會走。
 * 但會叫的東西幾乎都會動：海鷗在岸邊盤旋、蜜蜂繞著蜂箱打轉、
 * 羊群在牧地裡慢慢挪。釘死之後那些聲音就成了立在原地的音箱，
 * 站著不動聽久了會發現方位一動也不動，整片音景因此顯得是假的。
 *
 * 移動的軌跡刻意做得慢：這是一個讓人停下來聽的世界，
 * 聲音要「飄過去」而不是「咻一聲飛過」
 */
export type SoundMotion =
  /**
   * 繞著原點盤旋
   *
   * 給那些真的在畫圈的東西：盤旋的海鷗、繞著蜂箱的蜜蜂。
   * 軌跡規律，聽得出它正在你頭上轉圈
   */
  | {
    type: 'orbit';
    /** 圈子多大（格） */
    radius: number;
    /** 繞一圈幾秒 */
    periodSecond: number;
    /** 上下起伏的幅度（格），不給就維持同一個高度 */
    riseHeight?: number;
  }
  /**
   * 漫無目的地飄
   *
   * 兩個週期互質的正弦疊出來的利薩茹軌跡：路徑永遠不重複，
   * 聽起來像一隻鳥在林子裡換位置，而不是照著跑道繞圈。
   * 樹梢的鳴禽、牧地上的羊、草上的蟲都用這個
   */
  | {
    type: 'wander';
    /**
     * 每個軸各自擺動多少（格）
     *
     * 注意這不是離原點的最遠距離：兩個軸同時走到底時，
     * 對角線會拉到大約一點四倍。要它待在某個範圍裡的話，
     * 這個值得先除以一點四
     */
    radius: number;
    /** 大致多久走完一趟 */
    periodSecond: number;
    riseHeight?: number;
  }

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
  /**
   * 會不會移動，不給就釘在原地
   *
   * x、z、y 在這種情況下是「繞著哪裡動」的錨點，而不是實際位置
   */
  motion?: SoundMotion;
}

/** 天氣狀態 */
export type Weather = 'clear' | 'rain' | 'snow'

/** 正在發聲的音源狀態，供 HUD 顯示 */
export interface AudibleSound {
  id: string;
  title: LocalizedText;
  zone: SoundZone;
  /**
   * 依距離估算的響度 0 ~ 1
   *
   * 這是「沒有被單獨關掉的話會有多響」。被關掉的音源照樣算這個值，
   * 清單上那一條才還看得出它就在附近——不然關掉之後它會從清單消失，
   * 也就再也沒有地方可以把它打開
   */
  loudness: number;
  /** 與玩家的距離 */
  distance: number;
  /** 是不是被單獨關掉了 */
  isMuted: boolean;
}
