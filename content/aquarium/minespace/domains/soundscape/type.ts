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
   * 兩者若各走各的計時器就對不起來，看起來會像雷聲亂響。
   *
   * 觸發時可以順便指定這一次從哪裡響（世界座標）。渲染端的程式要叫一顆的話，
   * 用 sound-trigger 的 requestSoundTrigger，不必自己接訊息
   */
  | { type: 'trigger' }

/**
 * 音源怎麼移動
 *
 * 大部分的聲音是釘死在某個點上的——瀑布、灶火、簷下的滴水都不會走。
 * 但會叫的東西幾乎都會動：海鷗在岸邊盤旋、鳴禽在樹梢換枝、
 * 蚱蜢在草上慢慢挪。釘死之後那些聲音就成了立在原地的音箱，
 * 站著不動聽久了會發現方位一動也不動，整片音景因此顯得是假的。
 *
 * 移動的軌跡刻意做得慢：這是一個讓人停下來聽的世界，
 * 聲音要「飄過去」而不是「咻一聲飛過」
 */
export type SoundMotion =
  /**
   * 繞著原點盤旋
   *
   * 給那些真的在畫圈的東西：盤旋的海鷗。
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
   * 樹梢的鳴禽、草上的蟲都用這個
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

/**
 * 音源在一天當中的哪一段出現
 *
 * - day／night：跟著白晝程度交叉淡入淡出
 * - dawn：拂曉。天還沒亮就起頭，太陽爬到半空才散（晨間的鳥合唱）
 * - dusk：薄暮。太陽還掛著就起頭，天黑透之後一陣子才退（入夜前漲起來的蟲與蛙）
 * - twilight：太陽貼著地平線那一段，早晚各一次，與天上晨昏才出現的東西同進同退（雁行、椋鳥群舞）
 */
export type SoundActivePeriod = 'day' | 'night' | 'dawn' | 'dusk' | 'twilight'

/**
 * 每一次播放差多少
 *
 * 不寫的話引擎給一組保守的預設（見 sound-shaping 的 pickPlayVariation）。
 * 鐘、風鈴這類音高固定的東西要把 pitchRangeCent 寫成零，不然每敲一下都換一口鐘
 */
export interface SoundVariation {
  /**
   * 這顆音源固定偏移多少音分（一百音分是一個半音）
   *
   * 幾座場景共用同一段錄音時靠它分開：拓荒原的嚎借的是雪稜的狼，調高一點就像小一號的郊狼
   */
  pitchOffsetCent?: number;
  /**
   * 在固定偏移上下再差多少音分
   *
   * 間歇音是每次播放隨機取一次；循環音是每一顆照 id 取一個定值，載入卸載都不變
   */
  pitchRangeCent?: number;
  /** 每次播放音量最多掉幾成（0 ～ 1），只對間歇音與觸發音有用 */
  volumeDropRatio?: number;
}

/**
 * 音量跟著雨（雪）勢走
 *
 * levelRange 是這座場景的雨勢最小到最大（場景定義的 weather），攤開成 floor 到一：
 * 雨最小時留 floor 那麼多，滿檔才是定義裡的 volume
 */
export interface SoundWeatherGain {
  source: 'rain' | 'snow';
  levelRange: [number, number];
  /** 雨勢在 levelRange 最低那一頭時剩幾成音量 */
  floor: number;
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
   * 風露苑白天是風與蚱蜢、夜裡是蟋蟀；市井坊的人聲入夜就散了，只剩灶上的火。
   * 音量的交叉淡入淡出跟著日出日落走，不是到點切換
   */
  activeAt?: SoundActivePeriod;
  /**
   * 會不會移動，不給就釘在原地
   *
   * x、z、y 在這種情況下是「繞著哪裡動」的錨點，而不是實際位置
   */
  motion?: SoundMotion;
  /** 每一次播放的音高與音量差多少，不給就用引擎的預設 */
  variation?: SoundVariation;
  /** 音量跟著雨勢或雪勢起落，不給就不管天氣強弱 */
  weatherGain?: SoundWeatherGain;
  /**
   * 聲音能不能越過崖緣傳上來
   *
   * 遮蔽是沿著聽者到音源的直線數方塊，崖下的聲音因此全被崖身擋掉。
   * 標了這個的音源會多試一條路：從音源垂直往上到聽者的高度、再水平過來，取比較通的那一條（打個折）。
   * 只給頭頂是開闊的音源用（熔岩湖、瀑布潭）；洞裡的東西標了，洞頂薄的地方會漏到地面上
   */
  canCarryOverEdge?: boolean;
  /**
   * 是不是補底的音源
   *
   * 補底的音源只負責讓空地不死寂（外圍多鋪的一圈風、多放的幾叢蟲），不是一處景物。
   * 神遊挑停留點、決定往哪裡看時會略過它們，新增補底的音源不會改變神遊停在哪裡
   */
  isFiller?: boolean;
}

/** 天氣狀態 */
export type Weather = 'clear' | 'rain' | 'snow'

/**
 * 正在發聲的音源狀態，供 HUD 顯示
 *
 * 同一個名稱的音源併成一條：湖岸一圈十顆「岸邊的水」、海邊好幾顆「拍岸浪聲」，
 * 一顆一條的話清單上會疊著兩三條一模一樣的字
 */
export interface AudibleSound {
  /**
   * 這一條的開關鍵，由名稱算出來（見 spatial-soundscape 的 getSoundMuteKey）
   *
   * 同名的音源共用一個鍵，按一下整組一起開關，包括此刻還沒載入、在遠處的那幾顆
   */
  id: string;
  title: LocalizedText;
  zone: SoundZone;
  /**
   * 依距離估算的響度 0 ~ 1
   *
   * 這是「沒有被單獨關掉的話會有多響」。被關掉的音源照樣算這個值，
   * 清單上那一條才還看得出它就在附近——不然關掉之後它會從清單消失，
   * 也就再也沒有地方可以把它打開。同名併成一條時取最響的那一顆
   */
  loudness: number;
  /** 與玩家的距離，取同名裡最近的那一顆 */
  distance: number;
  /** 是不是被單獨關掉了 */
  isMuted: boolean;
}
