import type { Scene, StandardMaterial, UniversalCamera } from '@babylonjs/core'
import type { GardenId } from '../garden/garden-layout'
import type { Weather } from '../soundscape/type'
import type { AirMotes } from './air-motes'
import type { AtmosphereState } from './atmosphere'
import type { FallingLeaves } from './falling-leaves'
import type { GroundMist } from './ground-mist'
import type { RainParticles } from './rain-particles'
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
  getEdgeFogRatio,
  RAIN_ATMOSPHERE,
  SWAMP_ATMOSPHERE,
} from './atmosphere'
import { applyCloudColor } from './cloud-material'
import { createFallingLeaves } from './falling-leaves'
import { createGroundMist, getDawnMistRatio } from './ground-mist'
import { createRainParticles } from './rain-particles'
import { applySkyGradient } from './sky-gradient'
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
function createRainZone(gardenId: GardenId, falloff: number) {
  const garden = getGarden(gardenId)

  return {
    x: garden.center.x,
    z: garden.center.z,
    /** 這個半徑內是傾盆大雨，剛好蓋住整座木座 */
    innerRadius: garden.halfSize + 1,
    /** 超過這個半徑就完全放晴 */
    outerRadius: garden.halfSize + falloff,
  }
}

/** 過渡帶留得比木座本身還寬，走近時雨是慢慢大起來的 */
const RAINVALE_ZONE = createRainZone('rainvale', 14)

/**
 * 收得比聽雨亭緊
 *
 * 這座的重點在屋簷下那一圈，雨要下得剛好蓋住屋子與滴水線。
 * 攤太開的話，從外面走過來時屋子還沒進到眼裡就已經在淋雨，
 * 「進屋躲雨」那一下的對比就沒了
 */
const RAINHALL_ZONE = createRainZone('rainhall', 9)

const RAIN_ZONE_LIST = [RAINVALE_ZONE, RAINHALL_ZONE]

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
    const nightRainColor = new Color3()
    /** 雨天往霧色靠攏後的天頂色與中空色，同樣就地覆寫 */
    const rainZenithColor = new Color3()
    const rainMidColor = new Color3()
    /** 這一刻的雲色 */
    const cloudColor = new Color3()

    scene.onBeforeRenderObservable.add(() => {
      measureSection('天氣', () => {
        const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

        rainRatio = getRainRatio(camera.position.x, camera.position.z)
        weather.value = rainRatio > RAIN_WEATHER_THRESHOLD ? 'rain' : 'clear'

        /** 站在聽雨亭那片雨裡才會打雷，雨聽堂不算 */
        thunderRatio = measureZoneRatio(camera.position.x, camera.position.z, THUNDER_ZONE)

        /**
         * 先套沼澤的霧，再套雨
         *
         * 兩區隔得夠遠不會同時作用，順序只是為了讓雨天永遠蓋過霧天：
         * 下雨時的能見度本來就比起霧更差
         */
        const mistRatio = getMistRatio(camera.position.x, camera.position.z)

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
        const nightScale = lerp(0.2, 1, measureDayBrightness(atmosphere))
        nightMistColor.copyFrom(SWAMP_ATMOSPHERE.fogColor).scaleInPlace(nightScale)
        nightRainColor.copyFrom(RAIN_ATMOSPHERE.fogColor).scaleInPlace(nightScale)

        Color3.LerpToRef(
          atmosphere.baseFogColor,
          nightMistColor,
          mistRatio,
          atmosphere.fogColor,
        )
        Color3.LerpToRef(atmosphere.fogColor, nightRainColor, rainRatio, atmosphere.fogColor)

        const mistFogStart = lerp(CLEAR_ATMOSPHERE.fogStart, SWAMP_ATMOSPHERE.fogStart, mistRatio)
        const mistFogEnd = lerp(CLEAR_ATMOSPHERE.fogEnd, SWAMP_ATMOSPHERE.fogEnd, mistRatio)
        const mistLightRatio = lerp(CLEAR_ATMOSPHERE.lightRatio, SWAMP_ATMOSPHERE.lightRatio, mistRatio)

        atmosphere.fogStart = lerp(mistFogStart, RAIN_ATMOSPHERE.fogStart, rainRatio)
        atmosphere.fogEnd = lerp(mistFogEnd, RAIN_ATMOSPHERE.fogEnd, rainRatio)
        atmosphere.lightRatio = lerp(mistLightRatio, RAIN_ATMOSPHERE.lightRatio, rainRatio)

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
          Color3.LerpToRef(atmosphere.skyZenithColor, atmosphere.fogColor, rainRatio * 0.85, rainZenithColor)
          Color3.LerpToRef(atmosphere.skyMidColor, atmosphere.fogColor, rainRatio * 0.85, rainMidColor)

          applySkyGradient(skyMaterial, {
            zenithColor: rainZenithColor,
            midColor: rainMidColor,
            horizonColor: atmosphere.fogColor,
            glowColor: atmosphere.skyGlowColor,
            counterColor: atmosphere.skyCounterColor,
            glowStrength: atmosphere.skyGlowStrength * (1 - rainRatio),
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
        const edgeRatio = getEdgeFogRatio(camera.position.x, camera.position.z)
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
          overcastMaterial.alpha = Math.min(1, Math.max(rainRatio * 1.15, edgeRatio))
          /**
           * 雨天是鉛灰、邊界則是與霧同色
           *
           * 邊界那個顏色得跟著日夜走：白天是白幕、夜裡是一片深藍。
           * 用固定的白會讓夜裡走近邊界時憑空亮起一面牆
           */
          const brightness = lerp(0.66, 0.44, rainRatio) * measureDayBrightness(atmosphere)
          overcastMaterial.emissiveColor.set(
            lerp(brightness, atmosphere.baseFogColor.r, edgeRatio),
            lerp(brightness + 0.03, atmosphere.baseFogColor.g, edgeRatio),
            lerp(brightness + 0.08, atmosphere.baseFogColor.b, edgeRatio),
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
        atmosphere.skyBodyFade = Math.max(0, 1 - Math.max(rainRatio, edgeRatio) * 1.6)

        /**
         * 雲的顏色
         *
         * 雨天轉成陰沉的鉛灰；走到世界邊界時則要整個化進霧裡。
         *
         * 邊界那個不能交給外面的灰罩去蓋。灰罩掛在鏡頭外一百二十五格，
         * 雲卻只在頭頂一百格出頭——雲比灰罩近，深度測試會讓灰罩被雲擋在後面，
         * 於是四周全白了，抬頭卻還看得到幾朵雲飄過去。
         * 讓雲自己染成霧的顏色，就不必跟深度的先後打架：
         * 它還在那裡，只是與整片白一模一樣，看不出來而已
         */
        for (const material of cloudMaterialList) {
          /** 基準亮度由日夜循環給，雲才會跟著入夜一起暗下來 */
          const brightness = lerp(atmosphere.cloudBrightness, atmosphere.cloudBrightness * 0.4, rainRatio)
          cloudColor.set(
            lerp(brightness, atmosphere.baseFogColor.r, edgeRatio),
            lerp(brightness, atmosphere.baseFogColor.g, edgeRatio),
            lerp(brightness + 0.03, atmosphere.baseFogColor.b, edgeRatio),
          )
          /** 遠方的雲化進霧色，才不會在地平線上疊成一道亮帶 */
          applyCloudColor(material, {
            color: cloudColor,
            hazeColor: atmosphere.baseFogColor,
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
        const dawnRatio = devToggle.groundMist ? getDawnMistRatio(getTimeOfDay()) : 0
        groundMist?.update(
          camera,
          dawnRatio * (1 - atmosphere.caveRatio) * (1 - rainRatio) * (1 - mistRatio),
        )

        airMotes?.update(
          camera,
          devToggle.airMotes ? getDayRatio() : 0,
          devToggle.airMotes ? atmosphere.caveRatio : 0,
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

        /** 躲在洞裡時看不到雨 */
        rainParticles?.update(camera, isSheltered() ? 0 : rainRatio)
      })
    })
  }

  onBeforeUnmount(() => {
    clearTimeout(thunderTimerId)
    clearTimeout(rumbleTimerId)
    rainParticles?.dispose()
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
