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
      :open="menuVisible"
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AmbiencePanel from '../../components/ambience-panel.vue'
import StartPanel from '../../components/start-panel.vue'
import SystemMenu from '../../components/system-menu.vue'
import TouchControlPanel from '../../components/touch-control-panel.vue'
import { createCampfireSmoke, useBabylonScene } from '../../composables/use-babylon-scene'
import { useFpsController } from '../../composables/use-fps-controller'
import { useMobileController } from '../../composables/use-mobile-controller'
import { useSimpleI18n } from '../../composables/use-simple-i18n'
import { useSheepFlock } from '../fauna/use-sheep-flock'
import { findSafeStandingPosition, PLAYER_HEIGHT } from '../player/collision'
import { createVoxelRenderer } from '../renderer/voxel-renderer'
import { useSoundscape } from '../soundscape/use-soundscape'
import { useWeather } from '../weather/use-weather'
import { getDominantBiomeId } from '../world/biome'
import { useChunkWorker } from '../world/use-chunk-worker'
import { useTerrainWorker } from '../world/use-terrain-worker/use-terrain-worker'
import { castRainRay, createWorldState, getSurfaceY } from '../world/world-access'

const { t } = useSimpleI18n({
  'zh-hant': {
    initFailed: '初始化失敗',
    cursorReleased: '滑鼠已放開，點一下畫面回到漫遊',
  },
  'en': {
    initFailed: 'Initialization Failed',
    cursorReleased: 'Cursor released — click the view to resume',
  },
} as const)

/** 區域顯示的更新間隔（秒） */
const ZONE_UPDATE_INTERVAL = 0.3

let worldState = createWorldState()
let renderer: VoxelRenderer | null = null

const isWorldReady = ref(false)
const hasStarted = ref(false)
const menuVisible = ref(false)
/** 從選單再次打開的說明頁 */
const introVisible = ref(false)
const currentZone = ref<SoundZone>('meadow')

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

const sheepFlock = useSheepFlock()

watch(weather, (current) => setWeather(current))

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

const { canvasRef, scene, camera, initError } = useBabylonScene({
  async init({ scene: sceneInstance, camera: cameraInstance, canvas }) {
    const terrainWorker = useTerrainWorker()
    worldState = await terrainWorker.generate()
    terrainWorker.terminate()

    const chunkWorker = useChunkWorker()
    renderer = createVoxelRenderer(sceneInstance, chunkWorker)
    await renderer.build(worldState)

    sheepFlock.start({ scene: sceneInstance, worldState, camera: cameraInstance })
    createCampfireSmoke(sceneInstance, worldState)

    if (isMobile.value) {
      setupTouchListeners(canvas)
    }

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
    isWorldReady.value = true
  },
})

/** 定時更新玩家所在區域，不需要每幀重算 */
function trackZone(sceneInstance: Scene) {
  let elapsed = 0

  sceneInstance.onBeforeRenderObservable.add(() => {
    elapsed += sceneInstance.getEngine().getDeltaTime() / 1000
    if (elapsed < ZONE_UPDATE_INTERVAL)
      return

    elapsed = 0

    /** 頭頂上方還有一大段地形，才算真的身在地底 */
    const isBelowSurface = getSurfaceY(
      worldState,
      Math.floor(position.x),
      Math.floor(position.z),
    ) > position.y + PLAYER_HEIGHT + 3

    currentZone.value = isUnderground.value && isBelowSurface
      ? 'cave'
      : getDominantBiomeId(position.x, position.z)
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
