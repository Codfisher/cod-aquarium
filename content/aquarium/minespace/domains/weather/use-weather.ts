import type { Scene, StaticSound, UniversalCamera } from '@babylonjs/core'
import type { Weather } from '../soundscape/type'
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
  getSunMaterialList,
} from '../../composables/use-babylon-scene'
import { useGraphicsQuality } from '../../composables/use-graphics-quality'
import { getSoundUrl } from '../soundscape/sound-data'
import { RAINVALE_POND, SWAMP_CENTER } from '../world/structure-generator'
import { CLEAR_ATMOSPHERE, createAtmosphereState, RAIN_ATMOSPHERE, SWAMP_ATMOSPHERE } from './atmosphere'
import { createFallingLeaves } from './falling-leaves'
import { createRainParticles } from './rain-particles'
import { createSwampMist } from './swamp-mist'

/**
 * 常年下雨的區域
 *
 * 天氣不由玩家切換，而是綁在地點上：
 * 走進西南邊的沼澤就會下雨，離開就放晴，雨聲與雨勢隨距離變化。
 */
export const RAIN_ZONE = {
  x: RAINVALE_POND.x,
  z: RAINVALE_POND.z,
  /** 這個半徑內是傾盆大雨 */
  innerRadius: 22,
  /** 超過這個半徑就完全放晴 */
  outerRadius: 46,
}

/**
 * 終年起霧的沼澤
 *
 * 與雨區同一套做法，天氣綁在地點上：
 * 走進南邊的沼澤，能見度會一路收到只剩幾十格，空氣泛著濕冷的綠灰
 */
export const MIST_ZONE = {
  x: SWAMP_CENTER.x,
  z: SWAMP_CENTER.z,
  /** 這個半徑內是最濃的霧 */
  innerRadius: 18,
  /** 超過這個半徑就完全散去 */
  outerRadius: 42,
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
    const sunMaterialList = getSunMaterialList(scene)
    /** 記下雲上下兩面原本的亮度，變天時照比例壓暗 */
    const cloudBrightnessList = cloudMaterialList.map((material) => material.emissiveColor.r)
    /** 太陽是相加混合，alpha 沒有作用，只能靠自發光的強度淡出 */
    const sunEmissiveList = sunMaterialList.map((material) => material.emissiveColor.clone())

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

      Color3.LerpToRef(
        CLEAR_ATMOSPHERE.fogColor,
        SWAMP_ATMOSPHERE.fogColor,
        mistRatio,
        atmosphere.fogColor,
      )
      Color3.LerpToRef(atmosphere.fogColor, RAIN_ATMOSPHERE.fogColor, rainRatio, atmosphere.fogColor)

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
       * 變天時千萬別把大氣散射的太陽養出來
       *
       * SkyMaterial 自己就會畫一顆圓太陽，平常靠散射參數壓著才看不見。
       * 一旦調低 rayleigh、調亮 luminance，那顆圓太陽就會從方形太陽底下浮出來，
       * 變天的過程中天上會同時掛著一圓一方。
       * 所以雨天改成「散射更強、天更暗」：
       * rayleigh 往上加讓陽光被散得更徹底，圓太陽自然被吃掉；
       * mieCoefficient 隨 turbidity 反向縮小，讓米氏散射總量維持不變，
       * 免得混濁度一拉高就在太陽周圍糊出一圈光暈
       */
      if (skyMaterial) {
        const turbidity = lerp(6, 11, rainRatio)
        skyMaterial.luminance = lerp(0.55, 0.35, rainRatio)
        skyMaterial.turbidity = turbidity
        skyMaterial.rayleigh = lerp(1.6, 2.6, rainRatio)
        skyMaterial.mieCoefficient = 0.0005 * (6 / turbidity)
      }

      /** 灰罩淡入把天空蓋掉，雨中就不會有大晴天的天色 */
      if (overcastMaterial) {
        overcastMaterial.alpha = Math.min(1, rainRatio * 1.15)
        const brightness = lerp(0.66, 0.44, rainRatio)
        overcastMaterial.emissiveColor.set(brightness, brightness + 0.03, brightness + 0.08)
      }

      /** 太陽在灰罩前面，得自己淡出，否則雨中還會掛著一顆太陽 */
      const sunFade = Math.max(0, 1 - rainRatio * 1.6)
      for (const [index, material] of sunMaterialList.entries()) {
        const baseColor = sunEmissiveList[index]
        if (baseColor) {
          material.emissiveColor.set(
            baseColor.r * sunFade,
            baseColor.g * sunFade,
            baseColor.b * sunFade,
          )
        }
      }

      /** 雲跟著轉成陰沉的鉛灰色 */
      for (const [index, material] of cloudMaterialList.entries()) {
        const brightness = lerp(cloudBrightnessList[index] ?? 1, 0.4, rainRatio)
        material.emissiveColor.set(brightness, brightness, brightness + 0.03)
      }

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
