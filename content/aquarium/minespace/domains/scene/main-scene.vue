<template>
  <div class="relative w-full h-full">
    <canvas
      v-once
      ref="canvasRef"
      class="w-full h-full outline-0"
      @contextmenu="$event.preventDefault()"
    />

    <div
      v-if="hasStarted && !menuVisible && !isCursorFree"
      class="crosshair"
    />

    <div
      v-if="isCursorFree"
      class="cursor-hint"
    >
      {{ t('cursorReleased') }}
    </div>

    <ambience-panel
      v-if="hasStarted"
      :audible-list="audibleList"
      :zone="currentZone"
      @toggle-mute="toggleSoundMute"
    />

    <touch-control-panel
      v-if="hasStarted && isMobile"
      :joystick-active="joystickActive"
      :joystick-origin="joystickOrigin"
      :joystick-offset="joystickOffset"
      @jump="setJump"
      @sprint="setSprint"
      @menu="openMenu()"
    />

    <system-menu
      v-model:volume="masterVolume"
      v-model:muted="isMuted"
      v-model:time-of-day="timeOfDay"
      v-model:auto-time="isAutoAdvance"
      v-model:day-speed="daySpeedRatio"
      v-model:camera-fov="cameraFov"
      v-model:sun-azimuth="sunAzimuth"
      :open="menuVisible"
      :time-label="timeLabel"
      @resume="closeMenu()"
      @intro="introVisible = true"
      @travel="handleTravel"
    />

    <start-panel
      v-if="!hasStarted || introVisible"
      :ready="isWorldReady && !initError"
      :is-reopened="introVisible"
      @start="handleStartPanelConfirm()"
    />

    <div
      v-if="hasStarted && !menuVisible"
      class="status-stack"
    >
      <div class="status-readout time-readout">
        <u-icon
          :name="isNight ? 'i-material-symbols:dark-mode-outline' : 'i-material-symbols:light-mode-outline'"
          class="text-sm"
        />
        {{ timeLabel }}
      </div>

      <!--
        目前用的是哪一套材質

        換材質包會直接關掉選單回到世界裡，於是換完之後畫面上
        沒有任何東西說得出剛剛換成了什麼。排在時刻底下而不是自成一格：
        右上角只該有一落東西，兩落會疊在一起
      -->
      <div class="status-readout pack-readout">
        <span>{{ locale === 'en' ? texturePack.title.en : texturePack.title['zh-hant'] }}</span>
        <span class="pack-readout-resolution">{{ texturePack.resolution }}×</span>
      </div>

      <div class="status-readout">
        {{ Math.round(fps) }} FPS
      </div>

      <!--
        效能面板

        幀率只說「慢」，不說「慢在哪」。F3 打開才建立計時器，
        平常一毫秒都不花
      -->
      <div
        v-if="probeVisible"
        class="status-readout probe-readout"
      >
        <div class="probe-row">
          <span>{{ t('probeDrawCall') }}</span><span>{{ probe.drawCallCount }}</span>
        </div>
        <div class="probe-row">
          <span>{{ t('probeActiveMesh') }}</span><span>{{ probe.activeMeshCount }}</span>
        </div>
        <div class="probe-row">
          <span>{{ t('probeTriangle') }}</span><span>{{ (probe.triangleCount / 1000).toFixed(0) }}k</span>
        </div>

        <div class="probe-divider" />

        <div class="probe-row">
          <span>{{ t('probeFrameCpu') }}</span><span>{{ probe.frameMs.toFixed(1) }}</span>
        </div>
        <div class="probe-row">
          <span>{{ t('probeFrameGpu') }}</span><span>{{ probe.gpuMs.toFixed(1) }}</span>
        </div>
        <div class="probe-row">
          <span>{{ t('probeInterFrame') }}</span><span>{{ probe.interFrameMs.toFixed(1) }}</span>
        </div>

        <div class="probe-divider" />

        <div class="probe-row">
          <span>{{ t('probeMeshSelection') }}</span><span>{{ probe.meshSelectionMs.toFixed(2) }}</span>
        </div>
        <div class="probe-row">
          <span>{{ t('probeRenderTarget') }}</span><span>{{ probe.renderTargetMs.toFixed(2) }}</span>
        </div>
        <div class="probe-row">
          <span>{{ t('probeParticle') }}</span><span>{{ probe.particleMs.toFixed(2) }}</span>
        </div>
        <div class="probe-row">
          <span>{{ t('probeShaderCompile') }}</span><span>{{ probe.shaderCompileMs.toFixed(2) }}</span>
        </div>

        <div class="probe-divider" />

        <div class="probe-row probe-total">
          <span>{{ t('probeObserver') }}</span><span>{{ probe.observerMs.toFixed(2) }}</span>
        </div>
        <div
          v-for="section in probe.sectionList"
          :key="section.name"
          class="probe-row"
        >
          <span>{{ getSectionLabel(section.name, locale === 'en') }}</span><span>{{ section.averageMs.toFixed(2) }}</span>
        </div>
      </div>
    </div>

    <dev-panel v-if="hasStarted && devPanelVisible" />

    <div
      v-if="initError"
      class="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white z-60 p-8"
    >
      <div class="text-xl font-bold mb-4 text-red-400">
        {{ t('initFailed') }}
      </div>
      <div class="text-sm text-gray-300 break-all max-w-md text-center">
        {{ initError }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { SandField } from '../garden/sand-field'
import type { WaterMirrors } from '../garden/water-mirror'
import type { LampGlow } from '../renderer/lamp-glow'
import type { TextureSkinner } from '../renderer/pixel-material'
import type { SceneDepth } from '../renderer/scene-depth'
import type { VoxelRenderer } from '../renderer/voxel-renderer'
import type { WaterCaustics } from '../renderer/water-caustics'
import type { WaterSurface } from '../renderer/water-surface'
import type { SoundZone } from '../soundscape/type'
import type { Landmark } from '../world/landmark'
import { useEventListener, useStorage } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AmbiencePanel from '../../components/ambience-panel.vue'
import DevPanel from '../../components/dev-panel.vue'
import StartPanel from '../../components/start-panel.vue'
import SystemMenu from '../../components/system-menu.vue'
import TouchControlPanel from '../../components/touch-control-panel.vue'
import { createCampfireSmoke, DEFAULT_CAMERA_FOV, useBabylonScene } from '../../composables/use-babylon-scene'
import { useBlockLights } from '../../composables/use-block-lights'
import { useDayNight } from '../../composables/use-day-night'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { useFpsController } from '../../composables/use-fps-controller'
import { useMobileController } from '../../composables/use-mobile-controller'
import { getSectionLabel, usePerformanceProbe } from '../../composables/use-performance-probe'
import { useSimpleI18n } from '../../composables/use-simple-i18n'
import { useTexturePack } from '../../composables/use-texture-pack'
import { useSheepFlock } from '../fauna/use-sheep-flock'
import { getGardenAt } from '../garden/garden-layout'
import { createSandField } from '../garden/sand-field'
import { createWaterMirrors } from '../garden/water-mirror'
import { findSafeStandingPosition } from '../player/collision'
import { createLampGlow } from '../renderer/lamp-glow'
import { createTextureSkinner } from '../renderer/pixel-material'
import { createSceneDepth } from '../renderer/scene-depth'
import { createVoxelRenderer } from '../renderer/voxel-renderer'
import { createWaterCaustics } from '../renderer/water-caustics'
import { createWaterSurface } from '../renderer/water-surface'
import { useSoundscape } from '../soundscape/use-soundscape'
import { DEFAULT_SUNRISE_AZIMUTH, setSunriseAzimuth } from '../weather/day-night'
import { createGodRays } from '../weather/god-rays'
import { useWeather } from '../weather/use-weather'
import { collectLightSourceList } from '../world/light-source'
import { useChunkWorker } from '../world/use-chunk-worker'
import { useTerrainWorker } from '../world/use-terrain-worker/use-terrain-worker'
import { createEmptyWaterMap, scanWaterMap } from '../world/water-body'
import { castRainRay, createWorldState } from '../world/world-access'

const { t, locale } = useSimpleI18n({
  'zh-hant': {
    initFailed: '初始化失敗',
    cursorReleased: '滑鼠已放開，點一下畫面回到漫遊',
    probeDrawCall: '繪製',
    probeActiveMesh: '網格',
    probeTriangle: '三角形',
    probeFrameCpu: '幀 CPU',
    probeFrameGpu: '幀 GPU',
    probeInterFrame: '幀距',
    probeMeshSelection: '挑選',
    probeRenderTarget: '陰影',
    probeParticle: '粒子',
    probeShaderCompile: '編譯',
    probeObserver: 'JS 合計',
    midnight: '深夜',
    dawn: '破曉',
    sunrise: '日出',
    morning: '早晨',
    noon: '正午',
    afternoon: '午後',
    sunset: '日落',
    dusk: '暮色',
    night: '入夜',
  },
  'en': {
    initFailed: 'Initialization Failed',
    cursorReleased: 'Cursor released — click the view to resume',
    probeDrawCall: 'Draws',
    probeActiveMesh: 'Meshes',
    probeTriangle: 'Tris',
    probeFrameCpu: 'CPU',
    probeFrameGpu: 'GPU',
    probeInterFrame: 'Frame gap',
    probeMeshSelection: 'Culling',
    probeRenderTarget: 'Shadow',
    probeParticle: 'Particles',
    probeShaderCompile: 'Compile',
    probeObserver: 'JS total',
    midnight: 'Midnight',
    dawn: 'Dawn',
    sunrise: 'Sunrise',
    morning: 'Morning',
    noon: 'Noon',
    afternoon: 'Afternoon',
    sunset: 'Sunset',
    dusk: 'Dusk',
    night: 'Nightfall',
  },
} as const)

/** 區域顯示的更新間隔（秒） */
const ZONE_UPDATE_INTERVAL = 0.3
/** 幀率讀數的更新間隔（秒），跳太快會看不清楚 */
const FPS_UPDATE_INTERVAL = 0.5

let worldState = createWorldState()
let renderer: VoxelRenderer | null = null
let lampGlow: LampGlow | null = null
let waterMirrors: WaterMirrors | null = null
let skinner: TextureSkinner | null = null
let sandField: SandField | null = null
let sceneDepth: SceneDepth | null = null
let waterSurface: WaterSurface | null = null
let waterCaustics: WaterCaustics | null = null
/** 世界上的水在哪裡，掃過一次就記著：漣漪與焦散都要問它 */
let waterMap = createEmptyWaterMap()

const isWorldReady = ref(false)
const hasStarted = ref(false)
const menuVisible = ref(false)
/** 從選單再次打開的說明頁 */
const introVisible = ref(false)
/**
 * 目前站在哪一座箱庭上
 *
 * 走在箱庭之間的白沙上時是 null，那是刻意留的空白：
 * 整趟漫遊的節奏就是「有聲—無聲—有聲」
 */
const currentZone = ref<SoundZone | null>(null)
/**
 * 目前幀率
 *
 * 第一人稱轉動視角的順不順，完全取決於幀率——
 * 滑鼠移多少就轉多少，與 deltaTime 無關，所以幀率一低，
 * 同樣的角度會被切成更少、更大的步進，看起來就是一段一段跳。
 * 有個讀數才判斷得出「卡」是幀率問題還是別的原因
 */
const fps = ref(0)

/**
 * 效能面板
 *
 * F3 開關，沿用方塊遊戲的老規矩。
 * 平常不建立計時器，量測本身也是要錢的
 */
const {
  visible: probeVisible,
  reading: probe,
  toggle: toggleProbe,
  update: updateProbe,
} = usePerformanceProbe()

const {
  isMobile,
  state: mobileState,
  joystickActive,
  joystickOffset,
  joystickOrigin,
  setupTouchListeners,
  consumeLookDelta,
  setJump,
  setSprint,
} = useMobileController()

const {
  start: startController,
  resume,
  pause,
  teleport,
  isPaused,
  isCursorFree,
  isUnderground,
  position,
} = useFpsController()

const {
  start: startSoundscape,
  setWeather,
  triggerSound,
  toggleSoundMute,
  audibleList,
  masterVolume,
  isMuted,
} = useSoundscape()

const {
  start: startWeather,
  weather,
  atmosphere,
} = useWeather()

const {
  start: startDayNight,
  setTimeOfDay,
  getDayRatio,
  getTimeOfDay,
  timeOfDay: currentTimeOfDay,
  isAutoAdvance,
  daySpeedRatio,
  phase: dayPhase,
  clockText,
  isNight,
} = useDayNight()

const sheepFlock = useSheepFlock()
const blockLights = useBlockLights()

/**
 * 材質包
 *
 * 換一套不必重建世界：方塊、羊與那片白沙的材質物件全都留著，
 * 只把貼圖換掉。風的擺動、淋雨會變暗的登記、水面的高光
 * 都掛在材質上，重建一次全都要重接一遍
 */
const { pack: texturePack, bumpActive } = useTexturePack()

watch([texturePack, bumpActive], ([currentPack, isBumpActive]) => {
  skinner?.applyPack(currentPack, isBumpActive)
  sandField?.applyPack(currentPack)
})

/**
 * 除錯用的效果開關
 *
 * F4 叫出來，每一項對應一個看得見的效果。
 * 畫面上冒出說不上來的東西時，一項一項關掉就知道是誰做的
 */
const {
  visible: devPanelVisible,
  state: devToggle,
  togglePanel: toggleDevPanel,
} = useDevToggles()

/** 水面高光是材質層的東西，開關要等渲染器建好才有得改 */
watch(() => devToggle.waterGlint, (isEnabled) => {
  renderer?.setWaterGlintEnabled(isEnabled)
})

/**
 * 鏡頭的視野角度
 *
 * 視野寬窄是很個人的事：寬的看得到兩側的木座、走起來有速度感，
 * 窄的則像站定了在看一幅畫。記在瀏覽器裡，下次進來還是同一個視角
 */
const cameraFov = useStorage('minespace-camera-fov', DEFAULT_CAMERA_FOV)

/**
 * 不能加 immediate
 *
 * 這個 watch 寫在 useBabylonScene 之前，而 camera 是那一行才解構出來的。
 * 立即執行會在 camera 還在暫時性死區時就去讀它，直接拋錯。
 * 初始值改在 init 裡等鏡頭建好之後補套一次
 */
watch(cameraFov, (value) => {
  if (camera.value) {
    camera.value.fov = value
  }
})

/**
 * 太陽從哪個方位升起
 *
 * 日出日落的位置原本是寫死的，挑的是「出生點面向北方時不會對著太陽」。
 * 那個選擇對第一眼是好的，但這座禪庭是給人待很久的——
 * 想看太陽從松籟林後面出來，或想讓整天的光都從池子那一側過來，
 * 都該是玩家自己決定的事
 */
const sunAzimuth = useStorage('minespace-sun-azimuth', DEFAULT_SUNRISE_AZIMUTH)

watch(sunAzimuth, (value) => setSunriseAzimuth(value), { immediate: true })

watch(weather, (current) => setWeather(current))

/** 右上角與選單都用同一份讀數：時刻加上這個時段的名字 */
const timeLabel = computed(() => `${clockText.value} ${t(dayPhase.value)}`)

/**
 * 選單裡的時間軸
 *
 * 讀的是循環自己在走的時刻，寫回去則是直接跳過去。
 * 手機沒有滾輪，這是唯一調時間的地方
 */
const timeOfDay = computed({
  get: () => currentTimeOfDay.value,
  set: (value: number) => setTimeOfDay(value),
})

const { canvasRef, scene, camera, pipeline, initError } = useBabylonScene({
  async init({ scene: sceneInstance, camera: cameraInstance, canvas }) {
    const terrainWorker = useTerrainWorker()
    worldState = await terrainWorker.generate()
    terrainWorker.terminate()

    const chunkWorker = useChunkWorker()
    skinner = createTextureSkinner(sceneInstance)
    skinner.applyPack(texturePack.value, bumpActive.value)

    /**
     * 世界上的水掃一次記著
     *
     * 要在渲染器之前：水面材質是建網格時掛上去的，
     * 而掛上去之後第一幀就會去讀這份資料
     */
    waterMap = scanWaterMap(worldState)

    renderer = createVoxelRenderer(sceneInstance, chunkWorker, skinner)
    await renderer.build(worldState)

    /**
     * 場景深度圖
     *
     * 光暈的柔性淡出與水面的岸線交線光共用這一張。
     * 低畫質會在它自己那邊關掉，兩個效果跟著歸零
     */
    sceneDepth = createSceneDepth({ scene: sceneInstance, camera: cameraInstance })

    /** 方塊做的沙只到世界邊界，外面那片得等渲染器準備好材質再接上去 */
    sandField = createSandField(sceneInstance, texturePack.value)

    /** 水鏡池的天空倒影，走近才畫 */
    waterMirrors = createWaterMirrors(sceneInstance, cameraInstance, worldState)

    /**
     * 水面的泡沫、岸線與漣漪，以及水底的焦散
     *
     * 兩者都是材質外掛，網格那邊早就掛好了；這裡建的是推動它們的那一份，
     * 負責寫時間、挑出離玩家最近的那片水、以及把腳步濺成一圈波
     */
    waterSurface = createWaterSurface({
      scene: sceneInstance,
      camera: cameraInstance,
      waterMap,
    })
    waterCaustics = createWaterCaustics({
      scene: sceneInstance,
      camera: cameraInstance,
      waterMap,
      getDayRatio,
    })

    sheepFlock.start({ scene: sceneInstance, worldState, camera: cameraInstance, getDayRatio, skinner })
    createCampfireSmoke(sceneInstance, worldState)

    /**
     * 世界裡的燈火只掃這一次
     *
     * 真光與夜裡的光暈用的是同一份清單，兩者本來就是同一盞燈的兩種表現
     */
    const lightSourceList = collectLightSourceList(worldState)

    /**
     * 燈火的光暈
     *
     * 方塊的自發光只讓燈自己看起來是亮的，光並沒有溢出它的邊界。
     * 夜裡在每一盞燈前面掛一片面向鏡頭的加法圓盤，光才會溢出來。
     *
     * 要帶鏡頭進去：圓盤得每一幀往鏡頭的方向挪出方塊之外，
     * 否則整團暈會被它自己那顆燈籠擋在後面
     */
    lampGlow = createLampGlow({
      scene: sceneInstance,
      camera: cameraInstance,
      sourceList: lightSourceList,
      getDayRatio,
    })

    /**
     * 燈池：燈籠與營火的真光
     *
     * 烘進方塊的那份光是乘在貼圖上的，夜裡會跟著光照一起被壓掉，
     * 燈只照得亮自己。這裡拿三盞真光輪流去認領離玩家最近的光源方塊，
     * 成本固定，與世界上有幾盞燈無關
     */
    blockLights.start({
      scene: sceneInstance,
      camera: cameraInstance,
      sourceList: lightSourceList,
      getDayRatio,
    })

    if (isMobile.value) {
      setupTouchListeners(canvas)
    }

    /**
     * 日夜循環要排在漫遊控制器前面
     *
     * 三個系統疊在同一份大氣狀態上，順序就是疊加的順序：
     * 日夜寫下這個時刻的基準、天氣疊上雨與霧、漫遊控制器最後套進場景。
     * 顛倒過來的話，套進場景的會是上一幀的天色
     */
    startDayNight({
      scene: sceneInstance,
      canvas,
      pipeline: pipeline.value,
      godRays: createGodRays(sceneInstance, cameraInstance),
      atmosphere,
      /** 放開滑鼠只是把游標還給桌面，人站在原地看風景，太陽照樣走 */
      isRunning: () => hasStarted.value && !isPaused.value,
      canScrubTime: () => hasStarted.value && !isPaused.value && !isCursorFree.value,
    })

    /** 鏡頭是在這之後才存在的，記在瀏覽器裡的視野要在這裡補套一次 */
    cameraInstance.fov = cameraFov.value

    startController({
      scene: sceneInstance,
      camera: cameraInstance,
      canvas,
      worldState,
      atmosphere,
      mobileControls: isMobile.value
        ? { state: mobileState, consumeLookDelta }
        : undefined,
    })
    pause()

    trackZone(sceneInstance)
    trackFps(sceneInstance)
    isWorldReady.value = true
  },
})

/** 定時更新幀率讀數 */
function trackFps(sceneInstance: Scene) {
  let elapsed = 0

  sceneInstance.onBeforeRenderObservable.add(() => {
    elapsed += sceneInstance.getEngine().getDeltaTime() / 1000
    if (elapsed < FPS_UPDATE_INTERVAL)
      return

    elapsed = 0
    fps.value = sceneInstance.getEngine().getFps()
  })

  /** 繪製呼叫要等這一幀畫完才數得到，所以掛在算繪之後 */
  sceneInstance.onAfterRenderObservable.add(() => updateProbe(sceneInstance))

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (event.code === 'F3') {
      /** F3 在瀏覽器是「尋找下一個」，這裡要攔下來 */
      event.preventDefault()
      toggleProbe(sceneInstance)
      return
    }

    /** F4 接在效能面板旁邊：一個看「慢在哪」、一個看「這是誰畫的」 */
    if (event.code === 'F4') {
      event.preventDefault()
      toggleDevPanel()
    }
  })
}

/** 定時更新玩家所在的箱庭，不需要每幀重算 */
function trackZone(sceneInstance: Scene) {
  let elapsed = 0

  sceneInstance.onBeforeRenderObservable.add(() => {
    elapsed += sceneInstance.getEngine().getDeltaTime() / 1000
    if (elapsed < ZONE_UPDATE_INTERVAL)
      return

    elapsed = 0
    currentZone.value = getGardenAt(position.x, position.z)?.id ?? null
  })
}

/** 桌機以 Pointer Lock 狀態決定選單開關 */
watch(isPaused, (paused) => {
  if (!hasStarted.value || isMobile.value)
    return

  menuVisible.value = paused
})

/** 說明頁的按鈕：第一次是開始漫遊，之後是關掉說明回到遊戲 */
function handleStartPanelConfirm() {
  if (introVisible.value) {
    introVisible.value = false
    resume()
    return
  }

  void handleStart()
}

async function handleStart() {
  if (!scene.value || !camera.value)
    return

  hasStarted.value = true

  await startSoundscape({
    scene: scene.value,
    camera: camera.value as UniversalCamera,
    worldState,
    getDayRatio,
  })

  await startWeather({
    scene: scene.value,
    camera: camera.value as UniversalCamera,
    isSheltered: () => isUnderground.value,
    /** 閃電歸天氣，雷聲歸聽雨亭，這裡只是把兩邊接起來 */
    playThunder: (volume) => triggerSound('rainvale-thunder', volume),
    castRainRay: (blockX, blockZ) => castRainRay(worldState, blockX, blockZ),
    waterMap,
    getDayRatio,
    getTimeOfDay,
    /** 雨停之後要慢慢乾回去的那些表面，水與花草不在其中 */
    wetMaterialList: renderer?.getWetMaterialList() ?? [],
  })

  resume()
}

function openMenu() {
  menuVisible.value = true
  pause()
}

function closeMenu() {
  /** 桌機的選單開關跟著 Pointer Lock 狀態走，鎖定失敗時選單會留在原地 */
  if (isMobile.value) {
    menuVisible.value = false
  }

  resume()
}

/** 快速前往：從目標點往外找一個站得住腳的位置，免得卡在樹上或方塊裡 */
function handleTravel(landmark: Landmark) {
  const { x, y, z } = findSafeStandingPosition(worldState, landmark.x, landmark.z)
  teleport(x, y, z)

  closeMenu()
}

onBeforeUnmount(() => {
  lampGlow?.dispose()
  waterSurface?.dispose()
  waterCaustics?.dispose()
  sceneDepth?.dispose()
  waterMirrors?.dispose()
  renderer?.dispose()
  sandField?.dispose()
  skinner?.dispose()
})
</script>

<style scoped lang="sass">
.crosshair
  position: absolute
  top: 50%
  left: 50%
  width: 5px
  height: 5px
  margin: -2.5px 0 0 -2.5px
  border-radius: 50%
  background: rgba(255, 255, 255, 0.55)
  mix-blend-mode: difference
  pointer-events: none

/** 時刻與幀率疊在同一落，右上角只佔一塊 */
.status-stack
  position: absolute
  right: 12px
  top: 12px
  display: flex
  flex-direction: column
  align-items: flex-end
  gap: 5px
  pointer-events: none
  user-select: none

/** 效能面板的數字要能上下對齊掃過去，等寬字體是必要的 */
.probe-readout
  display: flex
  flex-direction: column
  gap: 1px
  font-family: ui-monospace, monospace
  font-size: 12px
  line-height: 1.35
  min-width: 148px

/** 名稱靠左、數字靠右，一整欄才對得齊 */
.probe-row
  display: flex
  justify-content: space-between
  gap: 12px

.probe-total
  font-weight: 700

.probe-divider
  height: 1px
  margin: 3px 0
  background: rgba(255, 255, 255, 0.18)

.status-readout
  padding: 3px 8px
  border-radius: 4px
  background: rgba(0, 0, 0, 0.35)
  color: rgba(255, 255, 255, 0.65)
  font-size: 12px
  font-variant-numeric: tabular-nums

.time-readout
  display: flex
  align-items: center
  gap: 5px
  color: rgba(255, 255, 255, 0.82)
  letter-spacing: 0.02em

.cursor-hint
  position: absolute
  left: 50%
  bottom: 32px
  transform: translateX(-50%)
  padding: 6px 14px
  border-radius: 999px
  background: rgba(0, 0, 0, 0.55)
  color: rgba(255, 255, 255, 0.86)
  font-size: 13px
  letter-spacing: 0.02em
  white-space: nowrap
  pointer-events: none
  z-index: 40

/** 材質名稱與倍率同一行，名稱亮、倍率淡 */
.pack-readout
  display: flex
  align-items: baseline
  gap: 6px
  color: rgba(255, 255, 255, 0.82)

.pack-readout-resolution
  opacity: 0.6
  font-variant-numeric: tabular-nums
</style>
