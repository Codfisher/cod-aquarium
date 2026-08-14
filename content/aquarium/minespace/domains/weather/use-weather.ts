import type { Scene, StandardMaterial, UniversalCamera } from '@babylonjs/core'
import type { GardenId } from '../garden/garden-layout'
import type { Weather } from '../soundscape/type'
import type { AirMotes } from './air-motes'
import type { AtmosphereState } from './atmosphere'
import type { FallingLeaves } from './falling-leaves'
import type { GroundMist } from './ground-mist'
import type { RainParticles } from './rain-particles'
import type { SnowParticles } from './snow-particles'
import type { SwampMist } from './swamp-mist'
import type { Wetness } from './wetness'
import { Color3 } from '@babylonjs/core'
import { onBeforeUnmount, ref } from 'vue'
import {
  getCloudMaterialList,
  getOvercastMaterial,
  getSkyMaterial,
} from '../../composables/use-babylon-scene'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { measureSection } from '../../composables/use-performance-probe'
import { getGarden } from '../garden/garden-layout'
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
import { applyCloudColor } from './cloud-material'
import { createFallingLeaves } from './falling-leaves'
import { createGroundMist, getDawnMistRatio } from './ground-mist'
import { createRainParticles } from './rain-particles'
import { applySkyGradient } from './sky-gradient'
import { createSnowParticles } from './snow-particles'
import { createSwampMist } from './swamp-mist'
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
 * 雲得走在灰罩前面。雲有深度預寫，只要還在就會在灰罩上挖出一塊
 * 沒被蓋到的洞；等到灰罩都蓋滿了才開始淡，那塊洞會一直留到最後。
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
  /** 白晝的程度，0 為全暗、1 為大白天。空氣裡飄什麼要看它 */
  getDayRatio: () => number;
  /** 這一刻是幾點，晨霧只在天亮前後那一段出現 */
  getTimeOfDay: () => number;
  /** 淋得濕的方塊材質，雨停之後要慢慢乾回去 */
  wetMaterialList: StandardMaterial[];
}

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
 * 天氣系統
 *
 * 下雨時同時處理四件事：雨的粒子、雨聲與雷聲、天色轉陰、鳥蟲噤聲。
 * 大氣參數寫進共用的 atmosphere，最後由漫遊控制器套進場景，
 * 這樣洞穴變暗與陰天變暗才不會互相蓋掉。
 */
export function useWeather() {
  const weather = ref<Weather>('clear')
  const atmosphere = createAtmosphereState()

  const { quality } = useGraphicsQuality()
  const { state: devToggle } = useDevToggles()

  let rainParticles: RainParticles | null = null
  let snowParticles: SnowParticles | null = null
  let swampMist: SwampMist | null = null
  let groundMist: GroundMist | null = null
  let airMotes: AirMotes | null = null
  let fallingLeaves: FallingLeaves | null = null
  let wetness: Wetness | null = null
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
    getDayRatio,
    getTimeOfDay,
    wetMaterialList,
  }: StartParams): Promise<void> {
    if (rainParticles)
      return

    playThunder = triggerThunder

    rainParticles = createRainParticles({
      scene,
      maxParticleCount: quality.value === 'low' ? 1200 : 3600,
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
      maxParticleCount: quality.value === 'low' ? 700 : 1800,
      castRainRay,
    })

    swampMist = createSwampMist({
      scene,
      /** 霧只鋪在沼澤上，範圍收窄後同樣的數量會濃到看不見路 */
      maxParticleCount: quality.value === 'low' ? 36 : 80,
      castRainRay,
    })

    groundMist = createGroundMist({
      scene,
      /** 鋪的範圍比沼澤那片大得多，數量得跟著上去才連得成一片 */
      maxParticleCount: quality.value === 'low' ? 40 : 96,
      castRainRay,
    })

    airMotes = createAirMotes({
      scene,
      /** 顆粒只有幾個像素大，堆得起來才看得出空氣裡有東西 */
      moteCount: quality.value === 'low' ? 90 : 220,
      fireflyCount: quality.value === 'low' ? 20 : 48,
    })

    fallingLeaves = createFallingLeaves({
      scene,
      /** 葉子小又薄，數量得堆起來才看得出整片林子都在落葉 */
      maxParticleCount: quality.value === 'low' ? 130 : 320,
      castRainRay,
    })

    wetness = createWetness(wetMaterialList)

    scheduleThunder()

    const skyMaterial = getSkyMaterial(scene)
    const overcastMaterial = getOvercastMaterial(scene)
    const cloudMaterialList = getCloudMaterialList(scene)

    /** 壓暗過的天氣霧色，每幀就地覆寫，不要每幀配置新的顏色物件 */
    const nightMistColor = new Color3()
    const nightJigokuColor = new Color3()
    const nightRainColor = new Color3()
    const nightSnowColor = new Color3()
    /** 雨天往霧色靠攏後的天頂色與中空色，同樣就地覆寫 */
    const rainZenithColor = new Color3()
    const rainMidColor = new Color3()
    /** 這一刻的雲色 */
    const cloudColor = new Color3()

    scene.onBeforeRenderObservable.add(() => {
      measureSection('天氣', () => {
        const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

        rainRatio = getRainRatio(camera.position.x, camera.position.z)
        snowRatio = getSnowRatio(camera.position.x, camera.position.z)
        weather.value = rainRatio > RAIN_WEATHER_THRESHOLD
          ? 'rain'
          : snowRatio > RAIN_WEATHER_THRESHOLD ? 'snow' : 'clear'

        /** 站在聽雨亭那片雨裡才會打雷，雨聽堂不算 */
        thunderRatio = measureZoneRatio(camera.position.x, camera.position.z, THUNDER_ZONE)

        /**
         * 先套沼澤的霧，再套雨
         *
         * 兩區隔得夠遠不會同時作用，順序只是為了讓雨天永遠蓋過霧天：
         * 下雨時的能見度本來就比起霧更差
         */
        const mistRatio = getMistRatio(camera.position.x, camera.position.z)
        const jigokuRatio = getJigokuRatio(camera.position.x, camera.position.z)

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

        Color3.LerpToRef(
          atmosphere.baseFogColor,
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

        /** 熱氣疊在晴天之上，後面的霧、雨、雪再依序疊上去 */
        const jigokuFogStart = lerp(CLEAR_ATMOSPHERE.fogStart, JIGOKU_ATMOSPHERE.fogStart, jigokuRatio)
        const jigokuFogEnd = lerp(CLEAR_ATMOSPHERE.fogEnd, JIGOKU_ATMOSPHERE.fogEnd, jigokuRatio)
        const jigokuLightRatio = lerp(CLEAR_ATMOSPHERE.lightRatio, JIGOKU_ATMOSPHERE.lightRatio, jigokuRatio)
        const jigokuSpecularRatio = lerp(CLEAR_ATMOSPHERE.specularRatio, JIGOKU_ATMOSPHERE.specularRatio, jigokuRatio)
        const jigokuAmbientRatio = lerp(CLEAR_ATMOSPHERE.ambientRatio, JIGOKU_ATMOSPHERE.ambientRatio, jigokuRatio)

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
         * 也不能指望灰罩蓋住它。灰罩掛在鏡頭外一百二十五格、
         * 雲只在頭頂一百格，深度測試會判定灰罩被雲擋著，
         * 於是四周都蓋上了，雲的位置卻留著一塊沒被蓋到的洞。
         *
         * 顏色對不起來、蓋也蓋不住，那就讓它自己淡掉。
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

        /**
         * 雲的顏色與濃度
         *
         * 雨天轉成陰沉的鉛灰；走到世界邊界時整個淡掉。
         *
         * 邊界那個不能交給外面的灰罩去蓋。灰罩掛在鏡頭外一百二十五格，
         * 雲卻只在頭頂一百格出頭——雲比灰罩近，深度測試會讓灰罩被雲擋在後面，
         * 於是四周全白了，抬頭卻還看得到幾朵雲飄過去。
         *
         * 也不能只把它染成霧色。雲與白幕跑的是兩套著色器，
         * 一邊沒有色調映射、一邊有，同一個顏色餵進去出來就不一樣。
         * 唯一可靠的是把它淡到沒有，順便把顏色也帶過去，
         * 淡的過程才不會看到一朵有顏色的雲愈來愈透明
         */
        for (const material of cloudMaterialList) {
          /** 基準亮度由日夜循環給，雲才會跟著入夜一起暗下來 */
          const brightness = lerp(atmosphere.cloudBrightness, atmosphere.cloudBrightness * 0.4, rainRatio)
          /** 淡的同時把顏色也帶到霧色，過程中才不會看到一朵有顏色的雲愈來愈透明 */
          cloudColor.set(
            lerp(brightness, atmosphere.fogColor.r, cloudFadeRatio),
            lerp(brightness, atmosphere.fogColor.g, cloudFadeRatio),
            lerp(brightness + 0.03, atmosphere.fogColor.b, cloudFadeRatio),
          )
          /** 遠方的雲化進霧色，才不會在地平線上疊成一道亮帶 */
          applyCloudColor(material, {
            color: cloudColor,
            hazeColor: atmosphere.baseFogColor,
            visibleRatio: 1 - cloudFadeRatio,
          })
        }

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

        const dawnRatio = devToggle.groundMist ? getDawnMistRatio(getTimeOfDay()) : 0
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

  onBeforeUnmount(() => {
    clearTimeout(thunderTimerId)
    clearTimeout(rumbleTimerId)
    rainParticles?.dispose()
    snowParticles?.dispose()
    swampMist?.dispose()
    groundMist?.dispose()
    airMotes?.dispose()
    fallingLeaves?.dispose()
  })

  return {
    weather,
    atmosphere,
    start,
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
