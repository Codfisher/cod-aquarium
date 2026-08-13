import type { Scene, StaticSound, UniversalCamera } from '@babylonjs/core'
import type { Weather } from '../soundscape/type'
import type { AtmosphereState } from './atmosphere'
import type { FallingLeaves } from './falling-leaves'
import type { RainParticles } from './rain-particles'
import type { SwampMist } from './swamp-mist'
import { Color3, CreateSoundAsync } from '@babylonjs/core'
import { onBeforeUnmount, ref } from 'vue'
import { getAudioEngine } from '../../composables/use-audio-engine'
import {
  getCloudMaterialList,
  getOvercastMaterial,
  getSkyMaterial,
} from '../../composables/use-babylon-scene'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { getGarden } from '../garden/garden-layout'
import { getSoundUrl } from '../soundscape/sound-data'
import {
  CAVE_FOG_COLOR,
  CLEAR_ATMOSPHERE,
  createAtmosphereState,
  GARDEN_FOG_COLOR,
  getEdgeFogRatio,
  RAIN_ATMOSPHERE,
  SWAMP_ATMOSPHERE,
} from './atmosphere'
import { applyCloudColor } from './cloud-material'
import { createFallingLeaves } from './falling-leaves'
import { createRainParticles } from './rain-particles'
import { applySkyGradient } from './sky-gradient'
import { createSwampMist } from './swamp-mist'

/**
 * 常年下雨的區域
 *
 * 天氣不是全域的，而是綁在一座箱庭上：
 * 雨只下在聽雨亭那一小塊，走進去就淋雨，走出來就放晴。
 * 白沙地永遠是乾的、亮的，遠遠看過去只有那一座上面壓著一團灰——
 * 對比拉開了，那座箱庭才有它存在的理由
 */
const RAIN_GARDEN = getGarden('rainvale')
export const RAIN_ZONE = {
  x: RAIN_GARDEN.center.x,
  z: RAIN_GARDEN.center.z,
  /** 這個半徑內是傾盆大雨，剛好蓋住整座木座 */
  innerRadius: RAIN_GARDEN.halfSize + 1,
  /** 超過這個半徑就完全放晴，過渡帶留得比木座本身還寬 */
  outerRadius: RAIN_GARDEN.halfSize + 14,
}

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

interface StartParams {
  scene: Scene;
  camera: UniversalCamera;
  /** 是否躲在洞裡，躲雨時不畫雨也把雨聲壓小 */
  isSheltered: () => boolean;
  /** 從天空往指定格柱打射線，取得雨滴打到的表面高度，落地水花濺在這裡 */
  castRainRay: (blockX: number, blockZ: number) => number | null;
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

/** 依所在位置算出雨勢，0 為晴天、1 為大雨 */
export function getRainRatio(x: number, z: number): number {
  return measureZoneRatio(x, z, RAIN_ZONE)
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
  /** 目前雨勢，HUD 的音量條要用 */
  const rainStrength = ref(0)
  const atmosphere = createAtmosphereState()

  const { quality } = useGraphicsQuality()

  let rainParticles: RainParticles | null = null
  let swampMist: SwampMist | null = null
  let fallingLeaves: FallingLeaves | null = null
  let rainSound: StaticSound | null = null
  let thunderSound: StaticSound | null = null
  let thunderTimerId: ReturnType<typeof setTimeout> | undefined
  let rumbleTimerId: ReturnType<typeof setTimeout> | undefined
  let flashTimeLeft = 0
  /** 這一道閃電的強度，遠方的雷只是天邊亮一下 */
  let flashStrength = 1
  let rainRatio = 0

  /**
   * 劈一道雷
   *
   * 先閃光，隔一段時間才傳來聲音。
   * 遠近以一個隨機值決定，同時牽動閃光強度、等待時間與音量，
   * 三者對得起來，聽起來才像遠方或頭頂的雷
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
      if (!thunderSound)
        return

      thunderSound.volume = lerp(0.85, 0.3, distanceRatio)
      thunderSound.play()
    }, delaySecond * 1000)
  }

  /** 雨中每隔一段時間打一次雷 */
  function scheduleThunder() {
    clearTimeout(thunderTimerId)

    const [min, max] = THUNDER_RANGE_SECOND
    const waitSecond = min + Math.random() * (max - min)

    thunderTimerId = setTimeout(() => {
      if (rainRatio > 0.5) {
        strikeThunder()
      }
      scheduleThunder()
    }, waitSecond * 1000)
  }

  async function start({ scene, camera, isSheltered, castRainRay }: StartParams): Promise<void> {
    if (rainParticles)
      return

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

    fallingLeaves = createFallingLeaves({
      scene,
      /** 葉子小又薄，數量得堆起來才看得出整片林子都在落葉 */
      maxParticleCount: quality.value === 'low' ? 130 : 320,
      castRainRay,
    })

    try {
      const audioEngine = await getAudioEngine()
      rainSound = await CreateSoundAsync(
        'weather-rain',
        getSoundUrl('rain-foliage'),
        { loop: true, volume: 0 },
        audioEngine,
      )
      rainSound.play()

      thunderSound = await CreateSoundAsync(
        'weather-thunder',
        getSoundUrl('thunder'),
        { volume: 0.7 },
        audioEngine,
      )
    }
    catch (error) {
      console.warn('[Weather] 天氣音效載入失敗:', error)
    }

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
      const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

      rainRatio = getRainRatio(camera.position.x, camera.position.z)
      weather.value = rainRatio > RAIN_WEATHER_THRESHOLD ? 'rain' : 'clear'

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
         * 這一層同時是三件事：雨天的陰、邊界的白幕、洞裡的天花板
         *
         * 洞裡那個尤其重要。天空不吃霧氣，人在洞裡抬頭照樣看得到藍天；
         * 原本的做法是整片關掉天空，但那會在某個深度忽然消失。
         * 讓這一層淡入成岩壁的顏色，深淺是連續的，走進走出都看不出切換
         */
        overcastMaterial.alpha = Math.min(
          1,
          Math.max(rainRatio * 1.15, edgeRatio, atmosphere.caveRatio),
        )
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
        /** 洞裡蓋過前面所有的天色，換成岩壁那種暗灰藍 */
        Color3.LerpToRef(
          overcastMaterial.emissiveColor,
          CAVE_FOG_COLOR,
          atmosphere.caveRatio,
          overcastMaterial.emissiveColor,
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

      /** 躲在洞裡時看不到雨，雨聲也只剩洞口傳進來的一點 */
      const shelterRatio = isSheltered() ? 0.18 : 1
      rainParticles?.update(camera, isSheltered() ? 0 : rainRatio)

      const volume = rainRatio * 0.5 * shelterRatio
      if (rainSound) {
        rainSound.volume = volume
      }
      rainStrength.value = volume
    })
  }

  onBeforeUnmount(() => {
    clearTimeout(thunderTimerId)
    clearTimeout(rumbleTimerId)
    rainParticles?.dispose()
    swampMist?.dispose()
    fallingLeaves?.dispose()
    rainSound?.dispose()
    thunderSound?.dispose()
  })

  return {
    weather,
    rainStrength,
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
