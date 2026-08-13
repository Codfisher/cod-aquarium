import type {
  Color3,
  DefaultRenderingPipeline,
  DirectionalLight,
  Mesh,
  Scene,
  StandardMaterial,
} from '@babylonjs/core'
import type { SkyMaterial } from '@babylonjs/materials'
import type { AtmosphereState } from '../domains/weather/atmosphere'
import type { DayPhase } from '../domains/weather/day-night'
import type { VolumetricFog } from '../domains/weather/volumetric-fog'
import { useStorage } from '@vueuse/core'
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  createDayNightSample,
  formatClock,
  getDayLengthSecond,
  getDayPhase,
  INITIAL_DAY_SPEED_RATIO,
  INITIAL_TIME_OF_DAY,
  sampleDayNight,
  wrapTimeOfDay,
} from '../domains/weather/day-night'
import {
  getMoonMaterialList,
  getSkyMaterial,
  getStarFieldMaterial,
  getSunMaterialList,
  MOON_DISC_NAME,
  MOON_GLOW_NAME,
  SUN_DISC_NAME,
  SUN_GLOW_NAME,
  SUN_LIGHT_NAME,
} from './use-babylon-scene'

/**
 * 滾輪撥一格是多少分鐘
 *
 * 一格二十分鐘：撥個三四下就從中午到黃昏，
 * 想從白天翻到深夜也只要滾一小段，不會滾到手痠
 */
const WHEEL_MINUTE_PER_NOTCH = 20
/** 一次滾輪事件最多算幾格，觸控板一口氣送一大串時才不會瞬移 */
const WHEEL_NOTCH_LIMIT = 3

/** 太陽與月亮掛在天上多遠，要落在天空罩以內 */
const SKY_BODY_DISTANCE = 110
const SKY_GLOW_DISTANCE = 112

/** HUD 的時刻讀數更新間隔（秒），每幀更新只是白白觸發重繪 */
const CLOCK_UPDATE_INTERVAL = 0.2

interface StartParams {
  scene: Scene;
  canvas: HTMLCanvasElement;
  pipeline: DefaultRenderingPipeline | undefined;
  /** 晨昏的體積光，強度跟著太陽的高度走 */
  volumetricFog?: VolumetricFog;
  /** 日夜循環把這個時刻的基準寫進去，天氣與漫遊控制器在上面疊自己的效果 */
  atmosphere: AtmosphereState;
  /** 是否正在漫遊，暫停時時間跟著停下來 */
  isRunning: () => boolean;
}

/**
 * 日夜循環
 *
 * 太陽沿著傾斜的圓升起落下，落到地平線以下就換月亮上來，
 * 天色、光色、霧色與整體色調全部跟著走。
 *
 * 這裡只做接線：算出「這一刻長什麼樣子」是 day-night 那個檔案的事，
 * 這裡負責把結果擺進場景——移動天體、轉動平行光、改色調，
 * 以及把基準值寫進共用的大氣狀態讓天氣與洞穴疊上去
 */
export function useDayNight() {
  /**
   * 真正的時刻放在普通變數裡，不放在 ref
   *
   * 這個數字每一幀都在變。擺進 ref 等於每一幀都在觸發 Vue 的反應式更新，
   * 而畫面上其實只有一行時刻讀數在看它——那一行五分之一秒更新一次就夠了。
   * 所以下面那幾個 ref 是「給畫面看的鏡像」，隔一段時間才同步一次
   */
  let currentTime = INITIAL_TIME_OF_DAY

  const timeOfDay = ref(INITIAL_TIME_OF_DAY)
  /**
   * 時間會不會自己走
   *
   * 關掉之後天色就停在當下這一刻，滾輪與時間軸照樣能撥。
   * 有人是為了看日出來的，也有人只想在某個光線裡待著；
   * 這個選擇記在瀏覽器裡，下次進來還是同一種待法
   */
  const isAutoAdvance = useStorage('minespace-day-cycle', true)
  /** 一天走多快，0 為最緩、1 為最快，同樣記在瀏覽器裡 */
  const daySpeedRatio = useStorage('minespace-day-speed', INITIAL_DAY_SPEED_RATIO)
  /** 白晝的程度，0 為全暗、1 為大白天 */
  const dayRatio = ref(1)
  const phase = ref<DayPhase>(getDayPhase(INITIAL_TIME_OF_DAY))
  const clockText = ref(formatClock(INITIAL_TIME_OF_DAY))

  const sample = createDayNightSample()

  let cleanup: (() => void) | null = null

  onBeforeUnmount(() => cleanup?.())

  /** 直接指定時刻，選單裡的時間軸用這個 */
  function setTimeOfDay(value: number): void {
    currentTime = wrapTimeOfDay(value)
    timeOfDay.value = currentTime
  }

  /**
   * 撥動時間，正值往未來走
   *
   * 直接加上去，不做追趕也不留慣性：滾輪轉多少、時間就走多少，
   * 手一停天色就停在那裡。中間補一段緩衝看起來是順了，
   * 實際操作起來卻是「放開之後畫面還在自己動」，反而不好對準想要的光線
   */
  function addTime(delta: number): void {
    setTimeOfDay(currentTime + delta)
  }

  function start({ scene, canvas, pipeline, volumetricFog, atmosphere, isRunning }: StartParams): void {
    cleanup?.()

    const sunLight = scene.getLightByName(SUN_LIGHT_NAME) as DirectionalLight | null
    const skyMaterial = getSkyMaterial(scene)
    const starMaterial = getStarFieldMaterial(scene)
    const sunMaterialList = getSunMaterialList(scene)
    const moonMaterialList = getMoonMaterialList(scene)
    /** 記下天體原本的亮度，之後只照比例淡入淡出，不覆蓋掉調過的顏色 */
    const sunBaseList = sunMaterialList.map((material) => material.emissiveColor.clone())
    const moonBaseList = moonMaterialList.map((material) => material.emissiveColor.clone())

    const sunDisc = scene.getMeshByName(SUN_DISC_NAME) as Mesh | null
    const sunGlow = scene.getMeshByName(SUN_GLOW_NAME) as Mesh | null
    const moonDisc = scene.getMeshByName(MOON_DISC_NAME) as Mesh | null
    const moonGlow = scene.getMeshByName(MOON_GLOW_NAME) as Mesh | null

    /**
     * 滾輪撥時間
     *
     * 只在真的正在漫遊時才攔截：這個場景嵌在一篇文章裡，
     * 沒開始漫遊就把捲動吃掉的話，讀者會捲不動頁面
     */
    function handleWheel(event: WheelEvent) {
      if (!isRunning())
        return

      event.preventDefault()

      /** deltaMode 為 1 時單位是行不是像素，一行大約十六像素 */
      const pixelDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const notch = Math.max(
        -WHEEL_NOTCH_LIMIT,
        Math.min(WHEEL_NOTCH_LIMIT, pixelDelta / 100),
      )

      addTime(notch * WHEEL_MINUTE_PER_NOTCH / (24 * 60))
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })

    let clockElapsed = 0

    const observer = scene.onBeforeRenderObservable.add(() => {
      const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

      /**
       * 暫停時世界該停在原地，但選單裡拖時間軸還是要看得到變化
       *
       * 關掉自動交替之後也一樣：時間不再自己走，
       * 但滾輪與時間軸撥出來的位移照樣要追過去
       */
      if (isRunning() && isAutoAdvance.value) {
        currentTime = wrapTimeOfDay(currentTime + deltaTime / getDayLengthSecond(daySpeedRatio.value))
      }

      sampleDayNight(currentTime, sample)

      applyToAtmosphere(atmosphere)
      applyToLight(sunLight)
      applyToSkyBody({
        sunDisc,
        sunGlow,
        moonDisc,
        moonGlow,
        sunMaterialList,
        sunBaseList,
        moonMaterialList,
        moonBaseList,
        starMaterial,
        skyBodyFade: atmosphere.skyBodyFade,
      })
      applyToSky(skyMaterial)
      applyToPipeline(pipeline)
      /** 雨中與貼近邊界時整片天被白幕蓋住，光束也該跟著收掉 */
      volumetricFog?.setStrength(sample.godRayRatio * atmosphere.skyBodyFade)

      clockElapsed += deltaTime
      if (clockElapsed >= CLOCK_UPDATE_INTERVAL) {
        clockElapsed = 0
        timeOfDay.value = currentTime
        dayRatio.value = sample.dayRatio
        clockText.value = formatClock(currentTime)
        phase.value = getDayPhase(currentTime)
      }
    })

    cleanup = () => {
      canvas.removeEventListener('wheel', handleWheel)
      scene.onBeforeRenderObservable.remove(observer)
    }
  }

  /** 把這一刻的基準寫進共用的大氣狀態 */
  function applyToAtmosphere(atmosphere: AtmosphereState): void {
    /**
     * 只寫基準，不要順手把當下的霧色一起寫掉
     *
     * 當下的霧色是天氣系統的地盤，它每一幀從這個基準疊上雨霧再寫回去。
     * 這裡若也寫一次，順序會變成「日夜覆寫成基準 → 漫遊控制器讀到基準
     * → 天氣算出混合色 → 下一幀又被日夜覆寫掉」，
     * 天氣算出來的顏色永遠沒有機會被套用，雨天與沼澤的霧就再也不會變色
     */
    atmosphere.baseFogColor.copyFrom(sample.fogColor)
    atmosphere.lightColor.copyFrom(sample.lightColor)
    atmosphere.ambientSkyColor.copyFrom(sample.ambientSkyColor)
    atmosphere.ambientGroundColor.copyFrom(sample.ambientGroundColor)
    atmosphere.fillColor.copyFrom(sample.fillColor)
    atmosphere.lightIntensity = sample.lightIntensity
    atmosphere.ambientIntensity = sample.ambientIntensity
    atmosphere.cloudBrightness = sample.cloudBrightness
    atmosphere.skyLuminance = sample.skyLuminance
    atmosphere.skyRayleigh = sample.skyRayleigh
    atmosphere.skyTurbidity = sample.skyTurbidity
  }

  /** 轉動平行光。強度與顏色留給漫遊控制器套用，那裡還要疊洞穴與陰天 */
  function applyToLight(sunLight: DirectionalLight | null): void {
    if (!sunLight)
      return

    sunLight.direction.copyFrom(sample.lightDirection)
  }

  interface SkyBodyParams {
    sunDisc: Mesh | null;
    sunGlow: Mesh | null;
    moonDisc: Mesh | null;
    moonGlow: Mesh | null;
    sunMaterialList: StandardMaterial[];
    sunBaseList: Color3[];
    moonMaterialList: StandardMaterial[];
    moonBaseList: Color3[];
    starMaterial: StandardMaterial | null;
    skyBodyFade: number;
  }

  /** 擺放太陽、月亮與星空，並依高度淡入淡出 */
  function applyToSkyBody(param: SkyBodyParams): void {
    const { sunPosition, moonPosition } = sample

    param.sunDisc?.position.copyFrom(sunPosition).scaleInPlace(SKY_BODY_DISTANCE)
    param.sunGlow?.position.copyFrom(sunPosition).scaleInPlace(SKY_GLOW_DISTANCE)
    param.moonDisc?.position.copyFrom(moonPosition).scaleInPlace(SKY_BODY_DISTANCE)
    param.moonGlow?.position.copyFrom(moonPosition).scaleInPlace(SKY_GLOW_DISTANCE)

    /**
     * 越低的太陽越紅
     *
     * 天空的漸層是大氣散射算出來的，太陽本體卻是一張自己畫的貼圖，
     * 不跟著染色的話，日落時會有一顆慘白的方塊掛在一片橘紅的天上。
     * 這裡拿當下的光色去染它，兩者就對得起來了
     */
    const horizonRatio = 1 - smoothRange(sample.sunHeight, 0.04, 0.42)
    const sunFade = sample.sunVisibility * param.skyBodyFade

    for (const [index, material] of param.sunMaterialList.entries()) {
      const base = param.sunBaseList[index]
      if (!base)
        continue

      material.emissiveColor.set(
        base.r * sunFade,
        base.g * lerp(1, sample.lightColor.g, horizonRatio) * sunFade,
        base.b * lerp(1, sample.lightColor.b, horizonRatio) * sunFade,
      )
    }

    const moonFade = sample.moonVisibility * param.skyBodyFade
    for (const [index, material] of param.moonMaterialList.entries()) {
      const base = param.moonBaseList[index]
      if (!base)
        continue

      material.emissiveColor.set(base.r * moonFade, base.g * moonFade, base.b * moonFade)
    }

    if (param.starMaterial) {
      const starFade = sample.starVisibility * param.skyBodyFade
      param.starMaterial.emissiveColor.set(starFade, starFade, starFade)
    }
  }

  /** 大氣散射：太陽的方位決定了整片天的漸層落在哪一邊 */
  function applyToSky(skyMaterial: SkyMaterial | null): void {
    if (!skyMaterial)
      return

    skyMaterial.sunPosition.copyFrom(sample.sunPosition).scaleInPlace(120)
    skyMaterial.luminance = sample.skyLuminance
    skyMaterial.rayleigh = sample.skyRayleigh
    skyMaterial.turbidity = sample.skyTurbidity
    /**
     * 米氏散射隨混濁度反向縮小
     *
     * 不這麼做的話，混濁度一拉高就會在太陽周圍糊出一大圈光暈，
     * 把自己畫的方形太陽整個吃掉
     */
    skyMaterial.mieCoefficient = 0.0005 * (6 / Math.max(1, sample.skyTurbidity))
  }

  /** 色調：夜裡偏冷、黃昏偏暖，曝光也跟著時刻走 */
  function applyToPipeline(pipeline: DefaultRenderingPipeline | undefined): void {
    if (!pipeline)
      return

    pipeline.imageProcessing.exposure = sample.exposure

    const colorCurves = pipeline.imageProcessing.colorCurves
    if (!colorCurves)
      return

    colorCurves.globalHue = sample.gradeHue
    colorCurves.globalDensity = sample.gradeDensity
    colorCurves.globalSaturation = sample.gradeSaturation
  }

  return {
    start,
    setTimeOfDay,
    addTime,
    timeOfDay,
    isAutoAdvance,
    daySpeedRatio,
    dayRatio,
    phase,
    clockText,
    /** 給音景讀的即時值，不走 Vue 的反應式，免得每幀都在觸發更新 */
    getDayRatio: () => sample.dayRatio,
    isNight: computed(() => dayRatio.value < 0.5),
  }
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))

  return ratio * ratio * (3 - 2 * ratio)
}
