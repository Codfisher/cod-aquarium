import type {
  Color3,
  DefaultRenderingPipeline,
  DirectionalLight,
  Mesh,
  Scene,
  ShaderMaterial,
  StandardMaterial,
} from '@babylonjs/core'
import type { VolumetricLight } from '../domains/renderer/volumetric-light'
import type { AtmosphereState } from '../domains/weather/atmosphere'
import type { DayPhase } from '../domains/weather/day-night'
import type { GodRays } from '../domains/weather/god-rays'
import { useStorage } from '@vueuse/core'
import { computed, onBeforeUnmount, ref } from 'vue'
import { getReloadHandoff } from '../domains/scene/reload-handoff'
import {
  advanceSunriseDrift,
  createDayNightSample,
  formatClock,
  getDayLengthSecond,
  getDayPhase,
  INITIAL_DAY_SPEED_RATIO,
  INITIAL_TIME_OF_DAY,
  sampleDayNight,
  wrapTimeOfDay,
} from '../domains/weather/day-night'
import { applySkyGradient } from '../domains/weather/sky-gradient'
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
import { reportDiagnostic } from './use-error-logger'
import { measureSection } from './use-performance-probe'

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

/**
 * 色調分級的最小改動量
 *
 * 小於這個差距就不寫進管線。寫一次的代價是全場材質失效一輪，
 * 而這兩個門檻對應的視覺差異都在肉眼的解析度以下：
 * 曝光千分之四、色相與濃度半個單位
 */
const EXPOSURE_STEP = 0.004
const GRADE_STEP = 0.5

/**
 * 洞穴自動曝光的加成上限
 *
 * 相機在暗處會自動拉高曝光，模擬瞳孔放大——這裡用同一個比喻：
 * 洞裡沒有天光，暗部細節全靠環境光補的那一點微光撐著，
 * 曝光跟著洞穴深度拉高，最深處拉到六成，才看得清岩壁上的細節。
 * 拉太多反而會把岩壁洗成一片死白，六成是留了餘裕的上限
 */
const CAVE_EXPOSURE_BOOST = 0.6

/**
 * 依洞穴深度算曝光要乘上多少
 *
 * caveRatio 是漫遊控制器已經做過指數平滑的連續值（見 use-fps-controller.ts
 * 的 updateAtmosphere），這裡不必再平滑一次——直接乘上去，
 * 「瞳孔適應」那段漸變早就在 caveRatio 本身裡面做完了
 */
function computeCaveExposureMultiplier(caveRatio: number): number {
  return 1 + Math.min(1, Math.max(0, caveRatio)) * CAVE_EXPOSURE_BOOST
}

/** HUD 的時刻讀數更新間隔（秒），每幀更新只是白白觸發重繪 */
const CLOCK_UPDATE_INTERVAL = 0.2

interface StartParams {
  scene: Scene;
  canvas: HTMLCanvasElement;
  pipeline: DefaultRenderingPipeline | undefined;
  /** 晨昏的光束，強度跟著太陽的高度走 */
  godRays?: GodRays;
  /**
   * 沿著視線行進的光束，只有最奢的那一級有
   *
   * 與 godRays 互斥：兩者做的是同一件事，同時開會疊成兩層亮
   */
  volumetricLight?: VolumetricLight;
  /** 日夜循環把這個時刻的基準寫進去，天氣與漫遊控制器在上面疊自己的效果 */
  atmosphere: AtmosphereState;
  /**
   * 世界是否在走，暫停時時間跟著停下來
   *
   * 按 Tab 把滑鼠交還給桌面不算暫停：那是「站在原地看風景」，
   * 太陽該照樣走完它的弧線
   */
  isRunning: () => boolean;
  /**
   * 滾輪是不是用來撥時間
   *
   * 這個場景嵌在一篇文章裡，滾輪只有在真正操控時才屬於它；
   * 還沒開始漫遊、或按 Tab 放開滑鼠之後，捲動都該還給頁面
   */
  canScrubTime: () => boolean;
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
  /**
   * 從哪一刻開始
   *
   * 換畫質是整頁重來的（見 reload-handoff），接不回原本的時刻的話，
   * 天色會從黃昏跳回預設的上午——那比人被丟回出生點還醒目，
   * 因為整片天連同霧色與影子的方向會一起換掉
   */
  const initialTime = getReloadHandoff()?.timeOfDay ?? INITIAL_TIME_OF_DAY

  let currentTime = initialTime

  const timeOfDay = ref(initialTime)
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
  const phase = ref<DayPhase>(getDayPhase(initialTime))
  const clockText = ref(formatClock(initialTime))

  const sample = createDayNightSample()

  /** 上一次真的寫進管線的色調值，用來判斷這一幀要不要再寫 */
  let appliedExposure = Number.NaN
  let appliedHue = Number.NaN
  let appliedDensity = Number.NaN
  let appliedSaturation = Number.NaN

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

  function start({ scene, canvas, pipeline, godRays, volumetricLight, atmosphere, isRunning, canScrubTime }: StartParams): void {
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
     * 只在滾輪真的屬於這個場景時才攔截：沒開始漫遊、
     * 或按 Tab 把滑鼠交還給桌面之後，捲動都該還給頁面
     */
    function handleWheel(event: WheelEvent) {
      if (!canScrubTime())
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
      measureSection('日夜循環', () => {
        const deltaTime = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)

        /**
         * 暫停時世界該停在原地，但選單裡拖時間軸還是要看得到變化
         *
         * 關掉自動交替之後也一樣：時間不再自己走，
         * 但滾輪與時間軸撥出來的位移照樣要追過去
         */
        if (isRunning() && isAutoAdvance.value) {
          const dayStep = deltaTime / getDayLengthSecond(daySpeedRatio.value)
          currentTime = wrapTimeOfDay(currentTime + dayStep)
          /**
           * 日子過多少，日出的方位就漂多少
           *
           * 用同一個步長，暫停、快轉、改變流速都自動跟著。
           * 而拖時間軸不會走到這裡——那是翻頁去看某個時刻，不是真的過了一天
           */
          advanceSunriseDrift(dayStep)
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
        applyToPipeline(pipeline, atmosphere)
        /** 雨中與貼近邊界時整片天被白幕蓋住，光束也該跟著收掉 */
        const rayRatio = sample.godRayRatio * atmosphere.skyBodyFade
        godRays?.setStrength(rayRatio)
        /**
         * 行進版全天候都在，不吃晨昏那條曲線
         *
         * 這一段來回改過兩次，兩次都錯，記下來免得再走一遍。
         *
         * 一開始跟著「直射陽光還剩幾成」走，結果正午整片畫面泛白；
         * 於是改成跟螢幕空間版共用晨昏曲線，結果整天都看不到光束——
         * 那條曲線只在太陽貼近地平線時才非零。
         *
         * 兩次都在調時段，而問題根本不在時段：那時的著色器少了相位函數，
         * 加上去的是一層不分方向的亮度，只能靠「大部分時間關掉」
         * 來遮掩泛白。補上相位函數之後，亮度自己就集中到望向太陽的那一側，
         * 背對時趨近於零——時段的閹割因此不再需要，
         * 強度回到「這一刻有沒有一顆又小又亮的太陽」這個唯一該問的問題
         */
        const volumetricRatio = atmosphere.specularRatio
          * atmosphere.skyBodyFade
          * (1 - atmosphere.caveRatio)

        /**
         * 三個因子分開記
         *
         * 乘出來是零的時候，光看結果分不出是天氣把直射光收掉了、
         * 白幕蓋住了天、還是人在洞裡——那是三個完全不同的方向
         */
        reportDiagnostic(
          '體積光/強度來源',
          `高光比 ${atmosphere.specularRatio.toFixed(3)}`
          + `、天體露出 ${atmosphere.skyBodyFade.toFixed(3)}`
          + `、洞穴 ${atmosphere.caveRatio.toFixed(3)}`
          + ` → ${volumetricRatio.toFixed(3)}`,
        )

        volumetricLight?.setStrength(
          volumetricRatio,
          sample.lightColor,
          sample.lightDirection,
        )

        clockElapsed += deltaTime
        if (clockElapsed >= CLOCK_UPDATE_INTERVAL) {
          clockElapsed = 0
          timeOfDay.value = currentTime
          dayRatio.value = sample.dayRatio
          clockText.value = formatClock(currentTime)
          phase.value = getDayPhase(currentTime)
        }
      })
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
    atmosphere.skyZenithColor.copyFrom(sample.skyZenithColor)
    atmosphere.skyMidColor.copyFrom(sample.skyMidColor)
    atmosphere.skyGlowColor.copyFrom(sample.skyGlowColor)
    atmosphere.skyCounterColor.copyFrom(sample.skyCounterColor)
    atmosphere.skyGlowStrength = sample.skyGlowStrength
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

  /**
   * 天色：太陽的方位決定霞光落在哪一邊
   *
   * 天邊直接用霧色。遠處的地面本來就被霧染成那個顏色，
   * 天與地在地平線上用同一個顏色交會，接縫才會消失
   */
  function applyToSky(skyMaterial: ShaderMaterial | null): void {
    if (!skyMaterial)
      return

    applySkyGradient(skyMaterial, {
      zenithColor: sample.skyZenithColor,
      midColor: sample.skyMidColor,
      horizonColor: sample.fogColor,
      glowColor: sample.skyGlowColor,
      counterColor: sample.skyCounterColor,
      glowStrength: sample.skyGlowStrength,
      sunDirection: sample.sunPosition,
    })
  }

  /** 色調：夜裡偏冷、黃昏偏暖，曝光也跟著時刻與洞穴深度走 */
  function applyToPipeline(pipeline: DefaultRenderingPipeline | undefined, atmosphere: AtmosphereState): void {
    if (!pipeline)
      return

    /**
     * 只在真的差得夠多時才寫
     *
     * 這四個屬性每寫一次都很貴，貴在一個看不見的連鎖：
     * 每一份用到場景影像處理設定的材質都訂閱了它的 onUpdateParameters，
     * 收到通知就呼叫 _markAllSubMeshesAsImageProcessingDirty——
     * 把自己所有子網格標記成待重建。
     *
     * 這個場景有兩百多顆網格，每幀寫四次等於每幀讓全場材質失效四次。
     * 實測這一項就吃掉五毫秒，佔整幀的四分之一還多。
     *
     * 而這幾個值是色調分級，一整天才走完一輪。
     * 曝光差不到千分之四、色相差不到半度，肉眼根本分不出來——
     * 那一幀就不必寫。撥時間軸時因為變化夠大，照樣是即時跟上的
     */
    /**
     * 洞穴加成疊在日夜的曝光基準上，寫進同一個節流門檻
     *
     * atmosphere.caveRatio 是漫遊控制器上一幀寫的——日夜循環的算繪順序
     * 排在漫遊控制器之前（見 main-scene.vue 的 init），這裡讀到的必然
     * 是上一幀的值，差了一幀而已，caveRatio 本身變化又慢，看不出來。
     *
     * 不另外開一條寫入路徑：兩處各自寫 pipeline.imageProcessing.exposure
     * 的話，洞穴加成會在下一幀被當成新的基準疊乘上去，越滾越誇張
     */
    const targetExposure = sample.exposure * computeCaveExposureMultiplier(atmosphere.caveRatio)
    if (Math.abs(targetExposure - appliedExposure) >= EXPOSURE_STEP) {
      appliedExposure = targetExposure
      pipeline.imageProcessing.exposure = targetExposure
    }

    const colorCurves = pipeline.imageProcessing.colorCurves
    if (!colorCurves)
      return

    if (Math.abs(sample.gradeHue - appliedHue) >= GRADE_STEP) {
      appliedHue = sample.gradeHue
      colorCurves.globalHue = sample.gradeHue
    }
    if (Math.abs(sample.gradeDensity - appliedDensity) >= GRADE_STEP) {
      appliedDensity = sample.gradeDensity
      colorCurves.globalDensity = sample.gradeDensity
    }
    if (Math.abs(sample.gradeSaturation - appliedSaturation) >= GRADE_STEP) {
      appliedSaturation = sample.gradeSaturation
      colorCurves.globalSaturation = sample.gradeSaturation
    }
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
    /** 同上，晨霧要靠它認出天亮前的那一段 */
    getTimeOfDay: () => currentTime,
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
