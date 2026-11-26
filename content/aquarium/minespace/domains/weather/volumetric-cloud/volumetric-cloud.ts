import type { Effect, Mesh, Scene } from '@babylonjs/core'
import type { CloudNoiseSet } from './cloud-noise'
import {
  Color3,
  Constants,
  EffectRenderer,
  Effect as EffectStore,
  EffectWrapper,
  InverseLerp,
  Matrix,
  MeshBuilder,
  RawTexture,
  RawTexture3D,
  RenderTargetTexture,
  ShaderMaterial,
  SmoothStep,
  Texture,
  Vector2,
  Vector3,
  Vector4,
} from '@babylonjs/core'
import { watch } from 'vue'
import { useDevToggles } from '../../../composables/use-dev-toggles'
import { reportDiagnostic } from '../../../composables/use-error-logger'
import { useGraphicsQuality } from '../../../composables/use-graphics-quality'
import { measureSection } from '../../../composables/use-performance-probe'
import { optOutOfFog } from '../../renderer/fog-opt-out'
import { WORLD_SIZE } from '../../world/world-constants'
import { getCloudShadowLightDirection, setCloudShadowMap } from '../cloud-shadow'
import {
  createCloudWeather,
  createDailyWeather,
  deriveCloudWeather,
  sampleDailyWeather,
} from './cloud-daily-weather'
import {
  CLOUD_COMPOSITE_FRAGMENT,
  CLOUD_DOME_VERTEX,
  CLOUD_FULLSCREEN_VERTEX,
  CLOUD_MARCH_FRAGMENT,
  CLOUD_REFLECTION_FRAGMENT,
  CLOUD_RESOLVE_FRAGMENT,
  CLOUD_SAMPLER_NAME_LIST,
  CLOUD_SHADOW_FRAGMENT,
  CLOUD_UNIFORM_NAME_LIST,
} from './cloud-glsl'
import { requestCloudNoise } from './use-cloud-noise-worker'

/**
 * 體積雲
 *
 * 原本的雲是一整片方塊網格：一百格高、五格厚，每朵雲是幾格十四格寬的扁盒子。
 * 那是 Minecraft 的雲，看得到厚度與側面，但它永遠是一塊平頂平底的白色積木——
 * 沒有雲底的陰影、沒有逆光的銀邊、日落時也不會只有雲頂被染紅。
 *
 * 這一支換成真正的參與介質：從鏡頭往每個像素射一條線，沿路一步一步問
 * 「這裡的空氣裡有多少水氣、照得到多少太陽」，把散射進眼睛的光一路累加起來。
 * 雲長什麼樣、怎麼被照亮，全部是算出來的，不是畫出來的。
 * 密度與光照的模型寫在 cloud-glsl，這裡管的是「怎麼在一幀之內付得起」。
 *
 * ── 一幀之內付得起：四件事 ──
 *
 * 一、降解析度。雲是柔的，半解析度看不出差別，像素數卻只剩四分之一。
 *
 * 二、時間累積。每一幀的行進起點各自抖動一點，單看一幀是顆粒狀的雜訊；
 *     把上一幀的結果投影回來混在一起，十幾幀累積下來就等於走了十幾倍的步數。
 *     這是 Nubis 能在 PS4 上跑兩毫秒的關鍵，也是這裡步數敢壓到幾十步的理由。
 *
 * 三、深度不用算。合成那一趟是一個貼著遠平面的天空罩，
 *     地形本來就寫了深度，擋得住它；雲根本不必知道地上有什麼。
 *     所以最省的那一級沒開場景深度圖也照樣能用。
 *
 * 四、雲看不見就整個不跑。陰天罩蓋滿、走到世界邊界、除錯開關關掉，
 *     三種情況都直接跳過所有趟數——不留一趟「跑了但什麼都沒畫」的全螢幕
 *
 * ── 合成順序 ──
 *
 * 天空罩、日月、星空畫在第零層；雲畫在第一層的半透明佇列，
 * alphaIndex 比陰天罩小，所以陰天罩永遠蓋在雲上面。
 * 舊的方塊雲要寫深度才不會自己疊自己，於是會在陰天罩上挖出一個洞
 * （use-weather 裡 CLOUD_VANISH_AT_OVERCAST 那段的來由）；
 * 這裡一筆深度都不寫，那個洞不會再出現
 */

/** 雲底與雲頂的高度（格），世界最高四十格，鏡頭永遠在雲層底下 */
const CLOUD_BOTTOM = 115
const CLOUD_TOP = 205

/**
 * 雲塔那天雲層最多往上加高多少（格）
 *
 * 積雨雲塔（cumulus congestus）是同一層積雲往上長，不是另一層雲，
 * 所以做法是把整個球殼的頂抬高，再在著色器裡只讓一部分地區的雲真的長到那裡
 * （見 cloudDensity 的 towerMask）。其餘地方的雲照舊停在原本的高度，
 * 抬高的那一截空氣由「跳過空白」的粗步距走過，花的錢很有限。
 * 加高後的頂不能碰到高積雲（見 ALTOCUMULUS_BOTTOM）
 */
const CLOUD_TOWER_EXTRA_HEIGHT = 70

/**
 * 高積雲：雲底、雲頂（格）與消光係數的倍率
 *
 * 夾在積雲（頂最高 275）與卷雲（420）之間，是一層薄薄的、一朵一朵的小雲。
 * 只有三十格厚：薄所以每一步都便宜，也因此只走寥寥幾步（見 cloudComposeSky）。
 * 消光倍率留著當調整旋鈕，目前是一：原本想拉大來補它薄的那一截，
 * 實際看密度本身（著色器裡的 1.15 倍增益）就夠，邊緣沒有變成一層霧
 */
const ALTOCUMULUS_BOTTOM = 300
const ALTOCUMULUS_TOP = 330
const ALTOCUMULUS_EXTINCTION_SCALE = 1.0
/** 高積雲覆蓋率的倍率：天氣給的是零到一的傾向，著色器裡還要再被區域變化推來推去 */
const ALTOCUMULUS_COVERAGE_SCALE = 0.65

/**
 * 星球半徑（格）
 *
 * 不是地球的比例，是「天邊的雲沉下去」需要的曲率。
 * 一萬二的時候，望向正前方水平線的視線大約在一千六百格處碰到雲底、
 * 兩千兩百格處穿出雲頂——遠方的雲在這個距離內自然地降到地平線，
 * 而霧與大氣透視也剛好在那附近把它化進天色
 */
const PLANET_RADIUS = 12000

/**
 * 三張雜訊攤在天上多大（格）
 *
 * 基底一個週期四百八十格：一朵積雲一兩百格寬，一個週期裡容得下幾朵，
 * 又不會小到同一個形狀在視野裡重複出現。
 * 細節七十二格：雲邊那些捲曲的缺口大約是幾格到十幾格。
 * 天氣圖三千兩百格：決定「這一大片天比較多雲」的尺度，
 * 比視野裡看得到的範圍還大，抬頭轉一圈看不出重複
 */
const BASE_NOISE_PERIOD = 220
const DETAIL_NOISE_PERIOD = 26
const WEATHER_MAP_PERIOD = 3200

/** 天氣圖與兩張雜訊的邊長，取捨見 cloud-noise 的 CloudNoiseSizeOption */
const NOISE_SIZE_OPTION = { baseSize: 64, detailSize: 32, weatherSize: 256, cirrusSize: 512 }
const NOISE_SEED = 'minespace-cloud'

/**
 * 晴天的覆蓋率
 *
 * 零點四六時滿天都是雲，內顯每幀多花十毫秒；零點三八是雲量與成本的折衷。
 *
 * 這是「局部覆蓋率」的中間值：天氣圖與宏觀圖會把它在零點二倍到
 * 一點七倍之間推來推去（cloudDensity 的 mix(0.2, 1.7, regional)），
 * 同一片天裡有的地方雲多、有的地方幾乎是晴空。
 *
 * 原本的做法是拿天氣圖切一個門檻，超過一半的面積根本不准長雲，
 * 晴朗區又是一大片連在一起——人站在那片晴空底下，頭頂沒雲、地上沒雲影，
 * 只看得到天邊遠遠幾朵，整片天顯得很稀疏。改成局部覆蓋率是照
 * Minecraft 光影模組 Photon 的做法：覆蓋率本身在最小與最大值之間隨地點變化，
 * 再拿雲形的雜訊去切
 */
const CLEAR_COVERAGE = 0.38

/*
 * 為什麼雲的分布要再疊一層「宏觀」雜訊（見 cloudDensity 的 macro）
 *
 * 基底雜訊每兩百多格就平鋪一次，從地面望出去，天上同一個雲形會重複好幾遍；
 * 覆蓋率的地區差異又小，滿天的雲大小一樣、間距一樣，像一群排好隊的羊。
 *
 * 宏觀圖（worker 從天氣圖烘出來，見 createMacroMap）以三成一的頻率取樣，週期約一萬格，
 * 一次取樣拿齊兩樣東西：
 * 一、各區域的座標各自偏移，取到基底雜訊的不同段落，同一個雲形不再重複。
 *     偏移只能取變化最慢的通道：曾經拿覆蓋通道來偏移九百格，
 *     那個通道幾百格內就從零走到一，雲被拉扯成一道道長條紋（踩過）。
 * 二、與天氣圖一起決定局部覆蓋率，範圍拉到零點二到一點七倍：
 *     有的地方是成群的雲，有的地方幾乎是晴空。
 *
 * 曾經有第三樣：依區域把基底雜訊的頻率乘上一點三到零點八倍，讓有的區域雲大、有的零碎。
 * 拿掉了。乘的是「絕對座標」，座標裡含風吹過的總距離與雲自己的演變量，兩者隨遊玩時間
 * 無限增長，乘上一個隨地點變化的係數，相鄰兩點的取樣位置差就會被越拉越大，
 * 玩了半小時到一小時雲就被扯成長條紋（用 windTravel 調大實測重現）。
 * 要區域性的尺度變化，只能在固定頻率的兩次取樣之間混合，不能去縮放座標
 */

/** 下雨時覆蓋率往上加多少，雲先變多變暗，陰天罩才接手 */
const RAIN_COVERAGE_BOOST = 0.32

/**
 * 消光係數（每格）
 *
 * 密度一的雲每走一格擋掉這麼多光。一朵一百格厚、平均密度一半的積雲，
 * 光學厚度大約是五，正中間幾乎不透光，邊緣則還看得到後面的天
 */
const EXTINCTION = 0.2

/** 反照率：雲幾乎不吸收光，散射掉的就是全部 */
const ALBEDO = 0.96

/** 雲頂往下風處歪多少格，高的積雲會被高空的風推斜 */
const CLOUD_SKEW = 40

/** 細節侵蝕的強度，大了雲邊會被啃得很碎 */
const DETAIL_EROSION = 0.6

/**
 * 風（格 / 秒）與方向
 *
 * 舊雲層是 0.6，那是一整片硬塊在平移。第一版體積雲給 2.2，
 * 實際看起來還是「固定不變」：雲在兩三百格外，每秒兩格換算成角度
 * 不到半度，人站著看一分鐘都察覺不到在動。
 * 後來加上雲自己的演變（見 EVOLVE_RISE_SPEED），天空已經是活的，
 * 平移不必再扛「看得出在動」這件事。五點五、四點五、二點五實際看都太急，
 * 像快轉的縮時攝影；一點五是頭頂那幾朵每秒挪不到半度，
 * 要盯著看一陣子才察覺得到在飄，正是禪庭該有的速度
 */
const WIND_SPEED = 1.5
const WIND_DIRECTION = new Vector3(1, 0, 0.34).normalize()

/**
 * 雲自己的演變
 *
 * 光靠風把整片雲平移，看起來是一張貼圖在滑：每一朵的形狀從頭到尾不變。
 * 真正的積雲是一邊飄一邊長——上升氣流把雲頂一團一團往上推，
 * 邊緣同時在蒸發。
 *
 * 做法是讓基底雜訊相對天氣圖慢慢移動：天氣圖決定「哪裡會有雲」，
 * 基底決定「雲長什麼樣」，兩者錯開，雲團就會在原地鼓起、分裂、消散。
 * 往上那一份是雲頂翻騰的方向，側向那一份讓雲團逆著風重組，
 * 數字照基底的週期抓：大約三四分鐘一朵雲換一副樣子
 */
const EVOLVE_RISE_SPEED = 0.3
const EVOLVE_DRIFT_SPEED = 0.45
/** 細節雜訊自己翻滾的速度（細節貼圖單位 / 秒），雲邊在長、在散 */
const DETAIL_EVOLVE_SPEED = 0.02
/**
 * 細節雜訊被扭曲的強度（細節貼圖單位）
 *
 * 細節原本是規則的 Worley 泡泡，邊緣看起來像一顆顆珍珠。
 * Nubis 拿 curl 雜訊去扭曲細節的取樣座標，邊緣才會捲成湍流的樣子；
 * 這裡直接借基底已經讀出來的三個低頻通道當扭曲向量，一次取樣都不多花
 */
const DETAIL_SWIRL = 0.55

/**
 * 遠方化進天色的距離與淡出範圍（格）
 *
 * 化進天色用指數：一千兩百格外的雲剩三成七的原色，其餘是天邊的霧色。
 * 淡出則是在穿出雲頂的那附近把不透明度收到零，
 * 不讓雲層在某個距離被一刀切掉
 */
const HAZE_DISTANCE = 1200
const FADE_START = 1700
const FADE_END = 2300

/**
 * 卷雲：高度、覆蓋率、最濃時的不透明度、天氣圖藍色通道攤多大
 *
 * 卷雲是一張在 worker 裡預先算好的 2D 貼圖（見 cloud-noise 的 createCirrusMap），
 * 週期是這張貼圖攤在天上多大。前兩版都失敗過：直接取細節 Worley 是整齊的點陣，
 * 在著色器裡扭曲雜訊座標則扭成大理石紋——卷雲的絲要順著氣流長，
 * 那只能沿著流場卷積出來，而那個計算太貴，不能每個像素每幀做
 */
const CIRRUS_HEIGHT = 420
const CIRRUS_COVERAGE = 0.5
const CIRRUS_OPACITY = 0.4
const CIRRUS_PERIOD = 4600

/**
 * 光照的兩個增益
 *
 * 相位函數是正規化過的（對整個球面積分是一），所以側光下的單次散射
 * 本身只有零點零幾。乘上這個數字，正午側光下厚雲的亮面才會落在一附近——
 * 與舊雲層的 cloudBrightness 同一個亮度，畫面不會因為換了雲整個變亮或變暗。
 *
 * 環境光那一份是天空從四面八方打進來的光，雲底幾乎全靠它
 */
const SUN_GAIN = 14
const AMBIENT_GAIN = 0.95

/*
 * 雲的高光為什麼要柔性壓縮（cloudSoftClip）
 *
 * 逆光時前向散射讓雲的亮度遠超過一，而主畫面是八位元的，超過一就截斷。
 * 雲邊很薄、不透明度只有一成，亮度卻有十倍時，預乘之後顏色照樣是一——
 * 雲邊一出現就是全白，沒有過渡，靠近太陽的雲像一張剪下來的白紙（踩過）。
 * 真實的銀邊是亮，但從雲邊往天空是漸淡的。
 *
 * 做法是先除回不透明度得到雲本身的亮度，超過零點七五的那一段用指數曲線
 * 收到一以內，再乘回不透明度。一般的亮面幾乎不動，逆光的薄邊則照著
 * 不透明度慢慢淡出去
 */

/**
 * 內部散射機率的強度
 *
 * 第一版用的是 Schneider 2015 的 powder（一減指數），
 * 只讓薄的雲邊暗一點，雲團之間的凹縫還是一樣亮，整朵看起來像棉花。
 * 換成 Nubis 2017 的「深度機率」：越淺、越稀的地方越不容易累積多次散射，
 * 雲團之間的縫因此暗下去，一球一球的花椰菜才浮出來；
 * 再乘上「垂直機率」讓雲底那一層也暗一點。
 * 逆光時不做（光是穿透過來的，不靠內部累積），這個數字是背光時的濃度
 */
const POWDER_STRENGTH = 0.75

/** 閃電一閃時雲被照亮多少，雷雨裡整片雲從裡面亮一下 */
const FLASH_GAIN = 0.9

/**
 * 地面反上來的光
 *
 * 庭園的地是白沙，反照率落在零點五到零點六（比一般草地的一兩成亮得多），
 * 晴天的雲底因此帶一層暖亮，那是雲「站在白地上」的證據。
 * 增益是補相位函數的正規化：與 SUN_GAIN 同一個道理，各向同性的相位只有 1 / 4π，
 * 不乘上去的話這一項小到看不見
 */
const GROUND_ALBEDO = 0.55
const GROUND_BOUNCE_GAIN = 1.4

/**
 * 風大時雲邊被撕碎的程度，以及層雲時雲邊被抹平的程度
 *
 * 前者是倍率：風最大的日子細節侵蝕與扭曲各加幾成。
 * 層雲要的是一整層柔和的毯子，邊緣不該有積雲那種花椰菜的缺口，所以侵蝕往下砍
 */
const TORN_EROSION_BOOST = 0.45
const TORN_SWIRL_BOOST = 0.6
const STRATUS_EROSION_CUT = 0.55

/** 下雨時高積雲也跟著變多，雨前天空先爬滿一層薄雲 */
const RAIN_ALTOCUMULUS_BOOST = 0.3

/**
 * 夜光雲：貼圖的頻率（每單位天球平面座標幾個週期）與最亮時的亮度
 *
 * 夜光雲是一層貼在天球上的銀藍色細絲（見 cloudNoctilucentLayer）：
 * 它高到不屬於這顆縮小的星球，用視線投影到一張平面上，不走球殼求交
 */
const NOCTILUCENT_FREQUENCY = 0.7
const NOCTILUCENT_BRIGHTNESS = 0.9

/**
 * 最短步距（格）
 *
 * 望向天頂時整段只有九十格，給滿步數會切成一格多一步，
 * 遠超過雲的細節需要的密度。步數改成「路徑長除以這個距離」，
 * 上下限是畫質給的步數的四成到全部：天頂省下一半以上，望向天邊時照樣走滿
 */
const MIN_STEP_LENGTH = 2.2

/**
 * 多遠以外省略細節雜訊與一半的光線步數（格）
 *
 * 六百格外一朵雲只剩十幾個像素，邊緣被啃出來的缺口幾乎看不見，
 * 又已經化進天色一大半。那裡每一步都少兩次三維取樣，
 * 而望向天邊的射線大部分的步數正好都落在這一段。
 *
 * 朝太陽的光線步數在兩種地方減半：這裡，以及視線已經穿進雲核
 * （透光率剩不到三成）之後——那些取樣點被前面的雲擋掉大半，
 * 對畫面的貢獻很小。改成局部覆蓋率、雲變多之後，這兩項省下的是
 * 多出來那十毫秒的一大半（內顯實測）
 */
const FAR_DETAIL_DISTANCE = 600

/**
 * 跳過空白時步距放大幾倍
 *
 * 天空大半是空的，第一版每一步都完整取樣，連空氣都要查三張圖。
 * 改成兩段式：在外面用三倍步距、只查天氣圖與基底（便宜的那一半）往前跳，
 * 一碰到雲就退回一大步、換回細步完整取樣；連續三步都是空的再切回大步。
 * 雲本身的步數一步都沒少，省下的全是空氣
 */
const COARSE_STEP_SCALE = 3

/**
 * 時間累積每一幀採用多少新值
 *
 * 越小越平滑、但雲變形時的拖影越長。一成五大約是七幀的記憶：
 * 雲現在自己會長會散（見 EVOLVE_RISE_SPEED），記憶太長會跟不上形狀的變化
 */
const HISTORY_CURRENT_WEIGHT = 0.15

/** 變異數裁切的寬度，越大越平滑、越容易留下拖影 */
const HISTORY_CLIP_GAMMA = 1.25

/** 鏡頭一幀跳超過這麼遠就當成傳送，舊的累積整個丟掉 */
const TELEPORT_DISTANCE = 30

/**
 * 地面雲影那張俯視圖
 *
 * 罩住鏡頭附近四百五十格見方，霧在兩百多格就收滿，再遠的影子看不到。
 * 兩百五十六格的圖，一格不到兩格寬，影子的邊本來就是軟的，夠用
 */
const SHADOW_MAP_SIZE = 256
const SHADOW_MAP_SPAN = 448
/** 鏡頭離上次算圖的中心超過圖寬的這個比例，就不等下一幀、當幀重算 */
const SHADOW_REFRESH_DISTANCE_RATIO = 0.2
/** 雲影的光學厚度打幾折，雲影比照著看到的雲淡一點才不會像墨跡 */
const SHADOW_DENSITY_SCALE = 1.6

/** 天空罩的邊長，要比陰天罩（250）小，排序時才不會被誤判成在它外面 */
const DOME_SIZE = 230

/**
 * 這一刻的雲該怎麼被照亮、天氣如何
 *
 * 與 aerial-perspective 的 airState 同一種寫法：放在模組上，
 * 日夜循環寫光、天氣系統寫天氣，算繪那一趟自己來讀。
 * 兩邊各寫各的欄位，誰先跑都不會互相蓋掉
 */
export const volumetricCloudState = {
  /** 光從哪裡來（指向光源），白天是太陽、夜裡是月亮 */
  lightDirection: new Vector3(0, 1, 0),
  /** 光的顏色，已經乘過這個時刻的亮度 */
  lightColor: new Color3(1, 1, 1),
  /** 雲頂吃到的天光 */
  ambientTop: new Color3(0.6, 0.7, 0.9),
  /** 雲底吃到的光：天空的側光與地面反上來的光 */
  ambientBottom: new Color3(0.5, 0.5, 0.5),
  /** 遠方化進去的顏色，用霧的基準色 */
  hazeColor: new Color3(0.9, 0.9, 0.9),
  /** 整片雲該露出多少，陰天罩與世界邊界會把它收到零 */
  visibleRatio: 1,
  /** 下雨的程度，雲變多、變暗 */
  rainRatio: 0,
  /** 閃電那一下有多亮 */
  flashRatio: 0,
  /**
   * 連續的日期：整數部分是第幾個遊戲日，小數部分是那一天的時刻
   *
   * 由日夜循環寫，每日天氣靠它抽籤與內插（見 cloud-daily-weather）
   */
  dayPosition: 0.45,
  /** 太陽的高度與方向（指向太陽）。夜光雲只在太陽剛沉到地平線下時亮，且只亮在太陽那一側 */
  sunHeight: 1,
  sunDirection: new Vector3(0, 1, 0),
}

/** 倒影材質的名字，水鏡靠它把材質找出來 */
export const CLOUD_REFLECTION_MATERIAL_NAME = 'cloud-reflection-material'

export interface VolumetricCloud {
  /** 水鏡倒影用的材質，見 water-mirror */
  reflectionMaterial: ShaderMaterial;
  dispose: () => void;
}

interface NoiseTextureSet {
  base: RawTexture3D;
  detail: RawTexture3D;
  weather: RawTexture;
  cirrus: RawTexture;
  /** 區域變化烘成的一張，見 createMacroMap */
  macro: RawTexture;
}

/** 這一幀要寫進著色器的值，三支效果與倒影材質共用同一份 */
interface FrameUniform {
  coverage: number;
  origin: Vector3;
  detailTime: number;
  /** 基底雜訊相對天氣圖的位移，見 EVOLVE_RISE_SPEED */
  evolve: Vector3;
  cameraPosition: Vector3;
  lightDirection: Vector3;
  lightColor: Color3;
  ambientTop: Color3;
  ambientBottom: Color3;
  flash: number;
  visibleRatio: number;
  /** 雲頂現在的高度，雲塔那天比 CLOUD_TOP 高 */
  top: number;
  /** 細節侵蝕與扭曲的強度，風大的日子與層雲的日子各往一邊推 */
  detailErosion: number;
  detailSwirl: number;
  stratusBlend: number;
  congestusBlend: number;
  altocumulusCoverage: number;
  cirrusCoverage: number;
  bounceColor: Color3;
  noctilucentAmount: number;
  sunAzimuth: Vector2;
}

function createNoiseTextureSet(scene: Scene, noiseSet: CloudNoiseSet): NoiseTextureSet {
  /**
   * 三維貼圖在這裡是安全的
   *
   * voxel-gi 當年改用二維圖集，是因為 sampler3D 撞上了
   * 「兩種型別的貼圖用到同一個材質單元」：那是一個掛在 StandardMaterial 上的外掛，
   * 有的材質綁了它、有的沒有，沒綁的取樣器預設落在零號單元，與別的二維貼圖相撞。
   *
   * 這裡的三支效果與兩份材質都是自己寫的，每一個取樣器每一次都綁齊，
   * 不存在「宣告了卻沒綁」的取樣器。而三維貼圖換到的是硬體的三線性內插
   * 與三軸重複定址——攤成圖集的話每次取樣要兩次讀取再自己內插，
   * 這裡一條射線要取上百次，差別是實打實的
   */
  const createVolume = (name: string, volume: CloudNoiseSet['base']) => {
    const texture = new RawTexture3D(
      volume.data,
      volume.size,
      volume.size,
      volume.size,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    )
    texture.name = name
    texture.wrapU = Texture.WRAP_ADDRESSMODE
    texture.wrapV = Texture.WRAP_ADDRESSMODE
    texture.wrapR = Texture.WRAP_ADDRESSMODE
    return texture
  }

  const weather = RawTexture.CreateRGBATexture(
    noiseSet.weather.data,
    noiseSet.weather.size,
    noiseSet.weather.size,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  weather.name = 'cloud-weather-map'
  weather.wrapU = Texture.WRAP_ADDRESSMODE
  weather.wrapV = Texture.WRAP_ADDRESSMODE

  const cirrus = RawTexture.CreateRGBATexture(
    noiseSet.cirrus.data,
    noiseSet.cirrus.size,
    noiseSet.cirrus.size,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  cirrus.name = 'cloud-cirrus-map'
  cirrus.wrapU = Texture.WRAP_ADDRESSMODE
  cirrus.wrapV = Texture.WRAP_ADDRESSMODE

  const macro = RawTexture.CreateRGBATexture(
    noiseSet.macro.data,
    noiseSet.macro.size,
    noiseSet.macro.size,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  )
  macro.name = 'cloud-macro-map'
  macro.wrapU = Texture.WRAP_ADDRESSMODE
  macro.wrapV = Texture.WRAP_ADDRESSMODE

  return {
    base: createVolume('cloud-base-noise', noiseSet.base),
    detail: createVolume('cloud-detail-noise', noiseSet.detail),
    weather,
    cirrus,
    macro,
  }
}

function createTarget(scene: Scene, name: string, width: number, height: number, type: number): RenderTargetTexture {
  const target = new RenderTargetTexture(
    name,
    { width, height },
    scene,
    false,
    true,
    type,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    false,
    false,
  )
  target.wrapU = Texture.CLAMP_ADDRESSMODE
  target.wrapV = Texture.CLAMP_ADDRESSMODE
  return target
}

/**
 * 建立體積雲
 *
 * 在場景建立時呼叫：天空罩要跟著其他天空的東西一起排好位置。
 * 雜訊要在 worker 裡算一秒多，那之前天空罩先關著，
 * 算好之後雲直接淡入，不會有一幀是壞的
 */
export function createVolumetricCloud(scene: Scene, skyOverlayGroup: number, domeName: string): VolumetricCloud {
  const engine = scene.getEngine()
  const { preset } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()

  /** 半浮點的目標不是每台機器都能畫，畫不了就退回八位元，銀邊那一點過曝會被截掉而已 */
  const targetType = engine.getCaps().textureHalfFloatRender
    ? Constants.TEXTURETYPE_HALF_FLOAT
    : Constants.TEXTURETYPE_UNSIGNED_BYTE
  reportDiagnostic('體積雲/目標格式', targetType === Constants.TEXTURETYPE_HALF_FLOAT ? '半浮點' : '八位元')

  let noiseTextureSet: NoiseTextureSet | null = null
  const noiseRequest = requestCloudNoise(NOISE_SIZE_OPTION, NOISE_SEED)
  noiseRequest.promise
    .then((noiseSet) => {
      if (scene.isDisposed)
        return
      noiseTextureSet = createNoiseTextureSet(scene, noiseSet)
    })
    .catch((error: unknown) => {
      reportDiagnostic('體積雲/雜訊生成', `失敗：${error instanceof Error ? error.message : String(error)}`)
    })

  const frame: FrameUniform = {
    coverage: CLEAR_COVERAGE,
    origin: new Vector3(),
    detailTime: 0,
    evolve: new Vector3(),
    cameraPosition: new Vector3(),
    lightDirection: new Vector3(0, 1, 0),
    lightColor: new Color3(),
    ambientTop: new Color3(),
    ambientBottom: new Color3(),
    flash: 0,
    visibleRatio: 1,
    top: CLOUD_TOP,
    detailErosion: DETAIL_EROSION,
    detailSwirl: DETAIL_SWIRL,
    stratusBlend: 0,
    congestusBlend: 0,
    altocumulusCoverage: 0,
    cirrusCoverage: CIRRUS_COVERAGE,
    bounceColor: new Color3(),
    noctilucentAmount: 0,
    sunAzimuth: new Vector2(1, 0),
  }

  /** 今天的天氣，每幀重算（便宜：幾個內插），用的是模組內快取的每日亂數 */
  const dailyWeather = createDailyWeather()
  const cloudWeather = createCloudWeather()
  /** 風吹過的總距離：風速每天不同，不能再用「風速乘經過時間」，否則換天時整片雲會跳 */
  let windTravel = 0

  function applyCloudUniforms(effect: Effect, lightDirection: Vector3 = frame.lightDirection): void {
    if (!noiseTextureSet)
      return

    effect.setTexture('cloudBaseSampler', noiseTextureSet.base)
    effect.setTexture('cloudDetailSampler', noiseTextureSet.detail)
    effect.setTexture('cloudWeatherSampler', noiseTextureSet.weather)
    effect.setTexture('cloudCirrusSampler', noiseTextureSet.cirrus)
    effect.setTexture('cloudMacroSampler', noiseTextureSet.macro)
    effect.setFloat4('cloudLayer', CLOUD_BOTTOM, frame.top, PLANET_RADIUS, 0)
    effect.setFloat4('cloudShape', frame.coverage, EXTINCTION, ALBEDO, CLOUD_SKEW)
    effect.setFloat4(
      'cloudScale',
      1 / BASE_NOISE_PERIOD,
      1 / DETAIL_NOISE_PERIOD,
      1 / WEATHER_MAP_PERIOD,
      frame.detailErosion,
    )
    effect.setFloat4('cloudOrigin', frame.origin.x, frame.origin.y, frame.origin.z, frame.detailTime)
    effect.setVector3('cloudSunDirection', lightDirection)
    effect.setColor3('cloudSunColor', frame.lightColor)
    effect.setColor3('cloudAmbientTop', frame.ambientTop)
    effect.setColor3('cloudAmbientBottom', frame.ambientBottom)
    effect.setColor3('cloudHazeColor', volumetricCloudState.hazeColor)
    effect.setFloat4('cloudHaze', HAZE_DISTANCE, FADE_START, FADE_END, 1)
    effect.setFloat4('cloudCirrus', CIRRUS_HEIGHT, frame.cirrusCoverage, CIRRUS_OPACITY, 1 / CIRRUS_PERIOD)
    effect.setFloat4('cloudLighting', SUN_GAIN, AMBIENT_GAIN, POWDER_STRENGTH, frame.flash)
    effect.setVector3('cloudCameraPosition', frame.cameraPosition)
    effect.setFloat2('cloudWindDirection', WIND_DIRECTION.x, WIND_DIRECTION.z)
    effect.setFloat4('cloudMarchSetting', MIN_STEP_LENGTH, FAR_DETAIL_DISTANCE, COARSE_STEP_SCALE, 0)
    effect.setFloat4('cloudEvolve', frame.evolve.x, frame.evolve.y, frame.evolve.z, frame.detailSwirl)
    effect.setFloat3(
      'cloudWeather',
      frame.stratusBlend,
      frame.congestusBlend,
      (frame.top - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM),
    )
    effect.setFloat4(
      'cloudAltocumulus',
      ALTOCUMULUS_BOTTOM,
      ALTOCUMULUS_TOP,
      frame.altocumulusCoverage,
      ALTOCUMULUS_EXTINCTION_SCALE,
    )
    effect.setFloat4(
      'cloudWindShift',
      frame.origin.x - worldShift.x,
      frame.origin.z - worldShift.z,
      worldShift.x,
      worldShift.z,
    )
    effect.setColor3('cloudBounceColor', frame.bounceColor)
    effect.setFloat4('cloudNoctilucent', frame.noctilucentAmount, NOCTILUCENT_FREQUENCY, frame.sunAzimuth.x, frame.sunAzimuth.y)
  }

  const effectRenderer = new EffectRenderer(engine)
  const createWrapper = (name: string, fragmentShader: string, uniformNameList: string[], samplerNameList: string[]) =>
    new EffectWrapper({
      engine,
      name,
      vertexShader: CLOUD_FULLSCREEN_VERTEX,
      fragmentShader,
      attributeNames: ['position'],
      uniformNames: [...CLOUD_UNIFORM_NAME_LIST, ...uniformNameList],
      samplerNames: [...CLOUD_SAMPLER_NAME_LIST, ...samplerNameList],
    })

  const marchWrapper = createWrapper('minespace-cloud-march', CLOUD_MARCH_FRAGMENT, ['inverseViewProjection', 'marchSetting'], [])
  const resolveWrapper = createWrapper(
    'minespace-cloud-resolve',
    CLOUD_RESOLVE_FRAGMENT,
    ['inverseViewProjection', 'previousViewProjection', 'cloudShift', 'resolveSetting'],
    ['currentSampler', 'historySampler'],
  )
  const shadowWrapper = createWrapper('minespace-cloud-shadow', CLOUD_SHADOW_FRAGMENT, ['shadowArea'], [])

  /**
   * 三張降解析度的圖：這一幀的行進結果，以及輪流讀寫的兩張累積
   *
   * 三張都是畫質給的解析度，每一格每一幀都重新行進（棋盤重建拿掉的理由見 CLOUD_MARCH_FRAGMENT）
   */
  let targetWidth = 1
  let targetHeight = 1
  const currentTarget = createTarget(scene, 'cloud-current', targetWidth, targetHeight, targetType)
  let historyRead = createTarget(scene, 'cloud-history-a', targetWidth, targetHeight, targetType)
  let historyWrite = createTarget(scene, 'cloud-history-b', targetWidth, targetHeight, targetType)
  const shadowTarget = createTarget(scene, 'cloud-shadow-map', SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, Constants.TEXTURETYPE_UNSIGNED_BYTE)

  const compositeSetting = new Vector4()
  const compositeTexelSize = new Vector2()
  const inverseViewProjection = new Matrix()
  const previousViewProjection = new Matrix()
  const previousCameraPosition = new Vector3()
  const previousOrigin = new Vector3()
  const cloudShift = new Vector3()
  /** 循環世界的平移累積，雲的座標靠它才是連續的 */
  const worldShift = new Vector3()
  let hasPreviousFrame = false
  let shouldResetHistory = true
  let elapsed = 0
  let frameIndex = 0

  /** 雲影俯視圖罩在哪裡，綁定時讀；隔幀才更新，所以是「上一次算圖時」的位置 */
  const shadowArea = { centerX: 0, centerZ: 0 }
  let hasShadowMap = false

  /**
   * 三支效果的綁定各掛一次
   *
   * 每一幀要換的值都從閉包裡的狀態讀。不要每幀清掉觀察者再重掛：
   * EffectWrapper 自己在 onApplyObservable 上掛了預設的綁定，一清就一起清掉了
   */
  marchWrapper.onApplyObservable.add(() => {
    const effect = marchWrapper.effect
    applyCloudUniforms(effect)
    effect.setMatrix('inverseViewProjection', inverseViewProjection)
    effect.setFloat4('marchSetting', preset.value.cloudStepCount, preset.value.cloudLightStepCount, frameIndex, 0)
  })
  resolveWrapper.onApplyObservable.add(() => {
    const effect = resolveWrapper.effect
    applyCloudUniforms(effect)
    effect.setTexture('currentSampler', currentTarget)
    effect.setTexture('historySampler', historyRead)
    effect.setMatrix('inverseViewProjection', inverseViewProjection)
    effect.setMatrix('previousViewProjection', previousViewProjection)
    effect.setVector3('cloudShift', cloudShift)
    effect.setFloat4(
      'resolveSetting',
      shouldResetHistory ? 1 : HISTORY_CURRENT_WEIGHT,
      1 / targetWidth,
      1 / targetHeight,
      HISTORY_CLIP_GAMMA,
    )
  })
  shadowWrapper.onApplyObservable.add(() => {
    const effect = shadowWrapper.effect
    applyCloudUniforms(effect, getCloudShadowLightDirection())
    effect.setFloat4('shadowArea', shadowArea.centerX, shadowArea.centerZ, SHADOW_MAP_SPAN, SHADOW_DENSITY_SCALE)
  })

  /** 天空罩：把累積好的雲貼回主畫面 */
  EffectStore.ShadersStore.minespaceCloudDomeVertexShader = CLOUD_DOME_VERTEX
  EffectStore.ShadersStore.minespaceCloudCompositeFragmentShader = CLOUD_COMPOSITE_FRAGMENT
  EffectStore.ShadersStore.minespaceCloudReflectionFragmentShader = CLOUD_REFLECTION_FRAGMENT

  const compositeMaterial = new ShaderMaterial(
    'cloud-composite-material',
    scene,
    { vertex: 'minespaceCloudDome', fragment: 'minespaceCloudComposite' },
    {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'compositeSetting', 'cloudTexelSize'],
      samplers: ['cloudSampler'],
      needAlphaBlending: true,
    },
  )
  const reflectionMaterial = new ShaderMaterial(
    CLOUD_REFLECTION_MATERIAL_NAME,
    scene,
    { vertex: 'minespaceCloudDome', fragment: 'minespaceCloudReflection' },
    {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'compositeSetting', ...CLOUD_UNIFORM_NAME_LIST],
      samplers: [...CLOUD_SAMPLER_NAME_LIST],
      needAlphaBlending: true,
    },
  )

  for (const material of [compositeMaterial, reflectionMaterial]) {
    /** 輸出是預乘過的顏色，見 CLOUD_COMPOSITE_FRAGMENT */
    material.alphaMode = Constants.ALPHA_PREMULTIPLIED
    material.backFaceCulling = false
    material.disableDepthWrite = true
    /** 頂點把深度壓在遠平面上（剛好等於一），要用小於等於才過得了清除後的深度 */
    material.depthFunction = Constants.LEQUAL
    material.fogEnabled = false
  }

  reflectionMaterial.onBindObservable.add(() => {
    const effect = reflectionMaterial.getEffect()
    if (!effect)
      return
    applyCloudUniforms(effect)
    effect.setFloat4('compositeSetting', 0, 0, frame.visibleRatio, 0)
  })

  const dome: Mesh = MeshBuilder.CreateBox(domeName, { size: DOME_SIZE }, scene)
  dome.material = compositeMaterial
  dome.infiniteDistance = true
  dome.isPickable = false
  dome.receiveShadows = false
  dome.renderingGroupId = skyOverlayGroup
  /** 排在陰天罩前面畫，陰天時灰罩才蓋得住雲（陰天罩的 alphaIndex 是預設的最大值） */
  dome.alphaIndex = 0
  dome.setEnabled(false)
  optOutOfFog(dome, '自己在著色器裡化進天色，再由 use-weather 的 visibleRatio 淡到全透明')

  /** 解析度跟著畫質與視窗大小走，換了就把累積丟掉 */
  function syncTargetSize(): void {
    const ratio = preset.value.cloudResolutionRatio
    const width = Math.max(1, Math.round(engine.getRenderWidth() * ratio))
    const height = Math.max(1, Math.round(engine.getRenderHeight() * ratio))
    if (width === targetWidth && height === targetHeight)
      return

    targetWidth = width
    targetHeight = height
    for (const target of [currentTarget, historyRead, historyWrite]) {
      target.resize({ width, height })
    }
    shouldResetHistory = true
    reportDiagnostic('體積雲/行進解析度', `${width}×${height}`)
  }

  /**
   * 追蹤循環世界的平移
   *
   * 走出邊界時鏡頭會被平移一整個世界寬（見 use-fps-controller 的 wrapAxis）。
   * 雲的週期與世界無關，不跟著補回來的話，那一瞬間頭頂的雲整片換掉。
   * 邊界上霧濃到看不見天，換掉其實也看不出來；但地上的雲影與累積的歷史
   * 都會跳一下，補回來最乾淨
   */
  function trackWorldWrap(position: Vector3): void {
    if (!hasPreviousFrame)
      return

    const deltaX = position.x - previousCameraPosition.x
    const deltaZ = position.z - previousCameraPosition.z
    const wrapX = Math.round(deltaX / WORLD_SIZE)
    const wrapZ = Math.round(deltaZ / WORLD_SIZE)
    worldShift.x -= wrapX * WORLD_SIZE
    worldShift.z -= wrapZ * WORLD_SIZE

    const remainX = deltaX - wrapX * WORLD_SIZE
    const remainZ = deltaZ - wrapZ * WORLD_SIZE
    const remainY = position.y - previousCameraPosition.y
    if (Math.hypot(remainX, remainY, remainZ) > TELEPORT_DISTANCE) {
      shouldResetHistory = true
    }
  }

  /** 把日夜與天氣寫進來的狀態合成這一幀要用的值 */
  function updateFrameUniform(position: Vector3, deltaSecond: number): void {
    const state = volumetricCloudState
    const darkness = 1 - state.rainRatio * 0.55

    sampleDailyWeather(state.dayPosition, dailyWeather)
    deriveCloudWeather(dailyWeather, Math.floor(state.dayPosition), cloudWeather)

    frame.coverage = Math.min(0.95, CLEAR_COVERAGE + cloudWeather.coverageOffset + state.rainRatio * RAIN_COVERAGE_BOOST)
    frame.stratusBlend = cloudWeather.stratusBlend
    frame.congestusBlend = cloudWeather.congestusBlend
    frame.top = CLOUD_TOP + CLOUD_TOWER_EXTRA_HEIGHT * cloudWeather.congestusBlend
    frame.detailErosion = DETAIL_EROSION
      * (1 + TORN_EROSION_BOOST * cloudWeather.tornFactor)
      * (1 - STRATUS_EROSION_CUT * cloudWeather.stratusBlend)
    frame.detailSwirl = DETAIL_SWIRL * (1 + TORN_SWIRL_BOOST * cloudWeather.tornFactor)
    frame.altocumulusCoverage = Math.min(
      1,
      cloudWeather.altocumulusCoverage * ALTOCUMULUS_COVERAGE_SCALE + state.rainRatio * RAIN_ALTOCUMULUS_BOOST,
    )
    frame.cirrusCoverage = CIRRUS_COVERAGE * cloudWeather.cirrusScale

    windTravel += WIND_SPEED * cloudWeather.windSpeedScale * deltaSecond
    frame.origin.set(
      worldShift.x - WIND_DIRECTION.x * windTravel,
      0,
      worldShift.z - WIND_DIRECTION.z * windTravel,
    )
    frame.detailTime = elapsed * DETAIL_EVOLVE_SPEED
    /** 雲頂往上翻騰，取樣點就往下走；側向逆著風，雲團才是在重組而不是跟著風跑 */
    frame.evolve.set(
      WIND_DIRECTION.x * EVOLVE_DRIFT_SPEED * elapsed,
      -EVOLVE_RISE_SPEED * elapsed,
      WIND_DIRECTION.z * EVOLVE_DRIFT_SPEED * elapsed,
    )
    frame.cameraPosition.copyFrom(position)
    frame.lightDirection.copyFrom(state.lightDirection).normalize()
    frame.lightColor.copyFrom(state.lightColor).scaleToRef(darkness * (1 - state.rainRatio * 0.3), frame.lightColor)
    state.ambientTop.scaleToRef(darkness, frame.ambientTop)
    state.ambientBottom.scaleToRef(darkness, frame.ambientBottom)
    frame.flash = state.flashRatio * FLASH_GAIN
    frame.visibleRatio = Math.min(1, Math.max(0, state.visibleRatio))

    /**
     * 地面反上來的光：只看直射光那一份
     *
     * 天空反上來的那份已經在雲底的環境光裡（use-day-night 的 ambientBottom）。
     * 白沙反照率高，正午最亮；太陽壓低時地面接到的光與 cos 成正比一起暗下去，
     * 所以乘的是太陽高度而不是一個常數
     */
    const sunLift = Math.max(0, frame.lightDirection.y)
    frame.lightColor.scaleToRef(
      SUN_GAIN * GROUND_ALBEDO * sunLift * GROUND_BOUNCE_GAIN / (4 * Math.PI),
      frame.bounceColor,
    )

    /**
     * 夜光雲只在太陽剛沉到地平線下的那一小段時間看得到
     *
     * 它在八十多公里的高空，那時天空已經暗了，那裡的冰晶還照得到太陽。
     * 太陽再沉深一些，連它也暗下去；所以是一個窗口，兩端都淡出
     */
    const sunDepth = -state.sunHeight
    const twilightWindow = SmoothStep(0, 1, InverseLerp(0.06, 0.12, sunDepth))
      * (1 - SmoothStep(0, 1, InverseLerp(0.24, 0.32, sunDepth)))
    frame.noctilucentAmount = cloudWeather.noctilucentRarity * twilightWindow * NOCTILUCENT_BRIGHTNESS * (1 - state.rainRatio)
    const azimuthLength = Math.hypot(state.sunDirection.x, state.sunDirection.z)
    if (azimuthLength > 0.0001) {
      frame.sunAzimuth.set(state.sunDirection.x / azimuthLength, state.sunDirection.z / azimuthLength)
    }
  }

  /**
   * 雲影隔一幀才重算一次
   *
   * 雲影是軟邊、變化慢的東西（風一秒才挪一兩格），每幀重算十六步的整張圖是白花錢。
   * 沒輪到的那一幀沿用上一張圖，連同它當時的中心一起交給地面外掛：
   * 圖與中心必須是同一組，否則走路時影子會往反方向滑一格。
   * 剛開始畫、被傳送、或離上次的中心太遠（循環世界換邊）時不能等，當幀就重算
   */
  function renderShadowMap(): void {
    const texel = SHADOW_MAP_SPAN / SHADOW_MAP_SIZE
    const isFarFromCenter = Math.hypot(
      frame.cameraPosition.x - shadowArea.centerX,
      frame.cameraPosition.z - shadowArea.centerZ,
    ) > SHADOW_MAP_SPAN * SHADOW_REFRESH_DISTANCE_RATIO
    const shouldRender = !hasShadowMap || shouldResetHistory || isFarFromCenter || frameIndex % 2 === 0

    if (shouldRender) {
      /** 中心對齊到圖的格子上，走路時影子邊緣才不會一格一格地爬（與陰影追蹤同一個道理） */
      shadowArea.centerX = Math.round(frame.cameraPosition.x / texel) * texel
      shadowArea.centerZ = Math.round(frame.cameraPosition.z / texel) * texel
      effectRenderer.render(shadowWrapper, shadowTarget)
      hasShadowMap = true
    }

    setCloudShadowMap({
      texture: shadowTarget,
      centerX: shadowArea.centerX,
      centerZ: shadowArea.centerZ,
      inverseSpan: 1 / SHADOW_MAP_SPAN,
      height: CLOUD_BOTTOM,
      visibleRatio: frame.visibleRatio,
    })
  }

  function renderClouds(): void {
    const camera = scene.activeCamera
    if (!camera)
      return

    const isVisible = !!noiseTextureSet
      && devToggle.volumetricCloud
      && volumetricCloudState.visibleRatio > 0.001
      && marchWrapper.isReady()
      && resolveWrapper.isReady()
      && shadowWrapper.isReady()

    if (!isVisible) {
      dome.setEnabled(false)
      setCloudShadowMap(null)
      hasShadowMap = false
      shouldResetHistory = true
      return
    }

    const position = camera.globalPosition
    const deltaSecond = Math.min(0.1, engine.getDeltaTime() / 1000)
    elapsed += deltaSecond
    frameIndex = (frameIndex + 1) % 64

    syncTargetSize()
    trackWorldWrap(position)
    updateFrameUniform(position, deltaSecond)

    scene.getTransformMatrix().invertToRef(inverseViewProjection)

    renderShadowMap()

    effectRenderer.render(marchWrapper, currentTarget)

    cloudShift.copyFrom(frame.origin).subtractInPlace(previousOrigin)
    effectRenderer.render(resolveWrapper, historyWrite)

    compositeMaterial.setTexture('cloudSampler', historyWrite)
    compositeSetting.set(1 / engine.getRenderWidth(), 1 / engine.getRenderHeight(), frame.visibleRatio, 0)
    compositeMaterial.setVector4('compositeSetting', compositeSetting)
    compositeTexelSize.set(1 / targetWidth, 1 / targetHeight)
    compositeMaterial.setVector2('cloudTexelSize', compositeTexelSize)
    dome.setEnabled(true)

    /** 這一幀寫好的那張，下一幀就是要讀的舊值 */
    const resolvedTarget = historyWrite
    historyWrite = historyRead
    historyRead = resolvedTarget

    /**
     * 把視埠還給主鏡頭
     *
     * EffectRenderer 畫進降解析度的圖時，會把視埠設成那張圖的大小，
     * 畫完也不還原。後製鏈接手時不一定重設視埠，
     * 主畫面就只畫進左下角那一小塊（踩過：整個世界縮在左下四分之一）
     */
    engine.setViewport(camera.viewport)

    previousViewProjection.copyFrom(scene.getTransformMatrix())
    previousCameraPosition.copyFrom(position)
    previousOrigin.copyFrom(frame.origin)
    hasPreviousFrame = true
    shouldResetHistory = false
  }

  /**
   * 掛在「算繪目標都畫完之後」
   *
   * 這個時間點主鏡頭的矩陣已經是這一幀的，水鏡與陰影那些算繪目標也畫完了，
   * 主畫面還沒開始畫。在這裡把三趟畫進自己的目標，
   * 接下來後製鏈的第一支會重新綁上主畫面的緩衝區（PostProcessManager._prepareFrame），
   * 不必自己還原
   */
  const renderObserver = scene.onAfterRenderTargetsRenderObservable.add(() => {
    measureSection('體積雲', renderClouds)
  })

  const stopQualityWatch = watch(preset, () => {
    shouldResetHistory = true
  })

  function dispose(): void {
    noiseRequest.cancel()
    stopQualityWatch()
    scene.onAfterRenderTargetsRenderObservable.remove(renderObserver)
    setCloudShadowMap(null)
    effectRenderer.dispose()
    marchWrapper.dispose()
    resolveWrapper.dispose()
    shadowWrapper.dispose()
    for (const target of [currentTarget, historyRead, historyWrite, shadowTarget]) {
      target.dispose()
    }
    noiseTextureSet?.base.dispose()
    noiseTextureSet?.detail.dispose()
    noiseTextureSet?.weather.dispose()
    noiseTextureSet?.cirrus.dispose()
    noiseTextureSet?.macro.dispose()
  }

  scene.onDisposeObservable.addOnce(dispose)

  return { reflectionMaterial, dispose }
}
