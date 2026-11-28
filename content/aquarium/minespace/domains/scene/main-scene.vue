<template>
  <div
    class="relative w-full h-full"
    :class="{ 'cursor-hidden': isHudFaded }"
  >
    <canvas
      :key="canvasKey"
      ref="canvasRef"
      class="w-full h-full outline-0"
      @contextmenu="$event.preventDefault()"
    />

    <div
      v-if="isCursorFree && !status.isDrifting"
      class="cursor-hint"
    >
      {{ t('cursorReleased') }}
    </div>

    <ambience-panel
      v-if="hasStarted"
      class="hud-fadable"
      :class="{ 'hud-faded': isHudFaded }"
      :audible-list="audibleList"
      :zone="status.zone"
      :realm="currentRealm.hasGardens ? null : currentRealm"
      @toggle-mute="toggleSoundMute"
    />

    <touch-control-panel
      v-if="hasStarted && isMobile"
      :joystick-active="joystickActive"
      :joystick-origin="joystickOrigin"
      :joystick-offset="joystickOffset"
      :is-drifting="status.isDrifting"
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
      :travel-enabled="currentRealm.hasGardens"
      :realm-title="locale === 'en' ? currentRealm.title.en : currentRealm.title['zh-hant']"
      :realm-icon="currentRealm.icon"
      @resume="closeMenu()"
      @intro="introVisible = true"
      @travel="handleTravel"
      @return-hub="handleReturnHub"
      @drift="handleMenuDrift"
    />

    <start-panel
      v-if="!hasStarted || introVisible"
      :ready="isWorldReady && !initError"
      :is-reopened="introVisible"
      @start="handleStartPanelConfirm()"
      @drift="handlePickDrift"
    />

    <!--
      神遊中的提示

      離開的方式依裝置不同：桌機按移動鍵，手機碰左半邊（那是搖桿的位置）。
      跟其他 HUD 一起淡出，不留在畫面上擋景
    -->
    <div
      v-if="status.isDrifting && !menuVisible"
      class="drift-indicator hud-fadable"
      :class="{ 'hud-faded': isHudFaded }"
      role="status"
    >
      <UIcon
        name="i-material-symbols:self-improvement-outline"
        class="text-sm"
      />
      {{ isMobile ? t('driftingHintMobile') : t('driftingHint') }}
    </div>

    <!--
      錯誤提示

      不掛在 hasStarted 底下：場景初始化那一段最容易出錯，
      那時候世界還沒開始也該看得到這個提示
    -->
    <div
      v-if="errorCount > 0"
      class="error-badge hud-fadable"
      :class="{ 'hud-faded': isHudFaded }"
    >
      {{ t('errorBadge', { count: errorCount }) }}
    </div>

    <!--
      沒有錯誤時也要說得出「F6 有東西可以匯」

      匯出的紀錄除了錯誤還有一整段執行時狀態，而那一段正是
      「沒有錯誤但東西就是沒出現」時唯一查得到的東西。
      沒有任何提示的話，沒人會想到去按
    -->
    <div
      v-else-if="isDevBuild"
      class="diagnostic-badge hud-fadable"
      :class="{ 'hud-faded': isHudFaded }"
    >
      {{ t('diagnosticBadge') }}
    </div>

    <!-- 正在看哪一種除錯檢視，不標出來會忘記自己按到第幾號 -->
    <div
      v-if="devToggle.volumetricDebug && status.debugModeLabel"
      class="debug-mode-badge hud-fadable"
      :class="{ 'hud-faded': isHudFaded }"
    >
      {{ status.debugModeLabel }}
    </div>

    <div
      v-if="hasStarted && !menuVisible"
      class="status-stack hud-fadable"
      :class="{ 'hud-faded': isHudFaded }"
    >
      <div class="status-readout time-readout">
        <UIcon
          :name="status.isNight ? 'i-material-symbols:dark-mode-outline' : 'i-material-symbols:light-mode-outline'"
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
        {{ Math.round(status.fps) }} FPS
      </div>

      <!--
        效能面板

        幀率只說「慢」，不說「慢在哪」。F3 打開才建立計時器，
        平常一毫秒都不花
      -->
      <div
        v-if="status.isProbeVisible"
        class="status-readout probe-readout"
      >
        <template v-if="probe">
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
        </template>
        <div
          v-else
          class="probe-row"
        >
          <span>{{ t('probeMeasuring') }}</span>
        </div>
      </div>
    </div>

    <dev-panel v-if="hasStarted && devPanelVisible" />

    <!-- 神遊除錯面板：只在開發模式掛上來，F10 開關，開著時不跟著其他介面淡出（見元件本身的說明） -->
    <drift-debug-panel
      v-if="isDevBuild && hasStarted"
      :snapshot="status.isDrifting ? driftDebugSnapshot : null"
      @toggle="postCommand({ command: 'set-drift-debug', isEnabled: $event })"
    />

    <!--
      渲染端停住的提示

      與「初始化失敗」那塊全螢幕覆蓋是兩回事：世界已經跑起來之後才停住，
      多半只是暫時卡住或系統在回收記憶體，不該擋住畫面。
      這只是一條可以關掉的提醒，渲染端一恢復它自己就消失
    -->
    <div
      v-if="isRenderStalled && !isStalledNoticeDismissed"
      class="stalled-notice"
      role="status"
    >
      <span>{{ t('stalledNotice') }}</span>
      <button
        class="stalled-dismiss"
        @click="isStalledNoticeDismissed = true"
      >
        {{ t('dismiss') }}
      </button>
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
import type { RealmId } from '../realm/realm-definition'
import type { Landmark } from '../world/landmark'
import { until, useEventListener, useIdle } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import AmbiencePanel from '../../components/ambience-panel.vue'
import DevPanel from '../../components/dev-panel.vue'
import DriftDebugPanel from '../../components/drift-debug-panel.vue'
import StartPanel from '../../components/start-panel.vue'
import SystemMenu from '../../components/system-menu.vue'
import TouchControlPanel from '../../components/touch-control-panel.vue'
import { getSectionLabel } from '../../composables/performance-reading'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { exportErrorLog, useErrorLogger } from '../../composables/use-error-logger'
import { useSimpleI18n } from '../../composables/use-simple-i18n'
import { getNextRealmId, getRealm } from '../realm/realm-list'
import { useInputCapture } from '../render-host/use-input-capture'
import { useRenderHost } from '../render-host/use-render-host'
import { useRenderPreference } from '../render-host/use-render-preference'
import { useSoundscape } from '../soundscape/use-soundscape'
import { reloadWithHandoff } from './reload-handoff'

const { t, locale } = useSimpleI18n({
  'zh-hant': {
    initFailed: '初始化失敗',
    cursorReleased: '滑鼠已放開，點一下畫面回到漫遊',
    errorBadge: '偵測到 {count} 種錯誤或警告，已寫入 logs/minespace-issues.log，F6 更新',
    diagnosticBadge: 'F6 寫入執行時狀態',
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
    probeMeasuring: '量測中⋯',
    stalledNotice: '畫面似乎停住了，若沒有自己恢復，請重新整理頁面',
    dismiss: '關閉',
    driftingHint: '神遊中 · 拖曳轉頭，按任意移動鍵離開',
    driftingHintMobile: '神遊中 · 碰左半邊畫面離開',
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
    errorBadge: '{count} issue type(s) logged to logs/minespace-issues.log — press F6 to refresh',
    diagnosticBadge: 'F6 writes runtime state',
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
    probeMeasuring: 'Measuring…',
    stalledNotice: 'The view seems to have stalled. Reload the page if it does not recover',
    dismiss: 'Dismiss',
    driftingHint: 'Drifting · drag to look, press any movement key to exit',
    driftingHintMobile: 'Drifting · touch the left half to exit',
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

/**
 * 錯誤紀錄
 *
 * 越早裝越好——場景初始化那一段最容易出錯，晚裝的話漏接前面幾個。
 * errorCount 給右上角的提示用，累積到大於零才顯示「按 F6 匯出」
 */
const { errorCount } = useErrorLogger()
/** 那個「按 F6」的提示只在本地開發時出現，正式站上不該有 */
const isDevBuild = import.meta.env.DEV

/** 神遊前的換場景最多等多久（毫秒）；轉場加建世界約幾秒，留足餘裕 */
const DRIFT_SWITCH_TIMEOUT = 20000

const hasStarted = ref(false)
const menuVisible = ref(false)
/** 從選單再次打開的說明頁 */
const introVisible = ref(false)
/** 停住的提示被使用者關掉了；渲染端恢復之後要重設，下一次停住才會再出現 */
const isStalledNoticeDismissed = ref(false)

/**
 * 使用者的偏好
 *
 * 全部記在瀏覽器裡，由這一邊持久化，渲染端只收訊息（見 use-render-host）
 */
const {
  quality,
  pack: texturePack,
  cameraFov,
  sunAzimuth,
  isAutoAdvance,
  daySpeedRatio,
} = useRenderPreference()

/**
 * 渲染端
 *
 * Babylon 的場景、世界生成與所有每幀的邏輯都不在這個元件裡，
 * 而是在 worker（或退路上的主執行緒）。這裡只剩介面、輸入與音訊：
 * 畫布交過去、設定與尺寸的變動送過去，狀態讀回來
 */
const canvasRef = ref<HTMLCanvasElement>()
const {
  isWorldReady,
  initError,
  isRenderStalled,
  canvasKey,
  worldState,
  realmId,
  status,
  probe,
  postInput,
  postCommand,
  requestHandoff,
  shouldResumeDrift,
  driftDebugSnapshot,
  setTimeOfDay,
  addPoseHandler,
  addSoundHandler,
  addTransitionHandler,
} = useRenderHost({ canvasRef, locale })

/** 目前所在的場景，HUD 與選單要看它決定顯示什麼 */
const currentRealm = computed(() => getRealm(realmId.value))

watch(isRenderStalled, (isStalled) => {
  if (!isStalled) {
    isStalledNoticeDismissed.value = false
  }
})

/**
 * 輸入
 *
 * 鍵盤、滑鼠、滾輪、pointer lock 與觸控都留在主執行緒，
 * 整理成訊息送給渲染端。暫停與游標是否放開也由這裡決定
 */
const {
  start: startInput,
  resume,
  pause,
  isPaused,
  isCursorFree,
  isMobile,
  joystickActive,
  joystickOffset,
  joystickOrigin,
  setJump,
  setSprint,
  freeCursorForDrift,
} = useInputCapture({
  canvasRef,
  hasStarted,
  postInput,
  postCommand,
  isDrifting: computed(() => status.isDrifting),
})

/** 世界準備好才開始接輸入，之前的按鍵與點擊沒有東西可以操控 */
watch(isWorldReady, (isReady) => {
  if (isReady) {
    startInput()
  }
})

/**
 * 音訊
 *
 * Web Audio 在 worker 裡不存在，音景留在主執行緒：
 * 聽者跟著渲染端送來的鏡頭位姿走，天氣與日夜從狀態讀，雷聲由渲染端點名要它響
 */
const {
  start: startSoundscape,
  setWorld: setSoundscapeWorld,
  playTransitionSound,
  updatePose,
  setWeather,
  triggerSound,
  toggleSoundMute,
  audibleList,
  masterVolume,
  isMuted,
} = useSoundscape()

addPoseHandler(updatePose)
addSoundHandler(({ id, volume, position }) => triggerSound(id, { volume, position }))
/** 穿過傳送門時霧湧上來的那一陣聲音，換好場景時由音景自己淡出 */
addTransitionHandler(({ sound, durationSecond }) => void playTransitionSound(sound, durationSecond))
watch(() => status.weather, (current) => setWeather(current))
/**
 * 換場景後世界整份換掉，音源要照新的地形與場景的清單重種
 *
 * 場景 id 與方塊資料是同一則訊息一起改的，這裡讀得到的一定是同一組。
 * 第一次的 ready 時音景還沒啟動，不會有事
 */
watch(worldState, (current) => {
  if (current) {
    setSoundscapeWorld(current, realmId.value)
  }
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

/**
 * 換畫質就整頁重來，人留在原地
 *
 * 一級畫質決定的東西裡有一半是建立當下才接得上去的：幾何的多重取樣、
 * 後製鏈上有哪幾支、體素全局光要不要開工。這些在活著的場景上改不動，
 * 於是原本切過去只換到一半——影子與貼圖立刻變了，體積光與抗鋸齒卻
 * 要等下次進來才出現。使用者看到的是「這個選項好像沒作用」。
 *
 * 那就重來。重來之前先向渲染端要一份人在哪、看著哪、幾點鐘，寄放起來，
 * 新的一輪起來時原地接回去（見 reload-handoff）。
 *
 * 不能加 immediate：立即執行的語意本身就是錯的——
 * 一進來就重新整理會變成無窮迴圈
 */
watch(quality, async () => {
  /**
   * 還沒進去就沒有位置好接
   *
   * 開始面板還開著時人根本還沒站進世界，這時的位置是預設值。
   * 存下去只是把出生點寫進交接，不如不存
   */
  if (!hasStarted.value || !isWorldReady.value) {
    window.location.reload()

    return
  }

  const handoff = await requestHandoff()
  if (!handoff) {
    window.location.reload()

    return
  }

  reloadWithHandoff(handoff)
})

/** 右上角與選單都用同一份讀數：時刻加上這個時段的名字 */
const timeLabel = computed(() => `${status.clockText} ${t(status.phase)}`)

/**
 * 選單裡的時間軸
 *
 * 讀的是循環自己在走的時刻，寫回去則是直接跳過去。
 * 手機沒有滾輪，這是唯一調時間的地方。
 * 寫的時候先改本地的讀數，滑桿才不會等渲染端下一次回報才跟上手（見 use-render-host）
 */
const timeOfDay = computed({
  get: () => status.timeOfDay,
  set: (value: number) => setTimeOfDay(value),
})

/**
 * 神遊中的介面淡出
 *
 * 滑鼠、觸控、滾輪、按鍵都算有動靜（useIdle 預設的事件再加上 touchmove：
 * 手機上拖著看風景是持續的，不該被當成沒動靜）。指標鎖定時 mousemove 照樣會送出
 */
const HUD_IDLE_TIMEOUT = 4000
const { idle: isInputIdle } = useIdle(HUD_IDLE_TIMEOUT, {
  events: ['mousemove', 'mousedown', 'resize', 'keydown', 'touchstart', 'touchmove', 'wheel'],
})
/** 選單開著時介面本來就是蓋住的，不淡；只有神遊中放著不動才淡 */
const isHudFaded = computed(() => status.isDrifting && isInputIdle.value && !menuVisible.value)

/** 這些鍵一按就離開神遊，在原地接手 */
const DRIFT_EXIT_KEY_SET = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
])

function stopDrift() {
  postCommand({ command: 'stop-drift' })
}

/**
 * 一開始神遊就放開滑鼠
 *
 * 不管是從開始畫面、選單還是換畫質後接續，進來的那一刻滑鼠可能已經鎖著；
 * 神遊是拿來看、拿來聽的，游標還給桌面，轉頭改成按住左鍵拖曳
 */
watch(() => status.isDrifting, (isDrifting) => {
  if (isDrifting) {
    freeCursorForDrift()
  }
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  /** 選單開著時按鍵是給選單的，神遊照常在後面走 */
  if (status.isDrifting && !menuVisible.value && DRIFT_EXIT_KEY_SET.has(event.code) && !event.repeat) {
    /** 焦點在選單按鈕上時，空白鍵是在「按下那顆按鈕」，不是移動 */
    const isOnControl = event.target instanceof HTMLElement
      && event.target.closest('button, a, input, select, textarea')
    if (!isOnControl) {
      stopDrift()
      /**
       * 移動鍵是「我要自己走」：順手把滑鼠鎖回來接手操控（按鍵本身就是使用者手勢，鎖得上）。
       * Esc 不算離開：游標自由時 Esc 會叫出選單，神遊在選單後面繼續
       */
      resume()
    }
  }

  if (event.code === 'F3') {
    /** F3 在瀏覽器是「尋找下一個」，這裡要攔下來 */
    event.preventDefault()
    postCommand({ command: 'toggle-probe' })
    return
  }

  /** F4 接在效能面板旁邊：一個看「慢在哪」、一個看「這是誰畫的」 */
  if (event.code === 'F4') {
    event.preventDefault()
    toggleDevPanel()
  }

  /**
   * F6 手動匯出錯誤紀錄
   *
   * 自動下載會被瀏覽器擋下來是常態——這是按鍵觸發的，
   * 是真的使用者手勢，瀏覽器不會擋
   */
  if (event.code === 'F6') {
    event.preventDefault()
    exportErrorLog()
  }

  /**
   * F7 換下一種體積光的除錯檢視
   *
   * 空間性的瑕疵靠文字紀錄查不出來，只能把中間量單獨畫出來看。
   * 要先在 F4 面板打開「體積光除錯檢視」，這個鍵才有東西可換。
   * 檢視的名字由渲染端隨狀態送回來
   */
  if (event.code === 'F7') {
    event.preventDefault()
    postCommand({ command: 'cycle-debug-mode' })
  }

  /**
   * F8 逐道工序的 GPU 計時，只在本地開發有用
   *
   * 要先按 F3 開效能面板，計時結果以「GPU 工序名」與「CPU 工序名」的列併進那份清單
   */
  if (event.code === 'F8' && import.meta.env.DEV) {
    event.preventDefault()
    postCommand({ command: 'toggle-pass-timer' })
  }

  /**
   * F9 換到清單裡的下一個場景，只在本地開發有用
   *
   * 走的是與傳送門同一段轉場（霧湧上、換、霧散開），
   * 拿來連換十次確認拆掉重建不會漏東西，不必每次都走到門口
   */
  if (event.code === 'F9' && import.meta.env.DEV) {
    event.preventDefault()
    postCommand({ command: 'switch-realm', realmId: getNextRealmId(realmId.value) })
  }
})

/** 桌機以 Pointer Lock 狀態決定選單開關 */
watch(isPaused, (paused) => {
  if (!hasStarted.value || isMobile.value)
    return

  menuVisible.value = paused
})

/** 手機左半邊的觸碰是搖桿，在神遊中等於「我要自己走」 */
watch(joystickActive, (isActive) => {
  if (isActive && status.isDrifting) {
    stopDrift()
  }
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
  if (!isWorldReady.value || !worldState.value)
    return

  hasStarted.value = true

  /** 天氣與粒子在渲染端建，雷聲歸聽雨亭，渲染端要它響時會點名過來 */
  postCommand({ command: 'start' })

  /** 換畫質重來前正在神遊，進場後接著神遊（見 reload-handoff） */
  if (shouldResumeDrift) {
    postCommand({ command: 'start-drift' })
  }

  await startSoundscape({
    worldState: worldState.value,
    realmId: realmId.value,
    getDayRatio: () => status.dayRatio,
    getTimeOfDay: () => status.timeOfDay,
    getRainRatio: () => status.rainRatio,
    getSnowRatio: () => status.snowRatio,
    checkDrifting: () => status.isDrifting,
  })

  resume()
}

/**
 * 開始畫面的「神遊」：挑了一座大場景
 *
 * 流程與「開始漫遊」同一條（含指標鎖定），之後切到那座場景，
 * 等 realm-changed 回來（realmId 更新）才送 start-drift：換場景是整份世界重建，
 * 太早送的話指令會落在即將被拆掉的舊世界上
 */
async function handlePickDrift(targetRealmId: RealmId) {
  if (introVisible.value) {
    introVisible.value = false
    resume()
  }
  else {
    await handleStart()
  }

  await startDriftIn(targetRealmId)
}

/**
 * 選單的「神遊」
 *
 * 大場景裡留在當下這座場景；在大廳則是從清單挑了一座，換過去再開始
 */
function handleMenuDrift(targetRealmId?: RealmId) {
  closeMenu()
  void startDriftIn(targetRealmId ?? realmId.value)
}

async function startDriftIn(targetRealmId: RealmId) {
  if (targetRealmId !== realmId.value) {
    postCommand({ command: 'switch-realm', realmId: targetRealmId })
    /** 逾時就放棄：換場景失敗時不該讓這裡無限等下去 */
    const isSwitched = await until(realmId).toBe(targetRealmId, { timeout: DRIFT_SWITCH_TIMEOUT }).then(() => true, () => false)
    if (!isSwitched)
      return
  }

  postCommand({ command: 'start-drift' })
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

  /**
   * 神遊中打開選單不會中斷神遊：鏡頭在選單後面照樣走，關掉選單就接著看。
   * 這時回到的是游標自由的神遊狀態，不去鎖定滑鼠
   */
  if (status.isDrifting) {
    freeCursorForDrift()
    return
  }

  resume()
}

/** 快速前往：渲染端會從目標點往外找一個站得住腳的位置，免得卡在樹上或方塊裡 */
function handleTravel(landmark: Landmark) {
  postCommand({ command: 'travel', x: landmark.x, z: landmark.z, yaw: landmark.yaw })

  closeMenu()
}

/**
 * 從大場景直接回禪庭
 *
 * 落點借這個場景回程那道門的：走門回去的人站在哪裡，按選單回去的人就站在哪裡，
 * 也就是禪庭裡那座箱庭的門前，一回頭就看得到剛才去過的地方
 */
function handleReturnHub() {
  const returnPortal = currentRealm.value.portalList
    .find((portal) => portal.targetRealmId === 'hub')
  postCommand({ command: 'switch-realm', realmId: 'hub', spawn: returnPortal?.targetSpawn })

  closeMenu()
}
</script>

<style scoped lang="sass">
/** 神遊時介面淡出，游標也一起藏起來，畫面上只剩風景 */
.cursor-hidden
  cursor: none

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

/** 開發模式的錯誤提示，擺左上角跟右上角的狀態堆疊分開，不會疊在一起 */
.error-badge
  position: absolute
  left: 12px
  top: 12px
  padding: 4px 10px
  border-radius: 4px
  background: rgba(120, 20, 20, 0.75)
  color: rgba(255, 255, 255, 0.92)
  font-size: 12px
  z-index: 50
  pointer-events: none

/** 渲染端停住的提醒：擺在下方中間，不擋住畫面中央也不蓋住左右兩側的面板 */
.stalled-notice
  position: absolute
  left: 50%
  bottom: 72px
  transform: translateX(-50%)
  display: flex
  align-items: center
  gap: 12px
  max-width: calc(100% - 24px)
  padding: 6px 12px
  border-radius: 6px
  background: rgba(120, 70, 10, 0.85)
  color: rgba(255, 255, 255, 0.92)
  font-size: 13px
  z-index: 55

.stalled-dismiss
  flex: none
  padding: 2px 10px
  border: 1px solid rgba(255, 255, 255, 0.5)
  border-radius: 4px
  color: inherit
  font-size: 12px
  cursor: pointer

/**
 * 神遊中放著不動就淡掉的 HUD
 *
 * 淡出時一併關掉互動：看不見的東西不該還吃到點擊（環境音面板的靜音鈕要點）
 */
.hud-fadable
  transition: opacity 0.8s ease

.hud-faded
  opacity: 0
  pointer-events: none !important

.drift-indicator
  position: absolute
  left: 50%
  bottom: 28px
  transform: translateX(-50%)
  display: flex
  align-items: center
  gap: 6px
  max-width: calc(100% - 24px)
  padding: 5px 14px
  border-radius: 999px
  background: rgba(0, 0, 0, 0.45)
  color: rgba(255, 255, 255, 0.82)
  font-size: 12px
  letter-spacing: 0.04em
  white-space: nowrap
  pointer-events: none
  user-select: none
  z-index: 40

/** 除錯檢視的模式標示，擺在提示底下不擋住畫面中央 */
.debug-mode-badge
  position: absolute
  left: 12px
  top: 40px
  padding: 4px 10px
  border-radius: 4px
  background: rgba(0, 0, 0, 0.55)
  color: rgba(255, 255, 255, 0.9)
  font-size: 12px
  z-index: 50
  pointer-events: none

/** 沒有錯誤時那一版，淡得多——它只是一句提醒，不是警訊 */
.diagnostic-badge
  position: absolute
  left: 12px
  top: 12px
  padding: 4px 10px
  border-radius: 4px
  background: rgba(0, 0, 0, 0.35)
  color: rgba(255, 255, 255, 0.5)
  font-size: 12px
  z-index: 50
  pointer-events: none
</style>
