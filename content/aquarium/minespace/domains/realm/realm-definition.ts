import type { BlockId } from '../block/block-constants'

/**
 * 場景（realm）的定義
 *
 * 禪庭是大廳，之後每座箱庭可以有一個走得進去的大場景（見 docs/plans/2026-11-27-minespace-realms-design.md）。
 * 這裡只放純資料：渲染端、主執行緒與地形 worker 都會讀到它，
 * 所以不能引用 Babylon，也不能帶函式以外的執行期物件。
 *
 * 地形怎麼生不在這裡，在 realm-terrain.ts：生成器（各箱庭的造景程式）有好幾千行，
 * 只有地形 worker 用得到，跟著定義一起被渲染端引用的話，整包會被打進渲染 worker
 */

/** 兩種介面語言各一份的文字 */
export interface RealmText {
  'zh-hant': string;
  'en': string;
}

/**
 * 出生點
 *
 * 只給水平座標，高度由渲染端找「站得住腳的位置」決定：
 * 地形是生成的，寫死高度的話改了造景就會卡進方塊裡
 */
export interface RealmSpawn {
  x: number;
  z: number;
  /** 鏡頭的俯仰與偏航（弧度），俯仰正值是往下看 */
  pitch: number;
  yaw: number;
}

/**
 * 數值欄位的三種寫法
 *
 * - value：固定值，場景的招牌，每天都一樣
 * - offset：加在原本的值上（原本的值可能來自每日天氣，每天仍有變化）
 * - scale：乘在原本的值上
 *
 * 沒寫的欄位就是不動，大廳整份留空，外觀因此與沒有場景系統時一模一樣
 */
export type RealmNumberSetting =
  | { value: number }
  | { offset: number }
  | { scale: number }

/** 線性 RGB，零到一（可略超過一） */
export type RealmColor = readonly [number, number, number]

/**
 * 顏色欄位
 *
 * 只收固定值與逐通道倍率。倍率是給「霧色偏藍白」這種要跟著日夜走的染色用的：
 * 夜裡的霧色本來就暗，乘上去照樣是暗的；固定值則連夜裡都是那個顏色
 */
export type RealmColorSetting =
  | { value: RealmColor }
  | { scale: RealmColor }

/**
 * 場景的氣氛設定
 *
 * 疊在既有的兩套參數上：大氣（AtmosphereState）與雲（CloudWeather）。
 * 套用順序是 日夜基準 → 每日天氣 → 這一份 → 箱庭的天氣範圍（只有大廳有）。
 * 第一版只收大湖用得到的欄位，天空漸層仍由日夜循環算，不開放調整
 */
export interface RealmAtmosphereProfile {
  fog?: {
    /** 霧色，套在日夜給的基準霧色上 */
    tint?: RealmColorSetting;
    /** 霧的起點與終點（格），基準是晴天的 100 與 220 */
    start?: RealmNumberSetting;
    end?: RealmNumberSetting;
  };
  light?: {
    /** 直射光、天光與高光的倍率，基準都是 1 */
    lightRatio?: RealmNumberSetting;
    ambientRatio?: RealmNumberSetting;
    specularRatio?: RealmNumberSetting;
    /** 曝光，套在日夜給的基準曝光上（線性倍率，不是檔數） */
    exposure?: RealmNumberSetting;
  };
  cloud?: {
    /** 積雲覆蓋率的偏移，基準是每日天氣算出來的那一份 */
    coverageOffset?: RealmNumberSetting;
    /** 雲底高度（格），基準是 115；雲層厚度不變，整層一起升降 */
    baseHeight?: RealmNumberSetting;
    /** 層雲、雲塔、高積雲的程度，零到一 */
    stratus?: RealmNumberSetting;
    congestus?: RealmNumberSetting;
    altocumulus?: RealmNumberSetting;
    /** 風速倍率，基準是每日天氣算出來的那一份 */
    windSpeed?: RealmNumberSetting;
  };
  groundMist?: {
    /** 某一天的清晨有沒有晨霧的機率，零到一，基準是 1（天天都有） */
    chance?: RealmNumberSetting;
    /** 晨霧的濃度倍率，基準是 1 */
    density?: RealmNumberSetting;
  };
}

/**
 * 轉場樣式
 *
 * 霧從四周湧上蓋滿畫面時的霧色、夾帶的粒子與音效，依目的地而變。
 * 樣式寫在目的地上：從大廳走進湖中島，看到的是湖那一邊的藍白霧與水珠
 */
export interface RealmTransition {
  /**
   * 霧色的逐通道倍率，乘在日夜給的基準霧色上
   *
   * 給倍率而不是固定色：夜裡穿過傳送門，霧該是暗的；
   * 寫死一個白色的話，半夜會整個畫面亮成一片白牆
   */
  fogTint: RealmColor;
  /** 霧裡夾帶的粒子顏色（線性 RGB），同樣會跟著日夜變暗 */
  particleColor: RealmColor;
  /** 粒子往哪邊飄，正值往上：水珠往下落，花粉往上浮 */
  particleRise: number;
  /** 轉場時主執行緒要播的音效，音檔名稱見 sound-data 的 getSoundUrl */
  sound: string;
}

/**
 * 傳送門
 *
 * 一座方塊門框，門洞裡是一片流動的霧面。人走進門洞的觸發範圍就送到目的地。
 * 門框的方塊由地形 worker 生（見 realm-terrain），霧面與木牌由渲染端的世界層建
 */
export interface RealmPortal {
  /** 門洞中心的水平座標（方塊中心） */
  x: number;
  z: number;
  /** 門洞底下那一格的腳底高度，也就是人站進門洞時的腳底整數高度 */
  y: number;
  /**
   * 門洞朝哪個軸展開
   *
   * 'x' 表示門洞沿 X 軸攤開、人沿 Z 軸穿過去；'z' 反過來
   */
  spanAxis: 'x' | 'z';
  targetRealmId: RealmId;
  /** 落在目的地的哪裡，不給就用目的地自己的出生點 */
  targetSpawn?: RealmSpawn;
  /**
   * 門旁的木牌
   *
   * 寫的是目的地的名字與一句短語（signCaption），所以文字不放這裡，從目的地的定義拿。
   * 座標是木牌那根柱子的那一格，牌面掛在柱子朝 facing 的那一側
   */
  sign?: {
    x: number;
    z: number;
    facing: 'north' | 'south' | 'east' | 'west';
  };
}

/**
 * 遠山的樣式，各樣式的層數、半徑與顏色寫在 backdrop 的 RIDGE_STYLE_MAP
 *
 * - mountain：三圈灰綠的山（湖中島）
 * - forest：三圈深綠的林稜，一層比一層淡進霧裡（林海）
 * - islet：遠海上零星幾座很淡的小島，大部分方位是空的海平線（海中沙島）
 * - autumn：三圈秋色的圓丘，赭紅褐黃，一層比一層淡進暖霧裡（金葉林）
 * - marsh：兩圈低矮的林線貼著水面，近的那圈有缺口（千蛙沼）
 * - hills：三圈起伏和緩的綠丘，一層比一層淡（村落）
 * - snowpeak：三圈積雪的岩峰，山腳插在雲海裡（雪稜）
 * - plains：兩圈又低又淡的遠丘，大段是空的地平線（千頃麥浪）
 * - downs：三圈一座一座的嫩綠圓丘（風露原）
 * - arbor：三圈圓頂的闊葉林丘，綠得清透（百囀林苑）
 * - canopy：三圈又高又密的深綠闊葉林稜（蟬雨深林）
 * - crag：三圈參差的灰岩稜，近的那圈有缺口（石殿遺址）
 * - caldera：兩圈陡而禿的赭黃火山稜，淡在硫煙裡（湯煙谷）
 */
export type RealmRidgeStyle = 'mountain' | 'forest' | 'islet' | 'autumn' | 'marsh' | 'hills' | 'snowpeak' | 'plains' | 'downs' | 'arbor' | 'canopy' | 'crag' | 'caldera' | 'mesa'

/**
 * 遠景布景
 *
 * 一圈一圈環狀的山稜剪影，加上世界外的水面或地面。
 * 都是走不到的布景，山稜不吃一般的距離霧，自己依層次混入地平線色
 */
export interface RealmBackdrop {
  /** 山稜環的中心，通常是世界中心 */
  centerX: number;
  centerZ: number;
  /** 遠山；不給就沒有山，四面都是地平線 */
  ridge?: {
    style: RealmRidgeStyle;
    /** 山腳從這個高度往下插（世界座標，通常是水面或地面） */
    footY: number;
    /** 山稜的雜訊種子，換一個字串就是另一座山 */
    seed: string;
  };
  /**
   * 世界外的水面
   *
   * 從可走範圍一路鋪到地平線，與方塊的水面齊平，倒影只映天空。
   * 只有四周是水的場景有
   */
  water?: {
    /** 水面的世界高度（水面那一層方塊的頂面再矮八分之一格） */
    surfaceY: number;
    /** 水本身的顏色（線性 RGB），正對著看時看到的就是它；湖偏藍、海偏青 */
    color: RealmColor;
  };
  /**
   * 不畫的底層方塊（LAKE_BED）由一片平面代替
   *
   * 深水的湖底、林海外圍走不到的地面都是 LAKE_BED：碰撞照算、不畫，
   * 改由這片平面畫，貼圖借 blockId 那種方塊的頂面
   */
  floor?: {
    /** 平面的世界高度，也就是那一層方塊的頂面 */
    surfaceY: number;
    /** 借哪一種方塊的貼圖與色調 */
    blockId: BlockId;
    /**
     * 要不要鋪到地平線
     *
     * 湖底只要蓋住世界裡的深水；林海的地面要一路鋪出去，
     * 從林子的縫隙望出去才不會看到世界的邊
     */
    isEndless: boolean;
  };
  /**
   * 腳下的雲海
   *
   * 一整片鋪到地平線的雲面，斷崖插進去、遠山的山腳也埋在裡面（雪稜）。
   * 雲面以下的方塊都是不畫的 LAKE_BED，有它蓋著就看不到切口
   */
  cloudSea?: {
    /** 雲面的世界高度 */
    surfaceY: number;
  };
  /**
   * 瀑布底下的水沫與水霧（溪谷），見 river/waterfall-mist
   *
   * 座標是水幕落點那一排的中心（潭面上），halfWidth 是水幕的半寬
   */
  waterfallMist?: {
    x: number;
    y: number;
    z: number;
    halfWidth: number;
  };
}

/**
 * 不循環場景的邊界
 *
 * 四周是天然屏障，沒有隱形牆：游進深水（或鑽進密林）會越走越慢，
 * 過了推回線之後被輕輕推回來。半徑都是從 center 量的水平距離
 */
export interface RealmBoundary {
  centerX: number;
  centerZ: number;
  /**
   * 屏障是什麼
   *
   * - water：四周是深水，只在水裡作用，站在岸上或木棧上不受影響；停下來不划會被水流帶回淺灘
   * - land：四周是密林，走在地上也作用；停下來就停在原地，不會自己被拖走
   */
  medium: 'water' | 'land';
  /** 從這裡開始游不快 */
  slowRadius: number;
  /** 過了這裡就被往回推 */
  pushRadius: number;
}

/**
 * 一面鏡面：在這個正方形範圍裡找最多格柱落在同一層的水面（或冰面），在那一層上映出天空與四周
 *
 * 範圍框住那一池就好，框得太大會把旁邊別的水也算進來。
 * 一面鏡子等於那一帶的地景多畫一趟（只在走近時畫），所以只給「那面反光本身就是主題」的水
 */
export interface RealmMirrorTarget {
  /** 網格與貼圖的名字用它，同一個場景裡不能重複 */
  id: string;
  centerX: number;
  centerZ: number;
  halfSize: number;
  /** 水面比格子頂面矮八分之一格，冰面就是格子頂面 */
  surface: 'water' | 'ice';
}

/** 水面的湧浪範圍，見 water-surface 的 SWELL_STRENGTH；不給就整片水都沒有湧浪 */
export interface RealmSwellArea {
  centerX: number;
  centerZ: number;
  halfSize: number;
}

/**
 * 神遊時無人機的飛行設定（見 domains/drift）
 *
 * 高度都是「離腳下最高的東西多高」：路徑兩側幾格內最高的地形、樹冠、岩壁再往上加，
 * 所以同一組數字在平原、林海與山脊上都不會穿進去。不給就用 drift-flight-config 的預設，
 * 各場景的建議值也集中寫在那裡，不必每座場景的資料夾各改一份
 */
export interface RealmDriftFlight {
  /** 關掉就只散步不升空（洞頂太低的地底場景） */
  isEnabled: boolean;
  /** 巡航時離最高障礙的距離範圍（格），路徑上慢慢在兩者之間起伏 */
  clearanceMin: number;
  clearanceMax: number;
  /** 世界座標的高度上限，不給就不限（溪谷用它把鏡頭壓在峽谷邊緣之下） */
  altitudeMax?: number;
  /**
   * 飛行的平面路線
   *
   * - free：停留點之間直接拉一條平滑曲線（湖、海、林海這種四面開闊的場景）
   * - ground：沿著散步用的可行走路線飛（溪谷這種要順著谷底走的場景）
   */
  routeMode?: 'free' | 'ground';
}

/** 場景作者補的觀景點：鏡頭停在這裡，面向 look 那一點慢慢環顧 */
export interface RealmDriftViewpoint {
  x: number;
  z: number;
  /** 看向哪裡，不給就依音源決定 */
  lookX?: number;
  lookZ?: number;
}

/**
 * 神遊的特色主體種類
 *
 * - water：水面（池、湖、潮池、溪）
 * - waterfall：瀑布
 * - structure：人造建物（亭、塔、木棧、橋、風車）
 * - landmark：地標（巨像、立石、山頭，常常很大也很遠）
 * - tree：值得看的樹（老橡、孤樹、樹叢）
 * - vista：遠景（遠山、海平線、雲海），視線穿過開闊空間望出去
 * - gate：門（鳥居、傳送門）
 * - light：光源（燈、營火、岩漿、螢光）
 */
export type DriftFeatureKind = 'water' | 'waterfall' | 'structure' | 'landmark' | 'tree' | 'vista' | 'gate' | 'light'

/**
 * 神遊的特色主體：運鏡的視線優先對準這些地方，而不是一路看著山壁
 *
 * 全是作者依各場景的版面常數寫下的資料，座標是世界座標。
 * 與 driftViewpointList 的分工：觀景點是「鏡頭站在哪」，這裡是「鏡頭看什麼」，
 * viewpointList 只是某個主體最好的站位。
 */
export interface DriftFeature {
  kind: DriftFeatureKind;
  /** 方便除錯與記錄的短名 */
  name: string;
  /** 主體的中心（世界座標），視線對準這裡 */
  x: number;
  y: number;
  z: number;
  /** 主體的大概尺寸（格），決定取景距離 */
  size: number;
  /** 零到一，越特別越常被選 */
  weight: number;
  /** 適合欣賞的距離範圍（格） */
  viewDistance: [number, number];
  /** 最好的觀賞站點，沒有就讓運鏡自己找 */
  viewpointList?: { x: number; z: number }[];
  /** 線狀的主體（溪流、木棧、長廊），由多個點組成，視線可沿著它走 */
  pathList?: { x: number; y: number; z: number }[];
}

export type RealmId = 'hub' | 'lake' | 'coast' | 'forest' | 'autumn' | 'swamp' | 'village' | 'cave' | 'alpine' | 'river' | 'wheatfield' | 'meadow' | 'songbird' | 'cicada' | 'rainvale' | 'blizzard' | 'campfire' | 'ruins' | 'jigoku'

export interface RealmDefinition {
  id: RealmId;
  /** 場景名稱，HUD 與木牌用 */
  title: RealmText;
  /** HUD 區域欄在名稱底下的那一句描述 */
  description: RealmText;
  /**
   * 木牌上名稱底下的短句
   *
   * 木牌只有一格半寬，HUD 那一句放上去字就得縮到讀不出來，
   * 所以另給一句七八個字以內的
   */
  signCaption: RealmText;
  spawn: RealmSpawn;
  /**
   * 世界是不是首尾相接
   *
   * 大廳是：走出邊界從對面出來，靠邊界的白霧藏住接縫。
   * 大場景不是，四周用天然屏障圍住。
   * 玩家控制器的座標循環、雲的世界平移補償、邊界白霧都看這個旗標
   */
  isLooping: boolean;
  /**
   * 這個場景是不是禪庭本身
   *
   * 箱庭專屬的東西都掛在這個旗標上：外圍那片白沙、水鏡池的倒影、營火、
   * 箱庭的天氣範圍（雨、雪、沼澤霧、地獄谷熱氣），以及 HUD 的「目前在哪一座箱庭」
   */
  hasGardens: boolean;
  /**
   * 整個場景在地底，頭上沒有天（地底洞窟）
   *
   * 天空、日月星、雲、陰天罩、光束與太陽的陰影整套不畫也不算（見 realm-sky），
   * 漫遊控制器的洞穴程度直接當成全滿；日夜時鐘照走（HUD 照樣顯示時刻），
   * 但洞裡的光照固定用深夜那一份：燈火全亮、環境光只剩岩壁的微光，不隨時刻變。
   * 不給就是地面上的場景
   */
  isUnderground?: boolean;
  /**
   * 洞頂滴水的粒子落在哪（世界座標，y 是水滴冒出來的高度）
   *
   * 引擎層只有兩組滴水粒子（岩響窟的通道與洞室），換場景時照這份搬過去，依序對應；
   * 大廳照舊落在岩響窟，其他沒給的場景整組停掉
   */
  caveDripList?: { x: number; y: number; z: number }[];
  atmosphere: RealmAtmosphereProfile;
  backdrop?: RealmBackdrop;
  /** 走進這個場景時的轉場樣式 */
  transition: RealmTransition;
  portalList: RealmPortal[];
  /** 不循環的場景才有，見 RealmBoundary */
  boundary?: RealmBoundary;
  swellArea?: RealmSwellArea;
  /**
   * 要映出天空與四周的鏡面（水鏡池那種倒影），見 RealmMirrorTarget；不給就沒有
   *
   * 大廳的鏡面照舊由 water-mirror 的 HUB_MIRROR_TARGET_LIST 給（各箱庭的木座）
   */
  mirrorTargetList?: RealmMirrorTarget[];
  /** 要開的天氣粒子（落葉、沼澤霧片），見 RealmWeatherParticle；不給就都不開 */
  weatherParticle?: RealmWeatherParticle;
  /** 整片場景的雨、雪與雷，見 RealmWeather；不給就是晴天 */
  weather?: RealmWeather;
  /** 神遊的無人機設定，不給就用預設，見 RealmDriftFlight */
  driftFlight?: RealmDriftFlight;
  /** 神遊的特色主體（溪、瀑布、建物、遠景…），運鏡的視線優先看這些，見 DriftFeature */
  driftFeatureList?: DriftFeature[];
  /**
   * 神遊視線的偏好方向，不給就是 'feature'（只看特色主體與縱深最長的方向）
   *
   * - outward：偏向「從場景中心往外」看（越過邊緣看雲海、遠山、海平線），而且不仰頭看近處的坡與峰頂；站得高的場景用
   * - inward：偏向看向場景中心（四周圍著中心的場景，例如廣場）
   */
  driftLookBias?: 'outward' | 'inward' | 'feature';
  /** 神遊額外的觀景點，自動推導的停留點之外補幾個手動挑的 */
  driftViewpointList?: RealmDriftViewpoint[];
  /** 開場面板與 HUD 顯示的圖示 */
  icon: string;
}

/**
 * 雨（雪）勢的起落範圍，零到一
 *
 * 在 min 與 max 之間慢慢起伏（兩道週期互質的正弦疊起來，見 use-weather 的 measureRealmWeatherLevel），
 * 一陣大一陣小；min 與 max 給一樣就是固定。滿檔（一）就是大廳裡站在雨區箱庭正中的那一場
 */
export interface RealmWeatherLevel {
  min: number;
  max: number;
  /** 起伏一趟大約幾秒 */
  periodSecond: number;
}

/**
 * 整片場景的天氣
 *
 * 大廳的雨與雪綁在箱庭的座標上（聽雨亭、吹雪野，見 use-weather 的天氣範圍），
 * 站進木座才下；延伸那幾座箱庭的大場景整片都在那場天氣裡，雨勢不看站在哪、看時間起落。
 * 雨雪粒子照舊跟著鏡頭、打到屋頂或樹冠就停（射線），簷下與亭子裡是乾的；
 * 霧、光、陰天罩、地濕與鳥蟲噤聲都跟著雨（雪）勢走，與大廳那幾座同一套
 */
export interface RealmWeather {
  rain?: RealmWeatherLevel;
  snow?: RealmWeatherLevel;
  /**
   * 會不會打雷（聽雨林有）
   *
   * 雷聲要有一顆 id 為 rainvale-thunder、mode 為 trigger 的音源（渲染端只認這個名字），
   * 閃電在雨勢過半時才劈
   */
  hasThunder?: boolean;
}

/**
 * 天氣粒子鋪在哪一片
 *
 * 大場景比箱庭大得多，同樣的粒子數攤在整片上就稀到看不見，
 * 所以粒子改成鋪在鏡頭四周 followRadius 格內、再夾在這片範圍裡：
 * 人走到哪，身邊就有那麼濃的落葉或霧片，走出範圍就沒有
 */
export interface RealmParticleArea {
  centerX: number;
  centerZ: number;
  radius: number;
  followRadius: number;
  /**
   * 鏡頭身邊幾格內不生，預設 0
   *
   * 給大片的霧片用：十幾格寬的半透明片貼著鏡頭生，整個畫面被一層層蓋住，
   * 一片就是一整個畫面的混色，十幾片疊起來 GPU 吃不消，看起來也只是眼前一團白。
   * 讓出一圈，霧是一團團浮在前方水面上的，走過去才被它罩住
   */
  clearRadius?: number;
}

/**
 * 大場景的天氣粒子
 *
 * 大廳的落葉綁在金葉苑、霧片綁在蛙聲澤的木座上（hasGardens 時自動開）；
 * 大場景延伸那一座箱庭的設計，招牌粒子也跟著過去，範圍在這裡給
 */
export interface RealmWeatherParticle {
  /**
   * 螢火的濃度，乘在大廳那一份的生成速度上（見 air-motes），不給就是 1
   *
   * 螢火在每個場景的夜裡都有，跟著鏡頭飄；風露苑延伸出去的原野入夜是蟲的地方，
   * 夜裡要比別處多得多。容量是大廳那一份的三倍，最多給到 3
   */
  fireflyDensity?: number;
  fallingLeaves?: RealmParticleArea & {
    /**
     * 射線打到的表面低於這個高度就重抽（世界座標）
     *
     * 葉子要從樹冠上鬆脫：大場景的樹比箱庭疏，隨便抽一點多半打在地上，
     * 葉子就從腳邊冒出來。給地面再高幾格，抽到樹冠才用
     */
    canopyMinY?: number;
  };
  swampMist?: RealmParticleArea & {
    /**
     * 霧片濃度，乘在大廳那一份的生成速度上（1 就是蛙聲澤木座上的生成速度）
     *
     * 沼澤的霧在清晨與傍晚最濃：夜裡冷下來的水氣貼著水面，太陽一曬就散開，
     * 傍晚溫度一降又浮起來。晨昏用 peakDensity、白天 dayDensity、夜裡兩者之間。
     * 霧片系統的容量是大廳那一份的三倍，peakDensity 最多給到 3
     */
    dayDensity: number;
    peakDensity: number;
    /**
     * 只在頂面不高過這個高度的地方生（水面那一層方塊的頂面，泥灘與它同高）
     *
     * 霧是貼著水面積起來的濕氣：射線打到木棧、扶手或枯木（比水面高）的那一點就重抽，
     * 木棧上方的霧因此薄，路看得清楚，霧一團團壓在水與泥灘上
     */
    waterSurfaceY: number;
    /** 霧片離水面的高度範圍（格），大廳是 0.5～5 */
    heightRange: readonly [number, number];
    /**
     * 蛙聲澤那組沼澤大氣（霧距兩到二十格、光散開，見 atmosphere 的 SWAMP_ATMOSPHERE）疊上去多少（零到一）
     *
     * 大廳是站進蛙聲澤木座才收攏；大場景整片都是沼澤，改成看時刻：
     * 晨昏用 peak、白天 day、夜裡介於兩者（同 measureMistDensity）
     */
    fogRatio: { day: number; peak: number };
  };
}
