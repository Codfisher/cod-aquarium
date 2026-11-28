import type { Scene } from '@babylonjs/core'
import type { RealmDefinition, RealmId, RealmPortal, RealmSpawn } from '../realm/realm-definition'
import type { RealmTransitionEffect } from '../realm/realm-transition'
import type { WorldLayer } from '../realm/world-layer'
import type { SceneDepth } from '../renderer/scene-depth'
import type { VolumetricLight } from '../renderer/volumetric-light'
import type { SoundTriggerSink } from '../soundscape/sound-trigger'
import type { SoundZone } from '../soundscape/type'
import type { AmbientWorldSource } from '../weather/ambient/realm-ambient'
import type {
  RenderChannel,
  RenderCommand,
  RenderDownMessage,
  RenderFrameStatusMessage,
  RenderInitMessage,
} from './protocol'
import { effectScope, toRaw, watch } from 'vue'
import { createBabylonScene } from '../../composables/use-babylon-scene'
import { useBlockLights } from '../../composables/use-block-lights'
import { useDayNight } from '../../composables/use-day-night'
import { useDevToggles } from '../../composables/use-dev-toggles'
import { drainForwardedLog } from '../../composables/use-error-logger'
import { useFpsController } from '../../composables/use-fps-controller'
import { usePerformanceProbe } from '../../composables/use-performance-probe'
import { useTexturePack } from '../../composables/use-texture-pack'
import { useDrift } from '../drift/use-drift'
import { getGardenAt } from '../garden/garden-layout'
import { findSafeStandingPosition } from '../player/collision'
import { activateRealm, activeRealmState } from '../realm/active-realm'
import { applyRealmToEngine } from '../realm/apply-realm-engine'
import { PORTAL_CLEAR_HALF_WIDTH, PORTAL_OPENING_HEIGHT } from '../realm/portal-terrain'
import { getRealm } from '../realm/realm-list'
import { createRealmTransition, TRANSITION_COVER_SECOND, TRANSITION_REVEAL_SECOND } from '../realm/realm-transition'
import { createWorldLayer, generateRealmWorld } from '../realm/world-layer'
import { auditFogOptOut } from '../renderer/fog-opt-out'
import { createSceneDepth } from '../renderer/scene-depth'
import { createVolumetricLight, cycleVolumetricDebugMode } from '../renderer/volumetric-light'
import { provideReloadHandoff } from '../scene/reload-handoff'
import { pickThunderPosition } from '../soundscape/sound-shaping'
import { clearSoundTriggerSink, requestSoundTrigger, setSoundTriggerSink } from '../soundscape/sound-trigger'
import { formatClock, getDayPhase, setSunriseAzimuth } from '../weather/day-night'
import { createGodRays } from '../weather/god-rays'
import { useWeather } from '../weather/use-weather'
import { createEmptyWaterMap } from '../world/water-body'
import { castRainRay } from '../world/world-access'
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

/**
 * 傳送門觸發範圍的厚度（格），從霧面往前後各量這麼多
 *
 * 人是一步一步穿過去的，衝刺時一幀走零點三格上下；
 * 前後各半格，掉到十幾幀也不會一步跨過去而沒觸發
 */
const PORTAL_TRIGGER_DEPTH = 0.5

/**
 * 霧蓋滿之後，最多等新世界準備多久（秒）
 *
 * 新的網格與材質要編譯著色器，還沒編好的東西 Babylon 會先不畫。
 * 霧散開之前等它們都好了，才不會看著樹一棵一棵冒出來；
 * 等太久就不等了，霧總得散開
 */
const WORLD_READY_TIMEOUT_SECOND = 4

/** 站在哪一座傳送門的觸發範圍裡，沒有就是 null */
function findPortalAt(portalList: RealmPortal[], x: number, y: number, z: number): RealmPortal | null {
  for (const portal of portalList) {
    const along = portal.spanAxis === 'x' ? x - portal.x : z - portal.z
    const across = portal.spanAxis === 'x' ? z - portal.z : x - portal.x
    /** 只算兩根門柱之間：擦著柱子外側走過去不算穿過門 */
    if (Math.abs(along) > PORTAL_CLEAR_HALF_WIDTH)
      continue
    if (Math.abs(across) > PORTAL_TRIGGER_DEPTH)
      continue
    if (y < portal.y - 0.6 || y > portal.y + PORTAL_OPENING_HEIGHT - 1)
      continue
    return portal
  }
  return null
}

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

  /** 場景裡要聲音的程式（雷、噴發這類跟著畫面發生的）從這裡把請求送到主執行緒，見 sound-trigger */
  const postSoundTrigger: SoundTriggerSink = (request) => channel.post({ type: 'sound', ...request })
  setSoundTriggerSink(postSoundTrigger)

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

  /**
   * 目前這個場景的世界層（方塊、網格、造景、水、燈火），換場景時整份換掉
   *
   * 換場景的途中、舊的已經拆了而新的還沒建好時是 null。
   * 每幀與每則訊息讀它之前都要先問一句，見 switchRealm
   */
  let worldLayer: WorldLayer | null = null
  /** 換場景還沒走完，這段期間再來一次一律不理 */
  let isSwitchingRealm = false
  /**
   * 整段旅程（霧湧上、換場景、霧散開）還沒走完
   *
   * 比 isSwitchingRealm 長：霧還在散的時候人可能又走回門裡，那一下也要忽略
   */
  let isTraveling = false
  /**
   * 轉場途中收到了 start-drift，等新世界建好、霧開始散的那一刻再開始
   *
   * 主執行緒在 realm-changed 一到就送 start-drift，而那則訊息是在 switchRealm 裡送出的，
   * 此時旅程還在走（霧還要散兩秒）。直接丟掉的話，開始畫面挑大場景神遊永遠開不了
   */
  let isDriftPending = false
  /**
   * 神遊除錯快照的計時器（開發模式的除錯面板開著時才有，見 domains/drift/drift-debug）
   *
   * 每秒四次問神遊要一份快照送上去；面板關掉就停，平常沒有任何成本
   */
  let driftDebugTimerId: ReturnType<typeof setInterval> | null = null
  function setDriftDebug(isEnabled: boolean) {
    if (driftDebugTimerId !== null) {
      clearInterval(driftDebugTimerId)
      driftDebugTimerId = null
    }
    if (isEnabled && import.meta.env.DEV) {
      driftDebugTimerId = setInterval(() => {
        if (isVisible)
          channel.post({ type: 'drift-debug', snapshot: drift?.getDebugSnapshot() ?? null })
      }, 250)
    }
  }
  /**
   * 上一幀是不是站在傳送門裡
   *
   * 觸發只看「從外面走進去」的那一刻。剛傳送過來就站在門裡的話，
   * 要先走出去才會再觸發，免得一到就被送回去
   */
  let wasInsidePortal = false
  /** 轉場的霧，引擎層，整個工作階段只建一次 */
  let realmTransition: RealmTransitionEffect | null = null
  /** 換場景的空檔裡雨滴問水在哪，回這一份：哪裡都沒有水 */
  const emptyWaterMap = createEmptyWaterMap()

  /** 以下是引擎層：不屬於任何場景，整個工作階段只建一次 */
  let sceneDepth: SceneDepth | null = null
  let volumetricLight: VolumetricLight | null = null

  /** 神遊：鏡頭自己散步與飛行，見 domains/drift；漫遊控制器建好之後才有 */
  let drift: ReturnType<typeof useDrift> | null = null

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
        if (drift?.isDrifting()) {
          /** 神遊中轉頭疊加在系統的視線上；按鍵狀態照樣交給控制器記著，結束時才不會漏掉按住的鍵 */
          drift.applyLook(message)
          systems?.controller.applyInput({ ...message, mouseDeltaX: 0, mouseDeltaY: 0, touchLookDeltaX: 0, touchLookDeltaY: 0 })
        }
        else {
          systems?.controller.applyInput(message)
        }
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

      /** 換畫質重來時接回原本的場景，認不得的 id 退回大廳 */
      const realm = getRealm(message.handoff?.realmId)
      activateRealm(realm)

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

      await buildWorld(realm)
      if (isDisposed || !worldLayer)
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

      channel.post({ type: 'ready', realmId: realm.id, worldState: worldLayer.worldState })
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
     * 換一套不必重建世界：方塊與那片白沙的材質物件全都留著，
     * 只把貼圖換掉。風的擺動、淋雨會變暗的登記、水面的高光
     * 都掛在材質上，重建一次全都要重接一遍
     */
    watch([texturePack.pack, texturePack.bumpActive], ([currentPack, isBumpActive]) => {
      worldLayer?.applyPack(currentPack, isBumpActive)
    })

    /**
     * 水面高光是材質層的東西，開關要等渲染器建好才有得改
     *
     * 換場景時新建的網格由世界層自己照著目前的開關設好
     */
    watch(() => devToggle.waterGlint, (isEnabled) => {
      worldLayer?.setWaterGlintEnabled(isEnabled)
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

  /**
   * 建一份世界層
   *
   * 初次建立與換場景共用。燈池這個 composable 是在 effect scope 裡建的（引擎層），
   * 世界層只負責 start 與 stop；材質包取當下這一刻的設定
   */
  async function buildWorldLayer(realm: RealmDefinition, worldState: Uint8Array): Promise<WorldLayer | null> {
    if (!systems || !babylon)
      return null

    const { scene, camera } = babylon
    const { blockLights, texturePack, dayNight, weatherSystem } = systems

    return createWorldLayer({
      realm,
      worldState,
      scene,
      camera,
      texturePack: { pack: texturePack.pack.value, isBumpActive: texturePack.bumpActive.value },
      blockLights,
      atmosphere: weatherSystem.atmosphere,
      getDayRatio: dayNight.getDayRatio,
      shouldAbort: () => isDisposed,
    })
  }

  /** 世界生成、渲染器與所有效果的建立，原本是 main-scene.vue 的 init */
  async function buildWorld(realm: RealmDefinition): Promise<void> {
    if (!systems || !babylon)
      return

    const { scene, camera, pipeline } = babylon
    const { controller, weatherSystem, dayNight } = systems
    const { atmosphere } = weatherSystem

    const worldState = await generateRealmWorld(realm.id)
    if (isDisposed)
      return

    worldLayer = await buildWorldLayer(realm, worldState)
    if (isDisposed || !worldLayer)
      return

    /** 換畫質重來直接回到地底時，天空與陰影一開始就要關著 */
    applyRealmToEngine(scene, realm)

    /**
     * 場景深度圖
     *
     * 光暈的柔性淡出與水面的岸線交線光共用這一張。
     * 低畫質會在它自己那邊關掉，兩個效果跟著歸零。
     *
     * 它是引擎層：深度圖每幀照著場景裡當下有哪些網格畫，換場景不必重建。
     * 讀它的那幾支都是在綁定材質時才去拿，建立的先後不影響
     */
    sceneDepth = createSceneDepth({ scene, camera })

    /**
     * 行進版的光束（只有最奢的那一級有）
     *
     * 也是引擎層：它畫的是自己那張跟著鏡頭走的陰影圖，不認得任何一個場景
     */
    volumetricLight = createVolumetricLight(scene, camera)

    /**
     * 日夜循環要排在漫遊控制器前面
     *
     * 三個系統疊在同一份大氣狀態上，順序就是疊加的順序：
     * 日夜寫下這個時刻的基準、天氣疊上雨與霧、漫遊控制器最後套進場景。
     * 顛倒過來的話，套進場景的會是上一幀的天色。
     *
     * 這三個都是引擎層，換場景時不重建：重掛觀察者會排到隊伍最後面，順序就亂了
     */
    dayNight.start({
      scene,
      pipeline,
      godRays: createGodRays(scene, camera),
      /**
       * 行進版的光束
       *
       * 兩者各自會依畫質決定要不要真的存在，所以這裡兩個都給。
       * 極致那一級兩個都活著：行進版負責地面上的光柱，
       * 螢幕空間版負責太陽周圍的光暈（見 god-rays 的 createGodRays）
       */
      volumetricLight,
      atmosphere,
      /** 放開滑鼠只是把游標還給桌面，人站在原地看風景，太陽照樣走 */
      isRunning: () => hasStarted && !controller.isPaused.value,
    })

    /**
     * 開始漫遊之前先套上場景的霧與光
     *
     * 排在日夜之後、控制器之前。換畫質重來回到湖中島時，開始面板後面就已經是湖的霧；
     * 大廳的設定是空的，這個觀察者寫回的是原本那組初始值
     */
    weatherSystem.trackRealmBaseline(scene)

    /**
     * 轉場的霧幕與粒子
     *
     * 霧色是日夜的基準霧色乘上目的地的倍率，夜裡穿過門霧是暗的
     */
    realmTransition = createRealmTransition({
      scene,
      camera,
      getBaseFogColor: () => atmosphere.baseFogColor,
    })

    /** 鏡頭是在這之後才存在的，記在瀏覽器裡的視野要在這裡補套一次 */
    camera.fov = renderSettings.cameraFov

    controller.start({
      scene,
      camera,
      worldState: worldLayer.worldState,
      atmosphere,
      voxelGi: worldLayer.voxelGi,
      spawn: realm.spawn,
    })

    drift = useDrift({
      scene,
      camera,
      controller,
      getWorld: () => (worldLayer ? { realm: worldLayer.realm, worldState: worldLayer.worldState } : null),
      getTimeOfDay: dayNight.getTimeOfDay,
      getDayRatio: dayNight.getDayRatio,
      getSunDirection: () => atmosphere.sunDirection,
      getBurnIntensity: dayNight.getBurnIntensity,
      onChange: postStatus,
    })

    trackStatus(scene)
    trackPortals(scene)
  }

  /**
   * 每幀看人有沒有走進傳送門
   *
   * 只在「從外面走進去」的那一刻觸發；轉場途中（霧還在湧、在換、在散）一律不理
   */
  function trackPortals(scene: Scene) {
    scene.onBeforeRenderObservable.add(() => {
      /** 神遊不穿門：鏡頭路線本來就避開門前，這裡再擋一道，免得飛行的鏡頭掠過門洞就被送走 */
      if (!systems || !worldLayer || !hasStarted || drift?.isDrifting())
        return

      const { position } = systems.controller
      const portal = findPortalAt(worldLayer.realm.portalList, position.x, position.y, position.z)
      const isEntering = portal !== null && !wasInsidePortal
      wasInsidePortal = portal !== null

      if (!portal || !isEntering || isTraveling || isSwitchingRealm)
        return

      void travelToRealm(portal.targetRealmId, portal.targetSpawn)
    })
  }

  /**
   * 等新世界的網格與材質都準備好
   *
   * 每幀問一次場景好了沒，最多等 WORLD_READY_TIMEOUT_SECOND
   */
  function waitForWorldReady(scene: Scene): Promise<void> {
    return new Promise((resolve) => {
      let elapsedSecond = 0
      const observer = scene.onAfterRenderObservable.add(() => {
        elapsedSecond += scene.getEngine().getDeltaTime() / 1000
        if (isDisposed || scene.isReady(false) || elapsedSecond > WORLD_READY_TIMEOUT_SECOND) {
          scene.onAfterRenderObservable.remove(observer)
          resolve()
        }
      })
    })
  }

  /**
   * 穿過傳送門到另一個場景
   *
   * 1. 通知主執行緒播轉場音效，同時在地形 worker 開始生新場景（生成時間藏在霧裡）
   * 2. 霧約一秒半蓋滿畫面
   * 3. 換場景（switchRealm），等新世界的著色器編好
   * 4. 霧約兩秒散開
   *
   * 生成或建網格失敗就留在原場景，霧照樣散開，錯誤記進紀錄（F6 匯得出來）。
   * 全程不重新整理頁面，滑鼠的鎖定不會掉
   */
  async function travelToRealm(realmId: RealmId, spawn?: RealmSpawn): Promise<void> {
    if (!systems || !babylon || !worldLayer || !realmTransition || isTraveling || isSwitchingRealm || isDisposed)
      return

    isTraveling = true
    const transition = realmTransition
    const { scene } = babylon
    const realm = getRealm(realmId)

    try {
      channel.post({
        type: 'realm-transition',
        targetRealmId: realm.id,
        sound: realm.transition.sound,
        durationSecond: TRANSITION_COVER_SECOND + TRANSITION_REVEAL_SECOND,
      })

      const worldStatePromise = generateRealmWorld(realm.id)
      /** 先接住：蓋霧的這一秒半裡它若失敗，不能變成沒人接的 rejection，真正的處理在 switchRealm */
      worldStatePromise.catch(() => {})

      await transition.cover(realm.transition)
      if (isDisposed)
        return

      await switchRealm(realm.id, { worldStatePromise, spawn })
      await waitForWorldReady(scene)
    }
    finally {
      if (!isDisposed) {
        /** 世界已經好了，神遊與霧散開同時開始 */
        if (isDriftPending) {
          isDriftPending = false
          drift?.start()
          postStatus()
        }
        await transition.reveal()
      }
      isTraveling = false
    }
  }

  /**
   * 就地換場景
   *
   * 1. 在地形 worker 生好新場景的方塊資料（失敗就留在原場景，什麼都還沒拆）
   * 2. 拆掉舊的世界層
   * 3. 建好新的世界層（不限時，建好才往下走）
   * 4. 換上新場景的旗標與氣氛設定，把人放到出生點
   * 5. 通知主執行緒（realm-changed），HUD 與音景跟著換
   *
   * 引擎層全部留著。霧的轉場在外面那一層（travelToRealm），這裡只管換。
   * 回傳有沒有換成功：生成或建網格失敗時人留在原場景
   */
  async function switchRealm(
    realmId: RealmId,
    { worldStatePromise, spawn }: { worldStatePromise?: Promise<Uint8Array>; spawn?: RealmSpawn } = {},
  ): Promise<boolean> {
    if (!systems || !babylon || !worldLayer || isSwitchingRealm || isDisposed)
      return false

    isSwitchingRealm = true
    /** 神遊只在一座場景裡，換場景先結束；位置馬上會被放到新場景的出生點，不必降落 */
    drift?.abort()
    const { controller, weatherSystem } = systems
    const previousLayer = worldLayer
    const realm = getRealm(realmId)

    try {
      const worldState = await (worldStatePromise ?? generateRealmWorld(realm.id))
      if (isDisposed)
        return false

      /**
       * 拆之前先把每幀還在讀它的那幾支斷開
       *
       * 全局光的 worker 馬上要收掉，控制器每幀還會叫它重烘；
       * 濕潤每幀改寫的那批材質也馬上要釋放
       */
      worldLayer = null
      controller.setWorld({ worldState: previousLayer.worldState, voxelGi: null })
      weatherSystem.setWorld([])
      previousLayer.dispose()

      const nextLayer = await buildWorldLayer(realm, worldState)
      if (!nextLayer)
        return false

      enterWorldLayer(nextLayer, spawn ?? realm.spawn)
      return true
    }
    catch (error) {
      console.error(`[RenderRuntime] 換到場景 ${realm.id} 失敗:`, error)

      /**
       * 舊的世界已經拆了才失敗（建網格出錯），用手上那份方塊資料原地建回去，
       * 人留在原本的位置。生成就失敗的話舊世界根本還沒動，不必處理
       */
      if (!worldLayer && !isDisposed) {
        const restoredLayer = await buildWorldLayer(previousLayer.realm, previousLayer.worldState)
        if (restoredLayer) {
          enterWorldLayer(restoredLayer, null)
        }
      }
      return false
    }
    finally {
      isSwitchingRealm = false
    }
  }

  /** 換上一份建好的世界層：旗標、氣氛、控制器、濕潤，給了出生點就把人放過去 */
  function enterWorldLayer(layer: WorldLayer, spawn: RealmSpawn | null): void {
    if (!systems || !babylon)
      return

    const { controller, weatherSystem } = systems
    const { realm } = layer

    worldLayer = layer
    activateRealm(realm)
    /** 天空、太陽的陰影、岩響窟的洞口光與滴水跟著場景切（地底的場景整片天不畫） */
    applyRealmToEngine(babylon.scene, realm)
    controller.setWorld({ worldState: layer.worldState, voxelGi: layer.voxelGi })
    weatherSystem.setWorld(layer.getWetMaterialList())

    if (spawn) {
      const { x, y, z } = findSafeStandingPosition(layer.worldState, spawn.x, spawn.z)
      controller.teleport(x, y, z)
      babylon.camera.rotation.set(spawn.pitch, spawn.yaw, 0)
    }

    /** 落地的那一刻若剛好站在門裡，要先走出去才會再觸發 */
    const { position } = controller
    wasInsidePortal = findPortalAt(realm.portalList, position.x, position.y, position.z) !== null

    /** 新建的網格一樣要確認跳出霧的那幾個有交代邊界怎麼收 */
    if (import.meta.env.DEV) {
      auditFogOptOut(babylon.scene)
    }

    /**
     * 所在箱庭先算好、先送，再送換場景
     *
     * 兩則訊息之間主執行緒可能先畫一幀。反過來送的話，那一幀是「已經在大廳、箱庭還是空的」，
     * HUD 會閃一下「白沙之間」。先送狀態時場景還沒換，HUD 照舊顯示出發的大場景，看不出差別
     */
    updateZone()
    postStatus()
    channel.post({ type: 'realm-changed', realmId: realm.id, worldState: layer.worldState })
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

    const { probe } = systems
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
      /**
       * 穿門的這一趟（霧湧上、換場景、霧散開）不重算
       *
       * 霧蓋上來的那一秒半裡人還能往前走，走出箱庭的範圍就會變成「白沙之間」；
       * 換好場景的那一刻由 enterWorldLayer 直接算一次。
       * 所以 HUD 從頭到尾只換一次：出發地一直顯示到霧蓋滿、換好的那一刻變成目的地
       */
      if (zoneElapsed >= ZONE_UPDATE_INTERVAL && !isTraveling) {
        zoneElapsed = 0
        updateZone()
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

  /** 依此刻的位置重算所在的箱庭；箱庭只在大廳，大場景裡同一個座標不是任何一座箱庭 */
  function updateZone(): void {
    if (!systems)
      return

    const { position } = systems.controller
    currentZone = activeRealmState.hasGardens
      ? getGardenAt(position.x, position.z)?.id ?? null
      : null
  }

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
      rainRatio: weatherSystem.getRainLevel(),
      snowRatio: weatherSystem.getSnowLevel(),
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
      isDrifting: drift?.isDrifting() ?? false,
      driftPhase: drift?.getPhase() ?? null,
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
        if (!worldLayer)
          break

        /** 從目標點往外找一個站得住腳的位置，免得卡在樹上或方塊裡 */
        const { x, y, z } = findSafeStandingPosition(worldLayer.worldState, command.x, command.z)
        controller.teleport(x, y, z)
        if (command.yaw !== undefined) {
          babylon.camera.rotation.y = command.yaw
        }
        break
      }
      case 'switch-realm':
        await travelToRealm(command.realmId, command.spawn)
        break
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
      case 'toggle-pass-timer':
        probe.togglePassTimer(babylon.scene)
        break
      case 'cycle-debug-mode':
        debugModeLabel = cycleVolumetricDebugMode()
        break
      case 'start-drift':
        /** 轉場途中不能開始（霧還在湧、場景還在換，起點會落在舊世界），記下來等旅程走到世界建好再開 */
        if (isTraveling || isSwitchingRealm)
          isDriftPending = true
        else
          drift?.start()
        postStatus()
        break
      case 'stop-drift':
        isDriftPending = false
        drift?.stop()
        postStatus()
        break
      case 'set-drift-debug':
        setDriftDebug(command.isEnabled)
        break
      case 'request-handoff':
        channel.post({
          type: 'handoff-snapshot',
          handoff: {
            position: { x: controller.position.x, y: controller.position.y, z: controller.position.z },
            rotation: { pitch: babylon.camera.rotation.x, yaw: babylon.camera.rotation.y },
            timeOfDay: dayNight.getTimeOfDay(),
            realmId: activeRealmState.realmId,
            ...(drift?.isDrifting() ? { isDrifting: true } : {}),
          },
        })
        break
    }
  }

  /**
   * 環境粒子每一幀都會問一次世界在哪：同一份世界層回同一個物件，不要每幀配置新的。
   * 換場景時世界層是另一個物件，快取跟著換
   */
  let ambientSourceCache: { layer: WorldLayer; source: AmbientWorldSource } | null = null

  function getAmbientWorldSource(): AmbientWorldSource | null {
    if (!worldLayer)
      return null

    if (ambientSourceCache?.layer !== worldLayer) {
      ambientSourceCache = {
        layer: worldLayer,
        source: {
          realmId: worldLayer.realm.id,
          worldState: worldLayer.worldState,
          waterMap: worldLayer.waterMap,
          lightSourceList: worldLayer.lightSourceList,
        },
      }
    }

    return ambientSourceCache.source
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
      /**
       * 閃電歸天氣，雷聲歸聽雨亭（音景在主執行緒），這裡只是把兩邊接起來
       *
       * 大場景裡每一道雷換一個方位（閃電是整片天亮一下，雷從哪一邊來都說得通）；
       * 大廳的聽雨亭照舊從木座上方那一點來，雷聲才不會跟著人跑到隔壁的箱庭。
       *
       * 大場景有兩種雷聲：平常那一聲，與拖得很長的滾雷（rainvale-thunder-roll，大廳沒有這一顆）。
       * 越遠的雷越容易是滾雷：近的炸一聲就完了，遠的才聽得到它在天邊一路滾
       */
      playThunder: (volume, distanceRatio) => {
        const isRealm = !activeRealmState.hasGardens
        requestSoundTrigger({
          id: isRealm && Math.random() < 0.2 + distanceRatio * 0.45 ? 'rainvale-thunder-roll' : 'rainvale-thunder',
          volume,
          position: isRealm && babylon
            ? pickThunderPosition(babylon.camera.position, distanceRatio, Math.random)
            : undefined,
        })
      },
      /** 兩者都在每次呼叫時才去讀目前的世界層：換場景之後天氣系統還是同一份 */
      castRainRay: (blockX, blockZ) => worldLayer ? castRainRay(worldLayer.worldState, blockX, blockZ) : null,
      getWaterMap: () => worldLayer?.waterMap ?? emptyWaterMap,
      /** 環境粒子（蝶、螢火、飛沫…）要找花、燈與水在哪；換場景的空檔世界層是 null，那時整批收掉 */
      getAmbientWorldSource,
      getDayRatio: dayNight.getDayRatio,
      getTimeOfDay: dayNight.getTimeOfDay,
      /** 雨停之後要慢慢乾回去的那些表面，水與花草不在其中 */
      wetMaterialList: worldLayer?.getWetMaterialList() ?? [],
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
    setDriftDebug(false)
    clearSoundTriggerSink(postSoundTrigger)

    drift?.abort()
    drift = null
    worldLayer?.dispose()
    worldLayer = null
    realmTransition?.dispose()
    realmTransition = null
    sceneDepth?.dispose()
    volumetricLight?.dispose()

    scope.stop()
    babylon?.dispose()
    babylon = null
    systems = null
  }

  return { dispose }
}
