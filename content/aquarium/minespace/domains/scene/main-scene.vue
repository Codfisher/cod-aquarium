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
      :audible-list="displayAudibleList"
      :zone="currentZone"
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

      <div class="status-readout">
        {{ Math.round(fps) }} FPS
      </div>
    </div>

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
import type { VoxelRenderer } from '../renderer/voxel-renderer'
import type { AudibleSound, SoundZone } from '../soundscape/type'
import type { Landmark } from '../world/landmark'
import { useStorage } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AmbiencePanel from '../../components/ambience-panel.vue'
import StartPanel from '../../components/start-panel.vue'
import SystemMenu from '../../components/system-menu.vue'
import TouchControlPanel from '../../components/touch-control-panel.vue'
import { createCampfireSmoke, DEFAULT_CAMERA_FOV, useBabylonScene } from '../../composables/use-babylon-scene'
import { useBlockLights } from '../../composables/use-block-lights'
import { useDayNight } from '../../composables/use-day-night'
import { useFpsController } from '../../composables/use-fps-controller'
import { useMobileController } from '../../composables/use-mobile-controller'
import { useSimpleI18n } from '../../composables/use-simple-i18n'
import { useSheepFlock } from '../fauna/use-sheep-flock'
import { getGardenAt } from '../garden/garden-layout'
import { createSandField } from '../garden/sand-field'
import { findSafeStandingPosition } from '../player/collision'
import { createVoxelRenderer } from '../renderer/voxel-renderer'
import { useSoundscape } from '../soundscape/use-soundscape'
import { createGodRays } from '../weather/god-rays'
import { useWeather } from '../weather/use-weather'
import { useChunkWorker } from '../world/use-chunk-worker'
import { useTerrainWorker } from '../world/use-terrain-worker/use-terrain-worker'
import { castRainRay, createWorldState } from '../world/world-access'

const { t } = useSimpleI18n({
  'zh-hant': {
    initFailed: '初始化失敗',
    cursorReleased: '滑鼠已放開，點一下畫面回到漫遊',
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
  audibleList,
  masterVolume,
  isMuted,
} = useSoundscape()

const {
  start: startWeather,
  weather,
  rainStrength,
  atmosphere,
} = useWeather()

const {
  start: startDayNight,
  setTimeOfDay,
  getDayRatio,
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

/**
 * HUD 顯示的音源清單
 *
 * 雨聲不是空間音源，不在音景清單裡，這裡補進去讓混音表完整
 */
const displayAudibleList = computed<AudibleSound[]>(() => {
  if (rainStrength.value < 0.02) {
    return audibleList.value
  }

  return [
    {
      id: 'weather-rain',
      title: { 'zh-hant': '落雨', 'en': 'Falling rain' },
      zone: 'rainvale',
      loudness: Math.min(1, rainStrength.value * 2),
      distance: 0,
    },
    ...audibleList.value,
  ]
})

const { canvasRef, scene, camera, pipeline, initError } = useBabylonScene({
  async init({ scene: sceneInstance, camera: cameraInstance, canvas }) {
    const terrainWorker = useTerrainWorker()
    worldState = await terrainWorker.generate()
    terrainWorker.terminate()

    const chunkWorker = useChunkWorker()
    renderer = createVoxelRenderer(sceneInstance, chunkWorker)
    await renderer.build(worldState)

    /** 方塊做的沙只到世界邊界，外面那片得等渲染器準備好材質再接上去 */
    createSandField(sceneInstance)

    sheepFlock.start({ scene: sceneInstance, worldState, camera: cameraInstance })
    createCampfireSmoke(sceneInstance, worldState)

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
      worldState,
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
      isRunning: () => hasStarted.value && !isPaused.value && !isCursorFree.value,
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
    castRainRay: (blockX, blockZ) => castRainRay(worldState, blockX, blockZ),
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
  renderer?.dispose()
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
</style>
