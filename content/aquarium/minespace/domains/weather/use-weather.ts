import type { DynamicTexture, Scene, StandardMaterial, UniversalCamera } from '@babylonjs/core'
import type { GardenId } from '../garden/garden-layout'
import type { RealmWeatherLevel } from '../realm/realm-definition'
import type { Weather } from '../soundscape/type'
import type { WaterMap } from '../world/water-body'
import type { AirMotes } from './air-motes'
import type { AtmosphereState } from './atmosphere'
import type { FallingLeaves } from './falling-leaves'
import type { GroundMist } from './ground-mist'
import type { RainParticles } from './rain-particles'
import type { SnowParticles } from './snow-particles'
import type { SwampMist } from './swamp-mist'
import type { Wetness } from './wetness'
import { Color3 } from '@babylonjs/core'
import { onScopeDispose, ref } from 'vue'
import {
  getOvercastMaterial,
  getSkyMaterial,
} from '../../composables/use-babylon-scene'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { measureSection } from '../../composables/use-performance-probe'
import { getGarden } from '../garden/garden-layout'
import {
  activeRealmState,
  applyRealmColor,
  applyRealmNumber,
  getRealmGroundMistRatio,
  hasRealmFogOrLight,
} from '../realm/active-realm'
import { getRealm } from '../realm/realm-list'
import { realmTransitionState } from '../realm/realm-transition'
import { createAirMotes } from './air-motes'
import {
  CLEAR_ATMOSPHERE,
  createAtmosphereState,
  GARDEN_FOG_COLOR,
  JIGOKU_ATMOSPHERE,
  RAIN_ATMOSPHERE,
  SNOW_ATMOSPHERE,
  SWAMP_ATMOSPHERE,
} from './atmosphere'
import { createFallingLeaves, HUB_LEAF_AREA } from './falling-leaves'
import { createGroundMist, getDawnMistRatio } from './ground-mist'
import { createRainParticles } from './rain-particles'
import { applySkyGradient } from './sky-gradient'
import { createSkyReflectionTexture, SKY_REFLECTION_UPDATE_INTERVAL, updateSkyReflectionTexture } from './sky-reflection'
import { createSnowParticles } from './snow-particles'
import { createSwampMist, HUB_MIST_AREA, measureMistDensity } from './swamp-mist'
import { volumetricCloudState } from './volumetric-cloud/volumetric-cloud'
import { createWetness } from './wetness'

/**
 * 常年下雨的區域
 *
 * 天氣不是全域的，而是綁在箱庭上：雨只下在那幾座木座那一小塊，
 * 走進去就淋雨，走出來就放晴。
 * 白沙地永遠是乾的、亮的，遠遠看過去只有那幾座上面壓著一團灰——
 * 對比拉開了，那些箱庭才有它們存在的理由。
 *
 * 兩座雨區給的是同一場雨的兩種身分：
 * 聽雨亭沒有屋頂，走進去就是淋在身上；
 * 雨聽堂有屋頂，走進去是聽著雨而自己是乾的。
 * 同一套天氣，因為造景不同而成為兩件事。
 *
 * 共用的只有看得到的那一半：雨絲、陰天、霧、地濕。
 * 聲音一律不共用，各庭在 sound-data 自己種。
 * 這裡曾經掛過一道全域的雨聲，兩座雨區聽起來因此一模一樣——
 * 那道雨底一響，箱庭自己種的雨就被蓋掉了，
 * 「兩種身分」只剩畫面上成立。雨聲要各種各的，這條不要再破
 */
function createWeatherZone(gardenId: GardenId, falloff: number, fullRadiusInset = 2) {
  const garden = getGarden(gardenId)

  return {
    x: garden.center.x,
    z: garden.center.z,
    /**
     * 滿檔的半徑收在木座裡面
     *
     * 這裡原本是 halfSize + 1，也就是「站上木座就已經是傾盆大雨」。
     * 配上寬得多的過渡帶，實際效果是人還離十幾格遠雨就下起來了——
     * 走過去的那一段變成「雨中的空白沙地」，而那不是任何一座箱庭。
     *
     * 收到木座內兩格：踏上甲板時雨勢還在漲，走到造景中間才滿檔。
     *
     * 吹雪野是例外，它把這個內縮設成零。那座箱庭的主題就是
     * 「站在裡面什麼都看不到」，留兩格的漲勢等於木座外圈永遠不滿檔，
     * 而那圈剛好是最容易望出去看到鄰居的地方
     */
    innerRadius: Math.max(2, garden.halfSize - fullRadiusInset),
    /** 超過這個半徑就完全放晴 */
    outerRadius: garden.halfSize + falloff,
  }
}

/**
 * 過渡帶只留四格
 *
 * 原本給到十四格，那是照著大箱庭的尺度抓的，
 * 而這座木座只有七格半邊長——雨因此在兩倍木座遠的地方就開始下。
 * 收到四格：走到木座邊緣才開始飄雨，跨上甲板時已經下起來了
 */
const RAINVALE_ZONE = createWeatherZone('rainvale', 4)

/**
 * 收得比聽雨亭緊
 *
 * 這座的重點在屋簷下那一圈，雨要下得剛好蓋住屋子與滴水線。
 * 攤太開的話，從外面走過來時屋子還沒進到眼裡就已經在淋雨，
 * 「進屋躲雨」那一下的對比就沒了
 */
const RAINHALL_ZONE = createWeatherZone('rainhall', 3)

const RAIN_ZONE_LIST = [RAINVALE_ZONE, RAINHALL_ZONE]

/**
 * 暴風雪只颳在雪聽庭上
 *
 * 與雨同一套：天氣在這個世界裡是在地的，不是全域隨機的。
 * 過渡帶收得比聽雨亭緊——暴風雪要有「一腳踏進去」的那一下，
 * 攤太開會變成整片天空都在下雪，那就不是一座箱庭的事了。
 *
 * 兩個參數要一起看。內縮給零是要整座木座都滿檔（外圈才不會望得到鄰居），
 * 而滿檔的半徑一旦推到木座邊緣，過渡帶就整段落在木座外面——
 * 留三格的話，走下木座還要再走三格雪才停，
 * 那三格是空白的沙地，看起來就是「雪跟著我出來了」。
 * 收到一格半：踏出木座的那一步雪就開始收，再一步就沒了
 */
const BLIZZARD_ZONE = createWeatherZone('blizzard', 1.5, 0)

/**
 * 打雷只發生在聽雨亭
 *
 * 雷是一場大雨的戲劇性，屬於那座露天的、淋在身上的箱庭。
 * 雨聽堂要的是坐著聽雨那種安穩，一聲驚雷會把它整個打散——
 * 同一場雨，兩座箱庭本來就該是兩件事
 */
const THUNDER_ZONE = RAINVALE_ZONE

/**
 * 終年起霧的沼澤
 *
 * 與雨區同一套做法，也收在自己的木座上：
 * 走上蛙聲澤的木棧道，能見度會一路收到只剩十幾格
 */
const MIST_GARDEN = getGarden('swamp')
export const MIST_ZONE = {
  x: MIST_GARDEN.center.x,
  z: MIST_GARDEN.center.z,
  innerRadius: MIST_GARDEN.halfSize - 2,
  outerRadius: MIST_GARDEN.halfSize + 10,
}

/**
 * 地獄谷的熱氣範圍
 *
 * 與蛙聲澤同一套做法。過渡帶留八格：從外面走過來時，
 * 顏色與能見度在踏上木座之前就開始變，
 * 「愈走愈熱」那一段路本身就是這座箱庭的一部分
 */
const JIGOKU_GARDEN = getGarden('jigoku')
export const JIGOKU_ZONE = {
  x: JIGOKU_GARDEN.center.x,
  z: JIGOKU_GARDEN.center.z,
  innerRadius: JIGOKU_GARDEN.halfSize - 2,
  outerRadius: JIGOKU_GARDEN.halfSize + 8,
}

/** 超過這個雨勢就算「在雨中」，鳥與蟲會躲起來 */
const RAIN_WEATHER_THRESHOLD = 0.45
/** 雷聲間隔範圍（秒） */
const THUNDER_RANGE_SECOND: [number, number] = [35, 90]
/** 一次閃光持續多久（秒） */
const FLASH_DURATION_SECOND = 0.35
/**
 * 閃光到雷聲的間隔範圍（秒）
 *
 * 光是瞬間到的，聲音一秒只走三百多公尺。
 * 兩者同時發生反而不像打雷，像有人在按開關。
 * 遠方的雷拖得久、聲音悶；就在頭頂的幾乎是閃完就炸
 */
const THUNDER_DELAY_RANGE_SECOND: [number, number] = [0.4, 3.4]

/**
 * 淋濕的速度（每秒）
 *
 * 走進雨裡兩秒左右就濕透了。這一段不必慢——
 * 站在傾盆大雨裡而地還是乾的，那才奇怪
 */
const WET_SOAK_SPEED = 0.5

/**
 * 乾掉的速度（每秒）
 *
 * 這一段要慢，慢才是重點。走出聽雨亭之後
 * 腳下的木板還濕著、過了大半分鐘才恢復原本的顏色——
 * 那半分鐘就是「剛剛下過雨」唯一說得出口的證據
 */
const WET_DRY_SPEED = 1 / 45

/**
 * 灰罩蓋到幾成不透明時，雲要已經完全不見
 *
 * 方塊雲的年代這是硬性條件：那時的雲有深度預寫，只要還在就會在灰罩上
 * 挖出一塊沒被蓋到的洞。體積雲一筆深度都不寫、又排在灰罩前面畫，
 * 洞不會再出現了。
 *
 * 留著它是為了效能：體積雲是全場最貴的一項，雲一淡到零就整個不跑。
 * 灰罩蓋到六成時底下的雲已經幾乎看不出來，那之後還在行進是白花錢。
 *
 * 給 0.6 而不是 1：留四成的餘裕讓灰罩安靜地補上最後那一段，
 * 人不會看到「雲剛好在天要暗下來的同一刻消失」這種巧合
 */
const CLOUD_VANISH_AT_OVERCAST = 0.6

interface StartParams {
  scene: Scene;
  camera: UniversalCamera;
  /** 是否躲在洞裡，躲雨時不畫雨 */
  isSheltered: () => boolean;
  /**
   * 把聽雨亭那顆雷叫出來
   *
   * 閃電是這裡的事，雷聲不是。聲音種在 sound-data，
   * 天氣系統只在閃光之後隔一段時間通知它該響了
   */
  playThunder: (volume: number) => void;
  /** 從天空往指定格柱打射線，取得雨滴打到的表面高度，落地水花濺在這裡 */
  castRainRay: (blockX: number, blockZ: number) => number | null;
  /**
   * 世界上的水在哪裡，打在水面上的雨滴要多畫一圈漣漪
   *
   * 給函式：換場景時世界整個換掉，天氣系統卻是同一份
   */
  getWaterMap: () => WaterMap;
  /** 白晝的程度，0 為全暗、1 為大白天。空氣裡飄什麼要看它 */
  getDayRatio: () => number;
  /** 這一刻是幾點，晨霧只在天亮前後那一段出現 */
  getTimeOfDay: () => number;
  /** 淋得濕的方塊材質，雨停之後要慢慢乾回去。換場景時改用 setWorld */
  wetMaterialList: StandardMaterial[];
}

/** 範圍收在零以上的數值欄位，霧距與光的倍率都不能是負的 */
const NON_NEGATIVE_RANGE = { min: 0 }

/** 依距離算出區域效果的強度，0 為完全在外、1 為正中心 */
function measureZoneRatio(
  x: number,
  z: number,
  zone: { x: number; z: number; innerRadius: number; outerRadius: number },
): number {
  const distance = Math.hypot(x - zone.x, z - zone.z)
  const { innerRadius, outerRadius } = zone

  if (distance <= innerRadius)
    return 1
  if (distance >= outerRadius)
    return 0

  const ratio = 1 - (distance - innerRadius) / (outerRadius - innerRadius)
  /** 平滑一下，走進去的過程才不會像跨過一條線 */
  return ratio * ratio * (3 - 2 * ratio)
}

/** 依所在位置算出霧氣濃度，0 為清朗、1 為濃霧 */
export function getMistRatio(x: number, z: number): number {
  return measureZoneRatio(x, z, MIST_ZONE)
}

/** 依所在位置算出地獄谷的熱氣強度，0 為完全在外、1 為谷底正中 */
export function getJigokuRatio(x: number, z: number): number {
  return measureZoneRatio(x, z, JIGOKU_ZONE)
}

/**
 * 依所在位置算出雨勢，0 為晴天、1 為大雨
 *
 * 取所有雨區裡最強的那一個。兩座隔得夠遠不會重疊，
 * 取最大值只是為了「日後再加一座也不必改這裡」
 */
export function getRainRatio(x: number, z: number): number {
  let strongest = 0

  for (const zone of RAIN_ZONE_LIST) {
    strongest = Math.max(strongest, measureZoneRatio(x, z, zone))
  }

  return strongest
}

/**
 * 依所在位置算出雪勢，0 為晴天、1 為暴風雪
 *
 * 只有一區，不必像雨那樣取最大值。日後真要再加一座雪庭，
 * 照著雨那邊改成清單就好
 */
export function getSnowRatio(x: number, z: number): number {
  return measureZoneRatio(x, z, BLIZZARD_ZONE)
}

/**
 * 大場景整片的雨（雪）勢此刻多強，沒給就是零
 *
 * 延伸聽雨亭、雨聽堂、吹雪野的大場景整片都在那場天氣裡（RealmDefinition 的 weather），
 * 雨勢不看站在哪、看時間：兩道週期互質的正弦疊起來，在 min 與 max 之間慢慢起落，
 * 雨一陣大一陣小，暴風雪偶爾鬆開一點、看得到十幾格外的燈籠
 */
export function measureRealmWeatherLevel(level: RealmWeatherLevel | undefined, elapsedSecond: number): number {
  if (!level)
    return 0

  const phase = (elapsedSecond / level.periodSecond) * Math.PI * 2
  const wave = 0.5 + 0.5 * (0.65 * Math.sin(phase) + 0.35 * Math.sin(phase * 2.37 + 1.3))
  return level.min + (level.max - level.min) * wave
}

/**
 * 天氣系統
 *
 * 下雨時同時處理四件事：雨的粒子、雨聲與雷聲、天色轉陰、鳥蟲噤聲。
 * 大氣參數寫進共用的 atmosphere，最後由漫遊控制器套進場景，
 * 這樣洞穴變暗與陰天變暗才不會互相蓋掉。
 */
export function useWeather() {
  const weather = ref<Weather>('clear')
  const atmosphere = createAtmosphereState()

  const { preset } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()

  let rainParticles: RainParticles | null = null
  let snowParticles: SnowParticles | null = null
  let swampMist: SwampMist | null = null
  let groundMist: GroundMist | null = null
  let airMotes: AirMotes | null = null
  let fallingLeaves: FallingLeaves | null = null
  let wetness: Wetness | null = null
  let skyReflectionTexture: DynamicTexture | null = null
  /** 距離上次重畫濕地反光貼圖過了多久 */
  let skyReflectionElapsed = SKY_REFLECTION_UPDATE_INTERVAL
  let thunderTimerId: ReturnType<typeof setTimeout> | undefined
  let rumbleTimerId: ReturnType<typeof setTimeout> | undefined
  let flashTimeLeft = 0
  /** 這一道閃電的強度，遠方的雷只是天邊亮一下 */
  let flashStrength = 1
  let rainRatio = 0
  /** 此刻的雪勢，與雨互斥：兩座箱庭隔得很遠 */
  let snowRatio = 0
  /** 此刻在聽雨亭那片雨裡多深，只有這裡會打雷 */
  let thunderRatio = 0
  /** 地面此刻有多濕，0 為全乾、1 為濕透 */
  let wetRatio = 0
  /** 大場景天氣起落用的時鐘（秒），見 measureRealmWeatherLevel */
  let realmWeatherElapsed = 0
  /**
   * 把雷聲叫出來
   *
   * 聲音種在聽雨亭，天氣系統只有觸發權，沒有所有權。
   * 音景還沒啟動前是一個空函式，打雷就只是安靜地閃一下
   */
  let playThunder: (volume: number) => void = () => {}

  /**
   * 劈一道雷
   *
   * 先閃光，隔一段時間才傳來聲音。
   * 遠近以一個隨機值決定，同時牽動閃光強度、等待時間與音量，
   * 三者對得起來，聽起來才像遠方或頭頂的雷。
   *
   * 閃光是這裡的事，聲音不是：那顆雷種在聽雨亭（見 sound-data），
   * 這裡只在該響的時候把它叫出來。天氣系統自己不持有任何聲音
   */
  function strikeThunder() {
    /** 0 為就在頭頂、1 為遠方天邊 */
    const distanceRatio = Math.random()

    flashTimeLeft = FLASH_DURATION_SECOND
    flashStrength = lerp(1, 0.3, distanceRatio)

    const [minDelay, maxDelay] = THUNDER_DELAY_RANGE_SECOND
    const delaySecond = lerp(minDelay, maxDelay, distanceRatio)

    clearTimeout(rumbleTimerId)
    rumbleTimerId = setTimeout(() => {
      playThunder(lerp(0.85, 0.3, distanceRatio))
    }, delaySecond * 1000)
  }

  /** 雨中每隔一段時間打一次雷 */
  function scheduleThunder() {
    clearTimeout(thunderTimerId)

    const [min, max] = THUNDER_RANGE_SECOND
    const waitSecond = min + Math.random() * (max - min)

    thunderTimerId = setTimeout(() => {
      if (thunderRatio > 0.5) {
        strikeThunder()
      }
      scheduleThunder()
    }, waitSecond * 1000)
  }

  async function start({
    scene,
    camera,
    isSheltered,
    playThunder: triggerThunder,
    castRainRay,
    getWaterMap,
    getDayRatio,
    getTimeOfDay,
    wetMaterialList,
  }: StartParams): Promise<void> {
    if (rainParticles)
      return

    playThunder = triggerThunder

    /**
     * 粒子數量照畫質等級按比例收
     *
     * 每一種粒子的基準值是照「最高畫質該有多密」調出來的，
     * 各級之間的差別只是密度——所以這裡不為每一級各寫一個數字，
     * 統一乘上一個倍率。等級增減時這一段完全不必動
     */
    const scaleParticleCount = (baseCount: number) =>
      Math.max(1, Math.round(baseCount * preset.value.particleRatio))

    rainParticles = createRainParticles({
      scene,
      maxParticleCount: scaleParticleCount(3600),
      getWaterMap,
      castRainRay,
    })

    snowParticles = createSnowParticles({
      scene,
      /**
       * 比雨少
       *
       * 雪片活得比雨滴久七八倍，同樣的生成率會累積出好幾倍的粒子。
       * 一千八百片就足以在眼前糊成一片看不見路的白
       */
      maxParticleCount: scaleParticleCount(1800),
      castRainRay,
    })

    swampMist = createSwampMist({
      scene,
      /**
       * 霧只鋪在沼澤上，範圍收窄後同樣的數量會濃到看不見路
       *
       * 容量給三倍：千蛙沼跟著鏡頭鋪的那一圈比蛙聲澤大，晨昏要鋪到與箱庭一樣濃（RealmWeatherParticle 的 peakDensity）；
       * 大廳的生成速度照八十片算，濃度與加容量之前一樣
       */
      maxParticleCount: scaleParticleCount(240),
      baseParticleCount: scaleParticleCount(80),
      castRainRay,
    })

    groundMist = createGroundMist({
      scene,
      /** 鋪的範圍比沼澤那片大得多，數量得跟著上去才連得成一片 */
      maxParticleCount: scaleParticleCount(96),
      castRainRay,
    })

    airMotes = createAirMotes({
      scene,
      /** 顆粒只有幾個像素大，堆得起來才看得出空氣裡有東西 */
      moteCount: scaleParticleCount(220),
      /**
       * 大廳的生成速度只用得到四十八顆左右；容量留三倍給蟲鳴夜原（weatherParticle.fireflyDensity），
       * 生成速度沒變，大廳的螢火一樣多
       */
      fireflyCount: scaleParticleCount(144),
    })

    fallingLeaves = createFallingLeaves({
      scene,
      /** 葉子小又薄，數量得堆起來才看得出整片林子都在落葉 */
      maxParticleCount: scaleParticleCount(320),
      castRainRay,
    })

    skyReflectionTexture = createSkyReflectionTexture(scene)
    wetness = createWetness(wetMaterialList, skyReflectionTexture)

    scheduleThunder()

    const skyMaterial = getSkyMaterial(scene)
    const overcastMaterial = getOvercastMaterial(scene)

    /** 壓暗過的天氣霧色，每幀就地覆寫，不要每幀配置新的顏色物件 */
    const nightMistColor = new Color3()
    const nightJigokuColor = new Color3()
    const nightRainColor = new Color3()
    const nightSnowColor = new Color3()
    /** 場景的氣氛設定染過的基準霧色，同樣就地覆寫 */
    const realmFogColor = new Color3()
    /** 雨天往霧色靠攏後的天頂色與中空色，同樣就地覆寫 */
    const rainZenithColor = new Color3()
    const rainMidColor = new Color3()

    scene.onBeforeRenderObservable.add(() => {
      measureSection('天氣', () => {
        const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

        /**
         * 箱庭的天氣範圍只有大廳有
         *
         * 雨、雪、沼澤霧與地獄谷的熱氣都綁在箱庭的座標上，
         * 大場景裡同一個座標可能是湖心，不能照樣下起雨來
         */
        const hasGardens = activeRealmState.hasGardens
        /**
         * 落葉與沼澤的霧片也綁在箱庭的座標上，別的場景整個關掉；
         * 延伸那兩座箱庭的大場景（金葉林、千蛙沼）由場景定義給自己的範圍
         */
        const realmParticle = hasGardens ? undefined : getRealm(activeRealmState.realmId).weatherParticle
        fallingLeaves?.setArea(hasGardens ? HUB_LEAF_AREA : realmParticle?.fallingLeaves ?? null)
        /** 濃度排在範圍之前：換範圍時會重新預熱，預熱要照這一刻的濃度生，不能照上一個場景的 */
        swampMist?.setDensity(realmParticle?.swampMist
          ? measureMistDensity(getTimeOfDay(), realmParticle.swampMist.dayDensity, realmParticle.swampMist.peakDensity)
          : 1)
        swampMist?.setArea(hasGardens ? HUB_MIST_AREA : realmParticle?.swampMist ?? null)

        /**
         * 延伸雨區、雪區箱庭的大場景整片都在那場天氣裡（RealmDefinition 的 weather），
         * 其他大場景沒給，雨雪都是零，不會漏到別的場景
         */
        const realmWeather = hasGardens ? undefined : getRealm(activeRealmState.realmId).weather
        realmWeatherElapsed += deltaTime
        rainRatio = hasGardens
          ? getRainRatio(camera.position.x, camera.position.z)
          : measureRealmWeatherLevel(realmWeather?.rain, realmWeatherElapsed)
        snowRatio = hasGardens
          ? getSnowRatio(camera.position.x, camera.position.z)
          : measureRealmWeatherLevel(realmWeather?.snow, realmWeatherElapsed)
        weather.value = rainRatio > RAIN_WEATHER_THRESHOLD
          ? 'rain'
          : snowRatio > RAIN_WEATHER_THRESHOLD ? 'snow' : 'clear'

        /** 站在聽雨亭那片雨裡才會打雷，雨聽堂不算；大場景看定義的 hasThunder（聽雨林有） */
        thunderRatio = hasGardens
          ? measureZoneRatio(camera.position.x, camera.position.z, THUNDER_ZONE)
          : realmWeather?.hasThunder ? rainRatio : 0

        /**
         * 先套沼澤的霧，再套雨
         *
         * 兩區隔得夠遠不會同時作用，順序只是為了讓雨天永遠蓋過霧天：
         * 下雨時的能見度本來就比起霧更差
         */
        /**
         * 千蛙沼整片都是蛙聲澤那片霧：同一組沼澤大氣（霧距收到兩到二十格、光散開），
         * 濃淡不看站在哪，看時刻（晨昏最濃），見 RealmWeatherParticle 的 fogRatio
         */
        const realmMist = realmParticle?.swampMist
        const mistRatio = hasGardens
          ? getMistRatio(camera.position.x, camera.position.z)
          : realmMist ? measureMistDensity(getTimeOfDay(), realmMist.fogRatio.day, realmMist.fogRatio.peak) : 0
        const jigokuRatio = hasGardens ? getJigokuRatio(camera.position.x, camera.position.z) : 0

        /**
         * 從日夜循環給的基準色開始疊
         *
         * 不能再從固定的晴天白開始：那是正午的顏色，
         * 入夜之後霧會一直是白的，只有天空暗下來，兩者對不起來。
         *
         * 疊上去的雨霧與沼澤霧也要跟著壓暗。它們是寫死的中明度灰，
         * 不壓的話，深夜裡走進聽雨亭會看到一團亮灰的霧浮在全黑的世界中央，
         * 那座箱庭就成了唯一沒有入夜的地方
         */
        const dayBrightnessNow = measureDayBrightness(atmosphere)
        const nightScale = lerp(0.2, 1, dayBrightnessNow)
        nightMistColor.copyFrom(SWAMP_ATMOSPHERE.fogColor).scaleInPlace(nightScale)
        nightRainColor.copyFrom(RAIN_ATMOSPHERE.fogColor).scaleInPlace(nightScale)
        nightSnowColor.copyFrom(SNOW_ATMOSPHERE.fogColor).scaleInPlace(nightScale)

        /**
         * 熱氣入夜幾乎不暗
         *
         * 別的霧是天光散在水氣裡，天暗了它們當然跟著暗。
         * 這一片橘紅的來源是腳下那幾道岩漿——太陽下不下山它都燒著。
         * 照 0.2 那個係數壓下去，入夜後整座地獄谷會變成一片死黑，
         * 而那正是它最該亮的時候
         */
        nightJigokuColor
          .copyFrom(JIGOKU_ATMOSPHERE.fogColor)
          .scaleInPlace(lerp(0.82, 1, dayBrightnessNow))

        /**
         * 場景的氣氛設定排在每日天氣之後、箱庭的天氣範圍之前
         *
         * 霧色、霧距與三個光的倍率先換成這個場景的基準，
         * 下面那幾層箱庭天氣再從這個基準疊上去。大廳整份留空，
         * 算出來與晴天的那組常數一模一樣（applyRealmNumber 沒寫就原封不動）
         */
        const realmAtmosphere = activeRealmState.atmosphere
        applyRealmColor(atmosphere.baseFogColor, realmAtmosphere.fog?.tint, realmFogColor)
        const realmFogStart = applyRealmNumber(CLEAR_ATMOSPHERE.fogStart, realmAtmosphere.fog?.start, NON_NEGATIVE_RANGE)
        const realmFogEnd = applyRealmNumber(CLEAR_ATMOSPHERE.fogEnd, realmAtmosphere.fog?.end, NON_NEGATIVE_RANGE)
        const realmLightRatio = applyRealmNumber(CLEAR_ATMOSPHERE.lightRatio, realmAtmosphere.light?.lightRatio, NON_NEGATIVE_RANGE)
        const realmSpecularRatio = applyRealmNumber(CLEAR_ATMOSPHERE.specularRatio, realmAtmosphere.light?.specularRatio, NON_NEGATIVE_RANGE)
        const realmAmbientRatio = applyRealmNumber(CLEAR_ATMOSPHERE.ambientRatio, realmAtmosphere.light?.ambientRatio, NON_NEGATIVE_RANGE)

        Color3.LerpToRef(
          realmFogColor,
          nightJigokuColor,
          jigokuRatio,
          atmosphere.fogColor,
        )
        Color3.LerpToRef(
          atmosphere.fogColor,
          nightMistColor,
          mistRatio,
          atmosphere.fogColor,
        )
        Color3.LerpToRef(atmosphere.fogColor, nightRainColor, rainRatio, atmosphere.fogColor)
        Color3.LerpToRef(atmosphere.fogColor, nightSnowColor, snowRatio, atmosphere.fogColor)
        /**
         * 換場景的轉場排在最後
         *
         * 霧往目的地的霧色收，天邊與灰罩讀的都是這個顏色，
         * 整片天與地才會一起被同一種霧吞掉（濃度由漫遊控制器當成邊界白霧套）
         */
        Color3.LerpToRef(atmosphere.fogColor, realmTransitionState.fogColor, realmTransitionState.ratio, atmosphere.fogColor)

        /** 熱氣疊在場景的基準之上，後面的霧、雨、雪再依序疊上去 */
        const jigokuFogStart = lerp(realmFogStart, JIGOKU_ATMOSPHERE.fogStart, jigokuRatio)
        const jigokuFogEnd = lerp(realmFogEnd, JIGOKU_ATMOSPHERE.fogEnd, jigokuRatio)
        const jigokuLightRatio = lerp(realmLightRatio, JIGOKU_ATMOSPHERE.lightRatio, jigokuRatio)
        const jigokuSpecularRatio = lerp(realmSpecularRatio, JIGOKU_ATMOSPHERE.specularRatio, jigokuRatio)
        const jigokuAmbientRatio = lerp(realmAmbientRatio, JIGOKU_ATMOSPHERE.ambientRatio, jigokuRatio)

        const mistFogStart = lerp(jigokuFogStart, SWAMP_ATMOSPHERE.fogStart, mistRatio)
        const mistFogEnd = lerp(jigokuFogEnd, SWAMP_ATMOSPHERE.fogEnd, mistRatio)
        const mistLightRatio = lerp(jigokuLightRatio, SWAMP_ATMOSPHERE.lightRatio, mistRatio)
        const mistSpecularRatio = lerp(jigokuSpecularRatio, SWAMP_ATMOSPHERE.specularRatio, mistRatio)
        const mistAmbientRatio = lerp(jigokuAmbientRatio, SWAMP_ATMOSPHERE.ambientRatio, mistRatio)

        /**
         * 雪疊在雨後面
         *
         * 兩座箱庭隔得很遠，永遠不會同時作用，順序只是要有個定論。
         * 白矇比雨更狠：能見度更短、天光更高，所以擺在最後蓋過去
         */
        const rainFogStart = lerp(mistFogStart, RAIN_ATMOSPHERE.fogStart, rainRatio)
        const rainFogEnd = lerp(mistFogEnd, RAIN_ATMOSPHERE.fogEnd, rainRatio)
        const rainLightRatio = lerp(mistLightRatio, RAIN_ATMOSPHERE.lightRatio, rainRatio)

        atmosphere.fogStart = lerp(rainFogStart, SNOW_ATMOSPHERE.fogStart, snowRatio)
        atmosphere.fogEnd = lerp(rainFogEnd, SNOW_ATMOSPHERE.fogEnd, snowRatio)
        atmosphere.lightRatio = lerp(rainLightRatio, SNOW_ATMOSPHERE.lightRatio, snowRatio)
        /** 平行光收掉多少，天光就補回來多少，總亮度才不會跟著掉 */
        atmosphere.ambientRatio = lerp(
          lerp(mistAmbientRatio, RAIN_ATMOSPHERE.ambientRatio, rainRatio),
          SNOW_ATMOSPHERE.ambientRatio,
          snowRatio,
        )
        /**
         * 高光跟著雲量收掉，而且收得比漫射快得多
         *
         * 雨勢一起，濕地面上那道太陽的反光就該消失；雨停之後
         * 它會隨著雲散開慢慢回來，那時地還是濕的——
         * 「雨後的地面在斜射的陽光下亮到刺眼」是這個時候才發生的事
         */
        atmosphere.specularRatio = lerp(
          lerp(mistSpecularRatio, RAIN_ATMOSPHERE.specularRatio, rainRatio),
          SNOW_ATMOSPHERE.specularRatio,
          snowRatio,
        )

        /** 閃電：短暫補光後迅速衰減，遠方的雷只亮一點點 */
        if (flashTimeLeft > 0) {
          flashTimeLeft = Math.max(0, flashTimeLeft - deltaTime)
          atmosphere.flashRatio = flashTimeLeft / FLASH_DURATION_SECOND * flashStrength
        }
        else {
          atmosphere.flashRatio = 0
        }

        /**
         * 雨天的天色
         *
         * 基準值由日夜循環決定，這裡只負責「比那個時刻再陰一點」，
         * 不管當下是正午還是黃昏，疊上去的都是同一個方向的變化。
         *
         * 下雨時整片天往霧色靠攏：真正的陰天就是這樣，
         * 天頂與天邊的分界被雲蓋掉，看上去是一片沒有層次的鉛灰。
         * 霞光也要一起收掉——雲層背後的太陽不會在天上留下光暈
         */
        if (skyMaterial) {
          /**
           * 暴風雪把天空收得比雨更徹底
           *
           * 雨天只往霧色偏八成五，還留得出一點天的層次——
           * 那是對的，抬頭看得見雲在動。
           * 暴風雪不是：那裡根本分不出哪裡是天、哪裡是地，
           * 所以收到滿檔，天色與霧色完全相同
           */
          const skyFade = Math.max(rainRatio * 0.85, snowRatio)
          Color3.LerpToRef(atmosphere.skyZenithColor, atmosphere.fogColor, skyFade, rainZenithColor)
          Color3.LerpToRef(atmosphere.skyMidColor, atmosphere.fogColor, skyFade, rainMidColor)

          applySkyGradient(skyMaterial, {
            zenithColor: rainZenithColor,
            midColor: rainMidColor,
            horizonColor: atmosphere.fogColor,
            glowColor: atmosphere.skyGlowColor,
            counterColor: atmosphere.skyCounterColor,
            glowStrength: atmosphere.skyGlowStrength * (1 - Math.max(rainRatio, snowRatio)),
          })
        }

        /**
         * 罩住整片天的那一層
         *
         * 兩種情況會用到它：雨天要一片鉛灰的陰天，
         * 走到世界邊界時則要一片與霧同色的白。
         *
         * 邊界那個尤其重要。地面的霧再濃也只糊得掉地面，天空與雲是不吃霧的，
         * 玩家照樣看得見地平線與雲的位置——跨過邊界時雲一換位置就全露餡了。
         * 天與地要一起收成同一片白，才是真正的什麼都看不見
         */
        /** 漫遊控制器每幀量好放上來的，這裡讀就好 */
        const edgeRatio = atmosphere.edgeRatio

        /**
         * 灰罩此刻該多不透明
         *
         * 三種情況會用到它：雨天的鉛灰、暴風雪的白矇、世界邊界的白幕。
         * 各自的係數都大於一，是要它們在天氣滿檔之前就蓋滿，
         * 而不是剛好在最後一步才到位
         */
        const overcastRatio = Math.min(
          1,
          Math.max(rainRatio * 1.15, snowRatio * 1.7, edgeRatio * 1.6),
        )

        /**
         * 灰罩要收成霧色的程度
         *
         * 雨天不算在內：那時它就該是一片壓下來的鉛灰。
         * 暴風雪與世界邊界則相反，兩者的主題都是「什麼都看不見」，
         * 天與地必須是同一片顏色——差一點點就會在地平線上留下一條線
         */
        const whiteoutRatio = Math.min(1, Math.max(snowRatio * 1.7, edgeRatio * 1.6))

        /**
         * 雲淡光的程度，1 為已經完全看不見
         *
         * 雲不能只染成霧色藏在灰罩裡，那是行不通的：
         * 雲走自己寫的著色器，沒有 Babylon 那套色調映射；
         * 灰罩與地面走 StandardMaterial，映射寫在材質著色器裡。
         * 同一個霧色餵進去，雲出來是原值、灰罩被 ACES 壓過，
         * 亮度差了快兩成，雲反而成了那片白上更白的一塊。
         *
         * 方塊雲的年代還有第二個理由：雲寫深度，灰罩蓋不住它。
         * 體積雲不寫深度、排在灰罩前面畫，這一條已經不成立，
         * 剩下的是顏色與效能（見 CLOUD_VANISH_AT_OVERCAST）。
         *
         * 除以 0.6 是要它在灰罩蓋到六成時就已經完全不見——
         * 雲得先走，灰罩才收得乾淨
         */
        const cloudFadeRatio = Math.min(1, overcastRatio / CLOUD_VANISH_AT_OVERCAST)

        if (overcastMaterial) {
          /**
           * 這一層是兩件事：雨天的陰、邊界的白幕
           *
           * 它曾經還兼第三件事——洞裡的天花板，跟著 caveRatio 淡成岩壁的顏色。
           * 那是錯的。洞頂本來就是實心方塊，抬頭看到的是岩石而不是天空，
           * 這一層真正蓋到的只剩「從洞口望出去的那片天」，
           * 也就是唯一該亮的地方：人站在洞裡往外看，外頭的地面是亮的，
           * 天卻是一片黑，那比看得到藍天還怪。
           *
           * 洞裡的暗交給霧色與環境光就夠了，天空不必也不該一起關掉
           */
          /**
           * 陰天罩
           *
           * 暴風雪的係數比雨更兇：雨要 0.87 的雨勢才蓋滿，
           * 雪只要 0.6 就整片不透光。走進吹雪野的半路上天就沒了
           */
          overcastMaterial.alpha = overcastRatio
          /**
           * 雨天是鉛灰，暴風雪與邊界則是與霧同色
           *
           * 收的目標用 atmosphere.fogColor 而不是 baseFogColor：
           * 前者是地面此刻真正吃到的那個顏色，暴風雪的白已經混在裡面。
           * 用日夜的基準色會讓吹雪野的天比地暗一截，
           * 兩片白之間浮出一條地平線——而這座箱庭的主題正是沒有地平線。
           *
           * 顏色本來就跟著日夜走，夜裡收到的是一片深藍而不是白，
           * 不會有夜裡憑空亮起一面牆的事
           */
          const brightness = lerp(0.66, 0.44, rainRatio) * measureDayBrightness(atmosphere)
          overcastMaterial.emissiveColor.set(
            lerp(brightness, atmosphere.fogColor.r, whiteoutRatio),
            lerp(brightness + 0.03, atmosphere.fogColor.g, whiteoutRatio),
            lerp(brightness + 0.08, atmosphere.fogColor.b, whiteoutRatio),
          )
        }

        /**
         * 天體被遮住的程度交給日夜循環去套
         *
         * 太陽、月亮與星空都在灰罩前面，不自己淡出的話，
         * 雨中或貼近邊界時還會有一顆太陽掛在白幕上。
         * 但淡入淡出的基準亮度是日夜循環在管的，兩邊都寫會互相蓋掉，
         * 所以這裡只回報「該露出多少」
         */
        /** 太陽、月亮與星星在暴風雪裡一律看不到，係數給得比雨更高 */
        atmosphere.skyBodyFade = Math.max(0, 1 - Math.max(rainRatio * 1.6, snowRatio * 2.2, edgeRatio * 1.6))
        /** 地底沒有天：天體歸零，光束與行進版光束跟著它一起收掉（見 use-day-night） */
        if (activeRealmState.isUnderground)
          atmosphere.skyBodyFade = 0

        /**
         * 雲的天氣
         *
         * 雨天：雲先變多、變暗，鉛灰的雲底壓下來，接著灰罩才接手。
         * 走到世界邊界與暴風雪：整個淡掉。
         *
         * 邊界那個不能交給外面的灰罩去蓋，也不能只染成霧色：
         * 雲與白幕跑的是兩套著色器，同一個顏色餵進去出來不一樣，
         * 唯一可靠的是把它淡到沒有。光的顏色與亮度由日夜循環寫，
         * 這裡只寫天氣那幾欄，兩邊不會互相蓋掉
         */
        volumetricCloudState.rainRatio = rainRatio
        /** 地底沒有天：雲整層不畫，連雲影圖也不算（見 volumetric-cloud 的 renderClouds） */
        volumetricCloudState.visibleRatio = activeRealmState.isUnderground ? 0 : 1 - cloudFadeRatio
        volumetricCloudState.flashRatio = atmosphere.flashRatio
        /** 遠方的雲化進霧的基準色，而不是此刻的霧色：雨霧是貼地的，雲上面沒有 */
        volumetricCloudState.hazeColor.copyFrom(atmosphere.baseFogColor)

        /**
         * 粒子跟著日夜一起暗
         *
         * 落葉、雨絲與沼澤的霧都不吃場景光照，顏色是寫死的。
         * 入夜之後整個世界暗下來，只有它們維持著大白天的亮度，
         * 會像貼在畫面上的貼紙。
         *
         * 三者的下限不一樣，因為它們在畫面上佔的面積差很多。
         * 落葉與雨絲是細碎的小東西，留三成還看得出在飄；
         * 沼澤那片霧卻是一大團橫在畫面中央的白，
         * 只留三成在全黑的夜色前面依然像在發光，得再壓到剩下一成
         */
        const dayBrightness = measureDayBrightness(atmosphere)
        fallingLeaves?.setBrightness(lerp(0.3, 1, dayBrightness))
        rainParticles?.setBrightness(lerp(0.26, 1, dayBrightness))
        snowParticles?.setBrightness(lerp(0.3, 1, dayBrightness))
        swampMist?.setBrightness(lerp(0.1, 1, dayBrightness))
        /**
         * 晨霧的下限給得比沼澤高
         *
         * 它出現的時段本來就是最暗的那幾刻——天還沒亮。
         * 照沼澤那樣壓到剩一成，霧會暗到跟夜色分不開，等於沒有
         */
        groundMist?.setBrightness(lerp(0.35, 1, dayBrightness))

        /**
         * 晨霧只在天亮前後那一段，而且要挑地方
         *
         * 三個地方不該有它：洞裡沒有天，霧無從積起；
         * 雨區已經有一整片壓下來的雨霧；蛙聲澤終年就有一片更濃的。
         * 硬鋪上去只會讓那幾處的白疊成一團看不出層次的糊
         */
        /**
         * 貼著邊界時所有跟著鏡頭跑的粒子一律收掉
         *
         * 這是整個循環世界的底線：跨過邊界的那一刻，兩側必須是
         * 一模一樣的一片白，任何看得出「這裡和那裡不同」的東西都會拆穿它。
         *
         * 霧管不到粒子。晨霧、螢火蟲、空氣裡的浮塵全都生在鏡頭前一兩格，
         * 而霧要六格外才全白——它們因此浮在那片白的前面，
         * 一走過邊界就整批換了一組，位置全對不上。
         *
         * 係數給 1.6 是要它們比霧更早收乾淨：等到霧白了才開始淡，
         * 那幾格路上人已經看到粒子在一片空白裡飛
         */
        const edgeHideRatio = 1 - Math.min(1, edgeRatio * 1.6)

        /** 場景可以改晨霧的機率與濃度，同一天整個清晨抽到的結果一樣 */
        const dawnRatio = devToggle.groundMist
          ? Math.min(1, getDawnMistRatio(getTimeOfDay()) * getRealmGroundMistRatio(volumetricCloudState.dayPosition))
          : 0
        groundMist?.update(
          camera,
          dawnRatio * (1 - atmosphere.caveRatio) * (1 - rainRatio) * (1 - mistRatio) * edgeHideRatio,
        )

        /**
         * 邊界與開關都走 visibleRatio，不折進 dayRatio
         *
         * 螢火是拿 1 - dayRatio 反推的，把「不該看見」折進白晝的程度，
         * 對浮塵是關掉、對螢火卻是開到最大。
         * 大白天走到邊界會召出一群螢火，關掉這個開關也一樣
         */
        airMotes?.update(
          camera,
          devToggle.airMotes ? getDayRatio() : 0,
          devToggle.airMotes ? atmosphere.caveRatio : 0,
          devToggle.airMotes ? edgeHideRatio : 0,
          /** 蟲鳴夜原的螢火比別處多（weatherParticle.fireflyDensity），大廳與其他場景是 1 */
          realmParticle?.fireflyDensity,
        )

        /**
         * 淋濕得快、乾得慢
         *
         * 這是整件事的重點。兩邊速度一樣的話，走出雨區的那一步
         * 地就跟著乾了，看起來像雨從來沒下過
         */
        const wetTarget = devToggle.wetness ? rainRatio : 0
        wetRatio = wetTarget > wetRatio
          ? Math.min(wetTarget, wetRatio + WET_SOAK_SPEED * deltaTime)
          : Math.max(wetTarget, wetRatio - WET_DRY_SPEED * deltaTime)
        wetness?.setRatio(wetRatio)

        /**
         * 濕地反光的天色貼圖，節流重畫
         *
         * 天色變化很慢，逐幀重繪整張貼圖是白花的成本——
         * 跟 cloudShadow 那類效果同一種「量過再做」的態度
         */
        if (skyReflectionTexture) {
          skyReflectionElapsed += deltaTime
          if (skyReflectionElapsed >= SKY_REFLECTION_UPDATE_INTERVAL) {
            skyReflectionElapsed = 0
            updateSkyReflectionTexture(skyReflectionTexture, atmosphere)
          }
        }

        /**
         * 躲在洞裡時看不到雨，雪也一樣；貼近邊界時兩者一併收掉
         *
         * 雨雪跟著鏡頭跑，跨過邊界的前後本來就是同一片，
         * 不收也拆穿不了循環。收是為了另一件事：
         * 邊界那道白幕的定義是什麼都看不到，
         * 而幾條落在鏡頭前一兩格的雨絲，就是那片空白裡唯一還在動的東西
         */
        rainParticles?.update(camera, isSheltered() ? 0 : rainRatio * edgeHideRatio)
        snowParticles?.update(camera, isSheltered() ? 0 : snowRatio * edgeHideRatio)
      })
    })
  }

  /**
   * 換場景：改掛淋得濕的材質，丟掉射線的快取
   *
   * 方塊材質是世界層的東西，換場景時整批釋放、重建。
   * 濕潤記著每份材質原本的顏色，只能整份重建，不能沿用舊的。
   * 雨與雪記著每一根格柱的落點高度，地形一換就全錯了。
   *
   * 拆舊世界之前與新世界建好之後各呼叫一次：空檔裡射線打不到任何東西，
   * 那段時間查過的格柱也會被記成空的，新世界進來時要再清一次。
   * 開始漫遊之前這些都還沒建，那時 start 會直接拿到當下世界的清單
   */
  function setWorld(wetMaterialList: StandardMaterial[]): void {
    rainParticles?.clearImpactCache()
    snowParticles?.clearImpactCache()

    if (wetness) {
      wetness = createWetness(wetMaterialList, skyReflectionTexture ?? undefined)
    }
  }

  /** 開始漫遊之前先套場景基準霧與光的那個觀察者，見 trackRealmBaseline */
  let baselineCleanup: (() => void) | null = null

  /**
   * 開始漫遊之前，先把場景的霧與光套上去
   *
   * 場景氣氛平常是在天氣的每幀裡疊的，而天氣要等「開始漫遊」才建。
   * 換畫質重來回到湖中島時，開始面板後面那段時間看到的會是大廳的白霧。
   * 這個觀察者只做霧色、霧距與三個光的倍率，天氣一建好就不再動手。
   *
   * 要排在日夜循環之後、漫遊控制器之前（控制器才是把霧套進場景的那一個）。
   * 大廳的設定整份留空，這裡什麼都不寫，開始面板後面的畫面與原本一模一樣
   */
  function trackRealmBaseline(scene: Scene): void {
    baselineCleanup?.()
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (rainParticles)
        return

      /**
       * 大廳寫回建立時的那組初始值（與沒有這個觀察者時一模一樣），
       * 開始漫遊前用開發鍵從湖中島換回大廳，才不會留著湖的霧
       */
      if (!hasRealmFogOrLight()) {
        atmosphere.fogColor.copyFrom(CLEAR_ATMOSPHERE.fogColor)
        atmosphere.fogStart = CLEAR_ATMOSPHERE.fogStart
        atmosphere.fogEnd = CLEAR_ATMOSPHERE.fogEnd
        atmosphere.lightRatio = CLEAR_ATMOSPHERE.lightRatio
        atmosphere.ambientRatio = CLEAR_ATMOSPHERE.ambientRatio
        atmosphere.specularRatio = CLEAR_ATMOSPHERE.specularRatio
        return
      }

      const realmAtmosphere = activeRealmState.atmosphere
      applyRealmColor(atmosphere.baseFogColor, realmAtmosphere.fog?.tint, atmosphere.fogColor)
      atmosphere.fogStart = applyRealmNumber(CLEAR_ATMOSPHERE.fogStart, realmAtmosphere.fog?.start, NON_NEGATIVE_RANGE)
      atmosphere.fogEnd = applyRealmNumber(CLEAR_ATMOSPHERE.fogEnd, realmAtmosphere.fog?.end, NON_NEGATIVE_RANGE)
      atmosphere.lightRatio = applyRealmNumber(CLEAR_ATMOSPHERE.lightRatio, realmAtmosphere.light?.lightRatio, NON_NEGATIVE_RANGE)
      atmosphere.ambientRatio = applyRealmNumber(CLEAR_ATMOSPHERE.ambientRatio, realmAtmosphere.light?.ambientRatio, NON_NEGATIVE_RANGE)
      atmosphere.specularRatio = applyRealmNumber(CLEAR_ATMOSPHERE.specularRatio, realmAtmosphere.light?.specularRatio, NON_NEGATIVE_RANGE)
    })
    baselineCleanup = () => {
      scene.onBeforeRenderObservable.remove(observer)
      baselineCleanup = null
    }
  }

  onScopeDispose(() => {
    baselineCleanup?.()
    clearTimeout(thunderTimerId)
    clearTimeout(rumbleTimerId)
    rainParticles?.dispose()
    snowParticles?.dispose()
    swampMist?.dispose()
    groundMist?.dispose()
    airMotes?.dispose()
    fallingLeaves?.dispose()
    skyReflectionTexture?.dispose()
  })

  return {
    weather,
    atmosphere,
    start,
    setWorld,
    trackRealmBaseline,
  }
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

/**
 * 現在的天色相對於正午有多亮，0 為深夜、1 為大白天
 *
 * 陰天的灰罩、雲的亮度這類「天空的東西」都要跟著它一起暗，
 * 否則夜裡下雨會有一片亮灰的天壓在全黑的地景上。
 * 直接拿當下的霧色與正午的霧色相比就好，不必再多接一條日夜的線
 */
function measureDayBrightness(atmosphere: AtmosphereState): number {
  return Math.min(1, atmosphere.baseFogColor.g / GARDEN_FOG_COLOR.g)
}
