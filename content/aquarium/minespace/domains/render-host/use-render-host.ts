import type { Ref } from 'vue'
import type { PerformanceReading } from '../../composables/performance-reading'
import type { DriftDebugSnapshot } from '../drift/drift-debug'
import type { RealmId } from '../realm/realm-definition'
import type { ReloadHandoff } from '../scene/reload-handoff'
import type {
  RenderCommand,
  RenderFrameStatusMessage,
  RenderHostTransport,
  RenderInputMessage,
  RenderPoseMessage,
  RenderRealmTransitionMessage,
  RenderSettings,
  RenderSettingsMessage,
  RenderSoundMessage,
  RenderUpMessage,
  RenderViewport,
} from './protocol'
import { promiseTimeout, useDevicePixelRatio, useDocumentVisibility, useElementSize, useIntervalFn } from '@vueuse/core'
import { isEmpty, omit, pickBy } from 'remeda'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { reportDiagnostic, reportError, reportIssue, reportWarning } from '../../composables/use-error-logger'
import { takeReloadHandoff } from '../scene/reload-handoff'
import { formatClock, getDayPhase, INITIAL_TIME_OF_DAY } from '../weather/day-night'
import { createRenderTransport } from './create-render-transport'
import { useRenderPreference } from './use-render-preference'

/** 向渲染端要位置快照最多等多久，逾時就不帶交接直接重新整理 */
const HANDOFF_TIMEOUT = 1500

/**
 * 自己撥了時刻之後，這麼久之內不採信渲染端送來的時刻
 *
 * 撥時間軸是先在本地改、再通知渲染端。這中間渲染端早先送出的狀態可能才剛到，
 * 帶的是撥之前的舊時刻，採信的話滑桿會先彈回去、等新的狀態到了再跳回來
 */
const TIME_ECHO_GUARD = 400

/**
 * 渲染端多久沒有任何訊息就算畫面停住了（毫秒）
 *
 * 渲染端每四分之一秒送一次狀態，不管畫面有沒有在畫。五秒沒有任何訊息，
 * 表示它被卡死（無窮迴圈、記憶體壓力）或被系統殺掉——worker 死掉沒有任何事件可接
 */
const STALL_TIMEOUT = 5000

/**
 * 渲染端定時送上來的狀態，HUD 讀這一份
 *
 * 從訊息型別推出來，不另外抄一份欄位：兩邊各寫一份，加欄位時漏改一邊
 * 型別檢查也不會說話。探針讀數另外放（它可能是 null，且整份換掉）
 */
type RenderStatus = Omit<RenderFrameStatusMessage, 'type' | 'probe'>

interface UseRenderHostParam {
  canvasRef: Ref<HTMLCanvasElement | undefined>;
  /** 介面語言，渲染端的木牌要照它寫字 */
  locale: Ref<RenderSettings['locale']>;
}

/**
 * 渲染端的主執行緒入口
 *
 * 負責選傳輸層、把畫布與設定交過去、把尺寸與設定的變動轉過去，
 * 再把渲染端送回來的狀態整理成響應式的欄位給介面用。
 * 渲染端是 worker 還是退回主執行緒，這裡的上層完全不必知道。
 *
 * 輸入與音訊不在這裡：它們各自有自己的模組，只借這裡的 postInput 與 command 往下送
 */
export function useRenderHost({ canvasRef, locale }: UseRenderHostParam) {
  const preference = useRenderPreference()

  /** 送給渲染端的整份設定：使用者的偏好加上介面語言 */
  function getSettings(): RenderSettings {
    return { ...preference.getSettings(), locale: locale.value }
  }

  const isWorldReady = ref(false)
  const initError = ref<string>()
  /**
   * 畫布的 key
   *
   * worker 那條路在初始化失敗時畫布已經轉移出去，主執行緒收不回來，
   * 要退回主執行緒就得換一塊新的。換 key 讓元件重新長出一個 canvas 元素
   */
  const canvasKey = ref(0)
  /**
   * 渲染端生成的世界，音景要靠它種音源、算遮蔽
   *
   * 換場景時整份換掉（realm-changed），看著它的音景會跟著重種音源
   */
  const worldState = shallowRef<Uint8Array>()
  /** 目前在哪一個場景，換場景時跟著 realm-changed 更新 */
  const realmId = ref<RealmId>('hub')
  /** 目前用哪一種傳輸層，驗證與除錯時看得到 */
  const transportKind = ref<RenderHostTransport['kind']>()

  /**
   * 畫質切換整頁重來時寄放的位置、視角與時刻
   *
   * 在這裡取走：它要放進 init 訊息，HUD 的時刻讀數也該一開始就是接回去的那一刻，
   * 而不是先閃一下預設的上午
   */
  const handoff = takeReloadHandoff()
  const initialTime = handoff?.timeOfDay ?? INITIAL_TIME_OF_DAY
  const status = reactive<RenderStatus>({
    fps: 0,
    timeOfDay: initialTime,
    clockText: formatClock(initialTime),
    phase: getDayPhase(initialTime),
    dayRatio: 1,
    isNight: false,
    zone: null,
    weather: 'clear',
    rainRatio: 0,
    snowRatio: 0,
    isUnderground: false,
    isProbeVisible: false,
    debugModeLabel: '',
    isDrifting: false,
    driftPhase: null,
  })
  /** 重載前正在神遊：進場（按下開始）後要接著神遊，見 main-scene 的 handleStart */
  const shouldResumeDrift = handoff?.isDrifting === true
  /**
   * 效能讀數
   *
   * null 是「還沒有」：面板剛打開的頭半秒、或面板關著。介面要顯示「量測中」，
   * 不能拿一份全零或上一次留下的舊數字來畫
   */
  const probe = shallowRef<PerformanceReading | null>(null)
  /** 神遊的除錯快照（開發模式的除錯面板開著時渲染端才會送，見 domains/drift/drift-debug） */
  const driftDebugSnapshot = shallowRef<DriftDebugSnapshot | null>(null)
  /**
   * 渲染端是不是停住了
   *
   * 世界準備好之後、頁面看得到的時候，超過 STALL_TIMEOUT 沒收到任何訊息就算。
   * 這只是給使用者一個提示，不擋畫面（見 handleRenderFailure 對渲染中例外的態度）
   */
  const isRenderStalled = ref(false)
  let lastMessageAt = performance.now()
  const documentVisibility = useDocumentVisibility()

  let transport: RenderHostTransport | null = null
  /**
   * 元件已經卸載
   *
   * 連線要等 worker 載入、等能力偵測，那段時間不短，元件可能早就不在了。
   * 偵測回來之後若不檢查，就會對一個沒人要的 worker 轉移畫布、送 init，
   * 而它永遠不會被收掉
   */
  let isDisposed = false
  const abortController = new AbortController()
  /** 已經從 worker 退回主執行緒過一次，不再重試 worker，免得兩邊來回 */
  let hasFallenBack = false
  /** 錯誤提示是不是 WebGL 上下文丟失造成的，恢復時要收掉 */
  let isContextLost = false
  /** 最近一次在本地撥時刻的時間，見 TIME_ECHO_GUARD */
  let lastTimeSetAt = Number.NEGATIVE_INFINITY
  let resolveHandoff: ((handoff: ReloadHandoff | null) => void) | null = null
  const poseHandlerList: ((pose: RenderPoseMessage) => void)[] = []
  const soundHandlerList: ((sound: RenderSoundMessage) => void)[] = []
  const transitionHandlerList: ((transition: RenderRealmTransitionMessage) => void)[] = []

  const { width: elementWidth, height: elementHeight } = useElementSize(canvasRef)
  const { pixelRatio } = useDevicePixelRatio()
  /** 上一次送出去的尺寸，沒變就不重送 */
  let lastViewport: RenderViewport | null = null

  function handleMessage(message: RenderUpMessage): void {
    lastMessageAt = performance.now()
    isRenderStalled.value = false

    switch (message.type) {
      case 'ready':
        worldState.value = message.worldState
        realmId.value = message.realmId
        isWorldReady.value = true
        break
      case 'realm-changed':
        worldState.value = message.worldState
        realmId.value = message.realmId
        break
      case 'realm-transition':
        for (const handler of transitionHandlerList) {
          handler(message)
        }
        break
      case 'init-error':
        handleRenderFailure(message.message)
        break
      case 'context-lost':
        isContextLost = true
        initError.value = 'WebGL context lost'
        break
      case 'context-restored':
        /** 上下文回來了，Babylon 會自己重建資源，不必再擋著畫面 */
        if (isContextLost) {
          isContextLost = false
          initError.value = undefined
        }
        break
      case 'frame-status': {
        const { type: _type, probe: nextProbe, ...rest } = message
        const isTimeEchoStale = performance.now() - lastTimeSetAt < TIME_ECHO_GUARD
        Object.assign(status, isTimeEchoStale ? omit(rest, ['timeOfDay', 'clockText', 'phase']) : rest)
        /** 渲染端沒有讀數就送 null（面板關著、或剛打開還沒量到），照單全收，不留舊的 */
        probe.value = nextProbe
        break
      }
      case 'pose':
        for (const handler of poseHandlerList) {
          handler(message)
        }
        break
      case 'sound':
        for (const handler of soundHandlerList) {
          handler(message)
        }
        break
      case 'log':
        /** 渲染端攔到的錯誤與執行時狀態，匯進這一邊的清單，F6 匯出時兩邊都在 */
        for (const issue of message.issueList) {
          reportIssue(issue.level, issue.message, issue.stack, issue.count)
        }
        for (const diagnostic of message.diagnosticList) {
          reportDiagnostic(diagnostic.label, diagnostic.value)
        }
        break
      case 'handoff-snapshot':
        resolveHandoff?.(message.handoff)
        resolveHandoff = null
        break
      case 'drift-debug':
        driftDebugSnapshot.value = message.snapshot
        break
      default:
        break
    }
  }

  function measureViewport(canvas: HTMLCanvasElement): RenderViewport {
    return {
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    }
  }

  /**
   * 渲染端出了無法繼續的問題
   *
   * 世界還沒準備好、而且走的是 worker，就退回主執行緒：
   * 這多半是 worker 環境的問題（拿不到 WebGL、缺 API），主執行緒那條路不一定同樣有事。
   * 已經準備好之後才出事，或是退路本身出事，就只能把錯誤亮給使用者看
   */
  function handleRenderFailure(message: string): void {
    /**
     * 世界已經在跑，之後的例外只記錄，不蓋畫面
     *
     * 「初始化失敗」的覆蓋會擋住整個畫面、而且沒有任何方式收掉。
     * 渲染中偶發的一個例外（某一幀的計算出錯、某個粒子的邊界條件）多半不致命，
     * 世界仍在動，把它升級成永久的全螢幕錯誤是過度反應。
     * 正式版 worker 沒有攔錯誤，瀏覽器自己會把它印進主控台，這裡只補進紀錄
     */
    if (isWorldReady.value) {
      reportError(message)
      return
    }

    if (transport?.kind === 'worker' && !hasFallenBack) {
      void fallbackToMainThread(message)
      return
    }

    /**
     * 世界還沒建好就失敗了、又沒有退路可走：把傳輸層收掉，只留錯誤
     *
     * 退路上渲染執行期跑在主執行緒，建到一半的引擎與計時器不收，
     * 會在錯誤覆蓋底下繼續吃資源
     */
    isContextLost = false
    initError.value = message
    transport?.dispose()
    transport = null
  }

  async function fallbackToMainThread(reason: string): Promise<void> {
    hasFallenBack = true
    /**
     * 前一輪留下的錯誤狀態要清掉
     *
     * 失敗之前可能已經收到上下文丟失或初始化錯誤，覆蓋還亮著；
     * 重建之後的那一輪是全新的，不該被舊的錯誤擋住。
     * isContextLost 也要歸零，否則舊世界遲到的 context-restored
     * 會去清掉新一輪真正的失敗
     */
    initError.value = undefined
    isContextLost = false
    reportWarning(`[RenderHost] worker 初始化失敗，退回主執行緒算繪：${reason}`)

    transport?.dispose()
    transport = null
    lastViewport = null

    /** 畫布已經轉移給那支 worker，換一塊新的 */
    canvasKey.value++
    await nextTick()
    if (isDisposed)
      return

    await connect(true)
  }

  /**
   * 選傳輸層、把畫布與設定交過去
   *
   * shouldSkipWorker 是 worker 失敗之後的重建用的，不再問 worker
   */
  async function connect(shouldSkipWorker: boolean): Promise<void> {
    const canvas = canvasRef.value
    if (!canvas) {
      initError.value = '無法取得 canvas DOM'
      return
    }

    try {
      const nextTransport = await createRenderTransport({
        signal: abortController.signal,
        shouldSkipWorker,
      })
      if (!nextTransport)
        return

      /** 等的這段時間元件被卸載了，剛建好的傳輸層沒有人會去收，在這裡收掉 */
      if (isDisposed) {
        nextTransport.dispose()
        return
      }

      transport = nextTransport
      transportKind.value = nextTransport.kind
      /** 被換掉的傳輸層可能還有幾則訊息在路上，不能讓它們蓋掉新的狀態 */
      nextTransport.setMessageHandler((message) => {
        if (transport === nextTransport) {
          handleMessage(message)
        }
      })

      lastMessageAt = performance.now()
      const viewport = measureViewport(canvas)
      lastViewport = viewport
      const renderCanvas = nextTransport.prepareCanvas(canvas)

      nextTransport.post({
        type: 'init',
        canvas: renderCanvas,
        ...viewport,
        settings: getSettings(),
        handoff,
      }, renderCanvas instanceof HTMLCanvasElement ? [] : [renderCanvas])

      /** 頁面是在背景分頁裡載入的話，渲染端一開始就該是停著的 */
      if (documentVisibility.value === 'hidden') {
        postCommand({ command: 'set-visibility', isVisible: false })
      }
    }
    catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      console.error('[RenderHost] 初始化失敗:', error)
      initError.value = text
    }
  }

  onMounted(() => {
    void connect(false)
  })

  /**
   * 畫布大小或裝置像素比一變就送 resize
   *
   * 量尺寸的是主執行緒：worker 裡的 OffscreenCanvas 沒有版面可以量
   */
  watch([elementWidth, elementHeight, pixelRatio], () => {
    const canvas = canvasRef.value
    if (!transport || !canvas || !lastViewport)
      return

    const viewport = measureViewport(canvas)
    if (
      viewport.cssWidth === lastViewport.cssWidth
      && viewport.cssHeight === lastViewport.cssHeight
      && viewport.devicePixelRatio === lastViewport.devicePixelRatio
    ) {
      return
    }

    lastViewport = viewport
    transport.post({ type: 'resize', ...viewport })
  })

  /**
   * 設定有變就把差異送過去
   *
   * 持久化在這一邊（useStorage），渲染端只收訊息。
   * 只送有變的欄位：devToggle 十幾項，改一項不該把整份再送一遍。
   *
   * 要在 setup 裡同步建立：等到連線完成才建，它就不屬於元件的 scope，卸載時不會被停掉。
   * 傳輸層還沒建好的時候變動的設定不會漏——init 訊息帶的是當下的完整設定
   */
  watch(getSettings, (next, previous) => {
    if (!transport)
      return

    const patch = buildSettingsPatch(next, previous)
    if (patch) {
      transport.post({ type: 'settings', patch })
    }
  })

  function postInput(message: RenderInputMessage): void {
    transport?.post(message)
  }

  function postCommand(command: RenderCommand): void {
    transport?.post({ type: 'command', payload: command })
  }

  /**
   * 向渲染端要一份目前位置、視角與時刻的快照
   *
   * 畫質切換要整頁重來，重來之前得先知道人在哪。逾時回 null，就不帶交接直接重來
   */
  function requestHandoff(): Promise<ReloadHandoff | null> {
    const snapshot = new Promise<ReloadHandoff | null>((resolve) => {
      resolveHandoff = resolve
    })

    postCommand({ command: 'request-handoff' })

    return Promise.race([
      snapshot,
      promiseTimeout(HANDOFF_TIMEOUT).then(() => {
        resolveHandoff = null
        return null
      }),
    ])
  }

  /**
   * 在本地撥時刻
   *
   * 先改本地的讀數，滑桿才跟得上手；渲染端回報的時刻在一小段時間內不採信（見 TIME_ECHO_GUARD）。
   * 時刻、讀數與時段名稱是同一組，要一起改，不然滑桿動了、旁邊的文字還是舊的
   */
  function setTimeOfDay(value: number): void {
    status.timeOfDay = value
    status.clockText = formatClock(value)
    status.phase = getDayPhase(value)
    lastTimeSetAt = performance.now()

    postCommand({ command: 'set-time', value })
  }

  /**
   * 頁面可見性要告訴渲染端
   *
   * worker 看不到頁面是不是在背景，而它的 rAF 不會被瀏覽器降頻，
   * 不通知的話會在沒人看的分頁裡全速畫圖。
   * 恢復可見時順手重設心跳：背景那段時間沒有訊息是刻意的，不能算停住
   */
  watch(documentVisibility, (visibility) => {
    const isVisible = visibility === 'visible'
    if (isVisible) {
      lastMessageAt = performance.now()
      isRenderStalled.value = false
    }

    postCommand({ command: 'set-visibility', isVisible })
  })

  /** 心跳檢查：只在世界跑著、頁面看得到的時候才算 */
  useIntervalFn(() => {
    if (!isWorldReady.value || documentVisibility.value !== 'visible')
      return

    if (performance.now() - lastMessageAt > STALL_TIMEOUT) {
      isRenderStalled.value = true
    }
  }, 1000)

  function addPoseHandler(handler: (pose: RenderPoseMessage) => void): void {
    poseHandlerList.push(handler)
  }

  function addSoundHandler(handler: (sound: RenderSoundMessage) => void): void {
    soundHandlerList.push(handler)
  }

  function addTransitionHandler(handler: (transition: RenderRealmTransitionMessage) => void): void {
    transitionHandlerList.push(handler)
  }

  onBeforeUnmount(() => {
    isDisposed = true
    abortController.abort()
    transport?.dispose()
    transport = null
  })

  return {
    isWorldReady,
    initError,
    isRenderStalled,
    canvasKey,
    worldState,
    realmId,
    transportKind,
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
  }
}

/** 比較前後兩份設定，只留有變的欄位；一項都沒變就回 null */
function buildSettingsPatch(next: RenderSettings, previous: RenderSettings): RenderSettingsMessage['patch'] | null {
  const { devToggle: nextDevToggle, ...nextRest } = next
  const { devToggle: previousDevToggle, ...previousRest } = previous

  const patch: RenderSettingsMessage['patch'] = pickBy(nextRest, (value, key) => value !== previousRest[key])
  const devTogglePatch = pickBy(nextDevToggle, (value, key) => value !== previousDevToggle[key])

  if (isEmpty(patch) && isEmpty(devTogglePatch))
    return null

  if (!isEmpty(devTogglePatch)) {
    patch.devToggle = devTogglePatch
  }

  return patch
}
