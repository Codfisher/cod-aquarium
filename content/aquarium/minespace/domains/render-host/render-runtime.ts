import type { Scene } from '@babylonjs/core'
import type { SandField } from '../garden/sand-field'
import type { WaterMirrors } from '../garden/water-mirror'
import type { LampGlow } from '../renderer/lamp-glow'
import type { TextureSkinner } from '../renderer/pixel-material'
import type { SceneDepth } from '../renderer/scene-depth'
import type { VolumetricLight } from '../renderer/volumetric-light'
import type { VoxelGi } from '../renderer/voxel-gi'
import type { VoxelRenderer } from '../renderer/voxel-renderer'
import type { WaterCaustics } from '../renderer/water-caustics'
import type { WaterSurface } from '../renderer/water-surface'
import type { SoundZone } from '../soundscape/type'
import type {
  RenderChannel,
  RenderCommand,
  RenderDownMessage,
  RenderFrameStatusMessage,
  RenderInitMessage,
} from './protocol'
import { effectScope, toRaw, watch } from 'vue'
import { createBabylonScene, createCampfireSmoke } from '../../composables/use-babylon-scene'
import { useBlockLights } from '../../composables/use-block-lights'
import { useDayNight } from '../../composables/use-day-night'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { drainForwardedLog } from '../../composables/use-error-logger'
import { useFpsController } from '../../composables/use-fps-controller'
import { usePerformanceProbe } from '../../composables/use-performance-probe'
import { useTexturePack } from '../../composables/use-texture-pack'
import { useSheepFlock } from '../fauna/use-sheep-flock'
import { getGardenAt } from '../garden/garden-layout'
import { createSandField } from '../garden/sand-field'
import { createWaterMirrors } from '../garden/water-mirror'
import { findSafeStandingPosition } from '../player/collision'
import { auditFogOptOut } from '../renderer/fog-opt-out'
import { createLampGlow } from '../renderer/lamp-glow'
import { createTextureSkinner } from '../renderer/pixel-material'
import { createSceneDepth } from '../renderer/scene-depth'
import { createVolumetricLight, cycleVolumetricDebugMode } from '../renderer/volumetric-light'
import { createVoxelGi } from '../renderer/voxel-gi'
import { createVoxelRenderer } from '../renderer/voxel-renderer'
import { createWaterCaustics } from '../renderer/water-caustics'
import { createWaterSurface } from '../renderer/water-surface'
import { provideReloadHandoff } from '../scene/reload-handoff'
import { formatClock, getDayPhase, setSunriseAzimuth } from '../weather/day-night'
import { createGodRays } from '../weather/god-rays'
import { useWeather } from '../weather/use-weather'
import { collectLightSourceList } from '../world/light-source'
import { useChunkWorker } from '../world/use-chunk-worker'
import { useTerrainWorker } from '../world/use-terrain-worker/use-terrain-worker'
import { createEmptyWaterMap, scanWaterMap } from '../world/water-body'
import { castRainRay, createWorldState } from '../world/world-access'
import { applyRenderSettings, renderSettings } from './render-settings'

/** 玩家所在箱庭的更新間隔（秒），不需要每幀重算 */
const ZONE_UPDATE_INTERVAL = 0.3
/** 幀率讀數的更新間隔（秒），跳太快會看不清楚 */
const FPS_UPDATE_INTERVAL = 0.5

/** 狀態、鏡頭位姿與紀錄各自多久往主執行緒送一次（毫秒） */
const STATUS_POST_INTERVAL = 250
/**
 * 鏡頭位姿要夠密：音訊聽者只在收到時才更新，
 * 間隔太長，快速移動與轉頭時方位會一格一格跳（十六赫時約半格、六度，現在取約三十赫）
 */
const POSE_POST_INTERVAL = 33
/** 位置（格）與角度（弧度）小於這個差距就當作沒動 */
const POSE_EPSILON = 0.001
const POSE_ANGLE_EPSILON = 0.0005
const LOG_POST_INTERVAL = 250

export interface RenderRuntime {
  dispose: () => void;
}

interface CreateRenderRuntimeParam {
  channel: RenderChannel;
}

/**
 * 渲染執行期
 *
 * 場景、世界生成與所有每幀的邏輯都在這裡，不依賴任何 Vue 元件，
 * 也不碰 window、document 與儲存——所以同一份程式碼既跑得進 worker，
 * 也跑得進主執行緒（OffscreenCanvas 的 WebGL2 不能用時的退路）。
 *
 * 它與外界只有一條通道：收主執行緒的訊息（init、resize、settings、input、command），
 * 往主執行緒送狀態（ready、frame-status、pose、sound、log）。
 * 原本寫在 main-scene.vue 裡的初始化與開始漫遊的流程搬到了這裡，
 * 元件只剩介面與輸入
 */
export function createRenderRuntime({ channel }: CreateRenderRuntimeParam): RenderRuntime {
  /**
   * 所有 composable 都在這個 scope 裡建立
   *
   * 元件的 onBeforeUnmount 在這裡不存在，各個 composable 改用 onScopeDispose 登記收尾，
   * 由 dispose 一次停掉
   */
  const scope = effectScope()
  const timerIdList: ReturnType<typeof setInterval>[] = []

  let hasStarted = false
  let hasInitialized = false
  /**
   * 已經收掉了
   *
   * 初始化與開始漫遊都有好幾段 await（生成地形、建渲染器、建天氣）。
   * 收掉的時候它們多半還在半路上，醒來之後若不檢查，
   * 會繼續往一個已經釋放的場景上建東西
   */
  let isDisposed = false
  /**
   * 頁面目前是不是看得到
   *
   * 預設是看得到。主執行緒會在 init 之後告知實際的狀態，
   * 但訊息抵達時場景可能還沒建好，所以先記成旗標，建好之後再套用
   */
  let isVisible = true
  /** 狀態與位姿的回報計時器，頁面隱藏時整組停掉 */
  let reportTimerList: ReturnType<typeof setInterval>[] = []
  /** 上一次送出的鏡頭位姿，沒動就不送 */
  let lastPose: { x: number; y: number; z: number; pitch: number; yaw: number } | null = null
  let debugModeLabel = ''

  let worldState = createWorldState()
  /** 世界上的水在哪裡，掃過一次就記著：漣漪與焦散都要問它 */
  let waterMap = createEmptyWaterMap()

  let renderer: VoxelRenderer | null = null
  let lampGlow: LampGlow | null = null
  let waterMirrors: WaterMirrors | null = null
  let skinner: TextureSkinner | null = null
  let sandField: SandField | null = null
  let sceneDepth: SceneDepth | null = null
  let waterSurface: WaterSurface | null = null
  let waterCaustics: WaterCaustics | null = null
  let voxelGi: VoxelGi | null = null
  let volumetricLight: VolumetricLight | null = null

  let babylon: ReturnType<typeof createBabylonScene> | null = null
  let systems: ReturnType<typeof createSystems> | null = null

  /** 目前站在哪一座箱庭上，走在箱庭之間的白沙上時是 null */
  let currentZone: SoundZone | null = null
  let fps = 0

  /**
   * 每幀都在跑的那幾個系統
   *
   * 要在 scope 裡呼叫：它們內部用 onScopeDispose 登記收尾
   */
  function createSystems() {
    return {
      probe: usePerformanceProbe(),
      controller: useFpsController(),
      weatherSystem: useWeather(),
      dayNight: useDayNight(),
      sheepFlock: useSheepFlock(),
      blockLights: useBlockLights(),
      texturePack: useTexturePack(),
    }
  }

  channel.setMessageHandler((message) => {
    /**
     * 處理訊息的過程出了錯，要走得到錯誤通道
     *
     * handleMessage 是 async，直接 void 掉的話，開始漫遊時天氣建立失敗之類的例外
     * 會變成沒有人接的 unhandled rejection：開發時 worker 的攔截抓得到，
     * 正式版則連主控台都看不到來源。這裡接住並用 console.error 印出，
     * 開發時它會被攔截器收進紀錄、隨 log 訊息送回主執行緒
     */
    handleMessage(message).catch((error: unknown) => {
      console.error(`[RenderRuntime] 處理 ${message.type} 訊息時失敗:`, error)
    })
  })

  async function handleMessage(message: RenderDownMessage): Promise<void> {
    switch (message.type) {
      case 'init':
        await initialize(message)
        break
      case 'resize':
        babylon?.resize(message)
        break
      case 'settings':
        applyRenderSettings(message.patch)
        break
      case 'input':
        systems?.controller.applyInput(message)
        break
      case 'command':
        await runCommand(message.payload)
        break
      case 'dispose':
        dispose()
        break
      default:
        /** probe 只有 worker 的入口會處理，到不了這裡 */
        break
    }
  }

  async function initialize(message: RenderInitMessage): Promise<void> {
    if (hasInitialized || isDisposed)
      return

    hasInitialized = true

    try {
      applyRenderSettings(message.settings)
      provideReloadHandoff(message.handoff)

      scope.run(() => {
        systems = createSystems()
        watchSettings()

        babylon = createBabylonScene({
          canvas: message.canvas,
          viewport: message,
          onContextLost: () => {
            channel.post({ type: 'context-lost' })
          },
          onContextRestored: () => {
            channel.post({ type: 'context-restored' })
          },
        })
      })

      /** init 抵達之前頁面就已經在背景的話，這一刻才停得下來 */
      if (!isVisible) {
        babylon?.pauseRendering()
      }

      await buildWorld()
      if (isDisposed)
        return

      /**
       * 東西都建好了才掃
       *
       * 掃的是「有誰跳出了霧卻沒交代到邊界怎麼收」。
       * 世界邊界那道白幕靠霧遮，跳出霧的每一個都得自己接一條路，
       * 而漏掉的症狀是走到邊界還看得到它——通常沒人會特地走過去確認
       */
      if (import.meta.env.DEV && babylon) {
        auditFogOptOut(babylon.scene)
      }

      channel.post({ type: 'ready', worldState })
    }
    catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      console.error('[Babylon] 初始化失敗:', error)
      channel.post({ type: 'init-error', message: text })
    }
  }

  /** 設定一變，渲染端要跟著動的那幾件事 */
  function watchSettings() {
    if (!systems)
      return

    const { texturePack } = systems
    const { state: devToggle } = useDevToggles()

    /**
     * 材質包
     *
     * 換一套不必重建世界：方塊、羊與那片白沙的材質物件全都留著，
     * 只把貼圖換掉。風的擺動、淋雨會變暗的登記、水面的高光
     * 都掛在材質上，重建一次全都要重接一遍
     */
    watch([texturePack.pack, texturePack.bumpActive], ([currentPack, isBumpActive]) => {
      skinner?.applyPack(currentPack, isBumpActive)
      sandField?.applyPack(currentPack)
    })

    /** 水面高光是材質層的東西，開關要等渲染器建好才有得改 */
    watch(() => devToggle.waterGlint, (isEnabled) => {
      renderer?.setWaterGlintEnabled(isEnabled)
    })

    /**
     * 鏡頭的視野角度
     *
     * 視野寬窄是很個人的事：寬的看得到兩側的木座、走起來有速度感，
     * 窄的則像站定了在看一幅畫。記在瀏覽器裡的是主執行緒，這裡只套用
     */
    watch(() => renderSettings.cameraFov, (value) => {
      if (babylon) {
        babylon.camera.fov = value
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
    watch(() => renderSettings.sunAzimuth, (value) => setSunriseAzimuth(value), { immediate: true })
  }

  /** 世界生成、渲染器與所有效果的建立，原本是 main-scene.vue 的 init */
  async function buildWorld(): Promise<void> {
    if (!systems || !babylon)
      return

    const { scene, camera, pipeline } = babylon
    const { controller, weatherSystem, dayNight, sheepFlock, blockLights, texturePack } = systems
    const { atmosphere } = weatherSystem
    const { getDayRatio } = dayNight

    const terrainWorker = useTerrainWorker()
    try {
      worldState = await terrainWorker.generate()
    }
    finally {
      /** 逾時或出錯時也要收，不然這支一次性的 worker 會一直掛著 */
      terrainWorker.terminate()
    }
    if (isDisposed)
      return

    const chunkWorker = useChunkWorker()
    skinner = createTextureSkinner(scene)
    skinner.applyPack(texturePack.pack.value, texturePack.bumpActive.value)

    /**
     * 世界上的水掃一次記著
     *
     * 要在渲染器之前：水面材質是建網格時掛上去的，
     * 而掛上去之後第一幀就會去讀這份資料
     */
    waterMap = scanWaterMap(worldState)

    renderer = createVoxelRenderer(scene, chunkWorker, skinner)
    await renderer.build(worldState)
    if (isDisposed)
      return

    /**
     * 場景深度圖
     *
     * 光暈的柔性淡出與水面的岸線交線光共用這一張。
     * 低畫質會在它自己那邊關掉，兩個效果跟著歸零
     */
    sceneDepth = createSceneDepth({ scene, camera })

    /** 方塊做的沙只到世界邊界，外面那片得等渲染器準備好材質再接上去 */
    sandField = createSandField(scene, texturePack.pack.value)

    /** 水鏡池的天空倒影，走近才畫 */
    waterMirrors = createWaterMirrors(scene, camera, worldState)

    /**
     * 水面的泡沫、岸線與漣漪，以及水底的焦散
     *
     * 兩者都是材質外掛，網格那邊早就掛好了；這裡建的是推動它們的那一份，
     * 負責寫時間、挑出離玩家最近的那片水、以及把腳步濺成一圈波
     */
    waterSurface = createWaterSurface({
      scene,
      camera,
      waterMap,
    })
    waterCaustics = createWaterCaustics({
      scene,
      camera,
      waterMap,
      getDayRatio,
    })

    sheepFlock.start({ scene, worldState, camera, getDayRatio, skinner })
    createCampfireSmoke(scene, worldState)

    /**
     * 世界裡的燈火只掃這一次
     *
     * 真光與夜裡的光暈用的是同一份清單，兩者本來就是同一盞燈的兩種表現
     */
    const lightSourceList = collectLightSourceList(worldState)

    /**
     * 體素全局光
     *
     * 世界生成完就能把粗網格建好、丟給 worker——這一步只做一次，
     * 之後隨太陽角度變化的重烘節流交給它自己的 update
     */
    voxelGi = createVoxelGi(scene, worldState, lightSourceList)

    /**
     * 行進版的光束要接在全局光之後
     *
     * 它行進的正是全局光那張格子（alpha 欄存著「這一格照得到多少陽光」），
     * 格子還沒建好就先問它要，拿到的會是 null
     */
    volumetricLight = createVolumetricLight(scene, camera)

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
      scene,
      camera,
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
      scene,
      camera,
      sourceList: lightSourceList,
      getDayRatio,
    })

    /**
     * 日夜循環要排在漫遊控制器前面
     *
     * 三個系統疊在同一份大氣狀態上，順序就是疊加的順序：
     * 日夜寫下這個時刻的基準、天氣疊上雨與霧、漫遊控制器最後套進場景。
     * 顛倒過來的話，套進場景的會是上一幀的天色
     */
    dayNight.start({
      scene,
      pipeline,
      godRays: createGodRays(scene, camera),
      /**
       * 行進版的光束
       *
       * 兩者各自會依畫質決定要不要真的存在，所以這裡兩個都給——
       * 同一級裡至多只有一個是活的（見各自的 create）
       */
      volumetricLight,
      atmosphere,
      /** 放開滑鼠只是把游標還給桌面，人站在原地看風景，太陽照樣走 */
      isRunning: () => hasStarted && !controller.isPaused.value,
    })

    /** 鏡頭是在這之後才存在的，記在瀏覽器裡的視野要在這裡補套一次 */
    camera.fov = renderSettings.cameraFov

    controller.start({
      scene,
      camera,
      worldState,
      atmosphere,
      voxelGi,
    })

    trackStatus(scene)
  }

  /**
   * 定時更新幀率與所在箱庭，並隔一段時間把狀態、鏡頭位姿與紀錄送上主執行緒
   *
   * 送訊息用計時器而不是掛在算繪迴圈上：掉幀時主執行緒的 HUD 也該照樣更新，
   * 而且這幾件事都不需要每幀做
   */
  function trackStatus(scene: Scene) {
    if (!systems)
      return

    const { probe, controller } = systems
    let fpsElapsed = 0
    let zoneElapsed = 0

    scene.onBeforeRenderObservable.add(() => {
      const deltaSecond = scene.getEngine().getDeltaTime() / 1000

      fpsElapsed += deltaSecond
      if (fpsElapsed >= FPS_UPDATE_INTERVAL) {
        fpsElapsed = 0
        fps = scene.getEngine().getFps()
      }

      zoneElapsed += deltaSecond
      if (zoneElapsed >= ZONE_UPDATE_INTERVAL) {
        zoneElapsed = 0
        currentZone = getGardenAt(controller.position.x, controller.position.z)?.id ?? null
      }
    })

    /** 繪製呼叫要等這一幀畫完才數得到，所以掛在算繪之後 */
    scene.onAfterRenderObservable.add(() => probe.update(scene))

    isStatusTracked = true
    if (isVisible) {
      startReportTimers()
    }
  }

  let isStatusTracked = false

  function startReportTimers() {
    if (reportTimerList.length > 0)
      return

    reportTimerList = [
      setInterval(postStatus, STATUS_POST_INTERVAL),
      setInterval(postPose, POSE_POST_INTERVAL),
    ]
  }

  function stopReportTimers() {
    for (const timerId of reportTimerList) {
      clearInterval(timerId)
    }
    reportTimerList = []
  }

  /**
   * 頁面可見性變了
   *
   * 隱藏就把算繪迴圈與回報計時器都停下來；恢復時先補送一份狀態，
   * 主執行緒才知道渲染端還活著（它靠狀態的心跳判斷畫面有沒有停住）
   */
  function applyVisibility(nextIsVisible: boolean) {
    isVisible = nextIsVisible
    if (!babylon || isDisposed)
      return

    if (nextIsVisible) {
      babylon.resumeRendering()
      if (isStatusTracked) {
        startReportTimers()
        postStatus()
      }
      return
    }

    babylon.pauseRendering()
    stopReportTimers()
  }

  function postStatus() {
    if (!systems)
      return

    const { probe, dayNight, weatherSystem, controller } = systems
    const reading = toRaw(probe.reading)

    /**
     * 時刻一組三項都從當下的值現算，不讀那幾個五分之一秒才同步一次的鏡像
     *
     * 撥時間軸之後會立刻補送一份狀態，那份若帶的是舊的鏡像，
     * 主執行緒的滑桿就會先彈回去再跳過來
     */
    const currentTime = dayNight.getTimeOfDay()

    const status: RenderFrameStatusMessage = {
      type: 'frame-status',
      fps,
      timeOfDay: currentTime,
      clockText: formatClock(currentTime),
      phase: getDayPhase(currentTime),
      dayRatio: dayNight.getDayRatio(),
      isNight: dayNight.isNight.value,
      zone: currentZone,
      weather: weatherSystem.weather.value,
      isUnderground: controller.isUnderground.value,
      isProbeVisible: probe.visible.value,
      /** 響應式物件過不了結構化複製，攤成純資料再送 */
      probe: probe.visible.value && probe.hasReading.value
        ? {
            ...reading,
            sectionList: reading.sectionList.map(({ name, averageMs }) => ({ name, averageMs })),
          }
        : null,
      debugModeLabel,
    }

    channel.post(status)
  }

  function postPose() {
    if (!babylon)
      return

    const { camera } = babylon
    const pose = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      pitch: camera.rotation.x,
      yaw: camera.rotation.y,
    }

    /**
     * 人站著沒動就不送
     *
     * 聽者的位置與朝向沒變，主執行緒就沒有東西要更新。
     * 音景自己的定時更新（日夜、天氣、會動的音源）不靠這則訊息，見 use-soundscape
     */
    if (
      lastPose
      && Math.abs(pose.x - lastPose.x) < POSE_EPSILON
      && Math.abs(pose.y - lastPose.y) < POSE_EPSILON
      && Math.abs(pose.z - lastPose.z) < POSE_EPSILON
      && Math.abs(pose.pitch - lastPose.pitch) < POSE_ANGLE_EPSILON
      && Math.abs(pose.yaw - lastPose.yaw) < POSE_ANGLE_EPSILON
    ) {
      return
    }

    lastPose = pose
    channel.post({ type: 'pose', ...pose })
  }

  function postLog() {
    const log = drainForwardedLog()
    if (log) {
      channel.post({ type: 'log', ...log })
    }
  }

  /**
   * 錯誤紀錄只有開發時才收集（見 render-worker），正式版沒有東西可送，不必留計時器
   */
  if (import.meta.env.DEV) {
    timerIdList.push(setInterval(postLog, LOG_POST_INTERVAL))
  }

  async function runCommand(command: RenderCommand): Promise<void> {
    /** 可見性在場景建好之前就可能抵達，要先記下來，不能被下面的檢查擋掉 */
    if (command.command === 'set-visibility') {
      applyVisibility(command.isVisible)
      return
    }

    if (!systems || !babylon)
      return

    const { probe, controller, dayNight } = systems

    switch (command.command) {
      case 'start':
        await startWorld()
        break
      case 'set-control':
        controller.applyControl(command.isPaused, command.isCursorFree)
        break
      case 'travel': {
        /** 從目標點往外找一個站得住腳的位置，免得卡在樹上或方塊裡 */
        const { x, y, z } = findSafeStandingPosition(worldState, command.x, command.z)
        controller.teleport(x, y, z)
        break
      }
      case 'set-time':
        dayNight.setTimeOfDay(command.value)
        postStatus()
        break
      case 'add-time':
        dayNight.addTime(command.delta)
        postStatus()
        break
      case 'toggle-probe':
        probe.toggle(babylon.scene)
        break
      case 'cycle-debug-mode':
        debugModeLabel = cycleVolumetricDebugMode()
        break
      case 'request-handoff':
        channel.post({
          type: 'handoff-snapshot',
          handoff: {
            position: { x: controller.position.x, y: controller.position.y, z: controller.position.z },
            rotation: { pitch: babylon.camera.rotation.x, yaw: babylon.camera.rotation.y },
            timeOfDay: dayNight.getTimeOfDay(),
          },
        })
        break
    }
  }

  /** 開始漫遊：天氣與粒子等這一刻才建，時間也從這一刻開始走 */
  async function startWorld(): Promise<void> {
    if (!systems || !babylon || hasStarted || isDisposed)
      return

    hasStarted = true

    const { controller, weatherSystem, dayNight } = systems

    await weatherSystem.start({
      scene: babylon.scene,
      camera: babylon.camera,
      isSheltered: () => controller.isUnderground.value,
      /** 閃電歸天氣，雷聲歸聽雨亭（音景在主執行緒），這裡只是把兩邊接起來 */
      playThunder: (volume) => channel.post({ type: 'sound', id: 'rainvale-thunder', volume }),
      castRainRay: (blockX, blockZ) => castRainRay(worldState, blockX, blockZ),
      waterMap,
      getDayRatio: dayNight.getDayRatio,
      getTimeOfDay: dayNight.getTimeOfDay,
      /** 雨停之後要慢慢乾回去的那些表面，水與花草不在其中 */
      wetMaterialList: renderer?.getWetMaterialList() ?? [],
    })
  }

  function dispose(): void {
    if (isDisposed)
      return

    isDisposed = true

    for (const timerId of timerIdList) {
      clearInterval(timerId)
    }
    timerIdList.length = 0
    stopReportTimers()

    lampGlow?.dispose()
    waterSurface?.dispose()
    waterCaustics?.dispose()
    sceneDepth?.dispose()
    waterMirrors?.dispose()
    volumetricLight?.dispose()
    voxelGi?.dispose()
    renderer?.dispose()
    sandField?.dispose()
    skinner?.dispose()

    scope.stop()
    babylon?.dispose()
    babylon = null
    systems = null
  }

  return { dispose }
}
