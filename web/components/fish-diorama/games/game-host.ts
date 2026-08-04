/** 迷你遊戲的宿主：借用箱庭的 Engine，為每款遊戲開一個獨立 Scene。
 *
 * 同一個 Engine 底下多個 Scene 是刻意的選擇——遊戲世界完全獨立
 * （自己的地形、天空、霧、物理世界），但箱庭 Scene 留在記憶體不重建，
 * 玩完回去是瞬間的，不必再跑一次進場演出。
 */
import type { Engine } from '@babylonjs/core/Engines/engine'
import type { DioramaLighting } from '../engine/diorama-lighting'
import type { DioramaLook } from '../engine/diorama-look'
import type {
  GameHudState,
  GamePointerEvent,
  MiniGameInstance,
  MiniGameMeta,
} from './game-contract'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Scene } from '@babylonjs/core/scene'
import { createDioramaLighting } from '../engine/diorama-lighting'
import { applyDioramaLook } from '../engine/diorama-look'
import { enableScenePhysics, loadHavokInstance } from '../engine/physics-boot'
import { attachPaperGrainPlugins, setPaperGrainRimLight } from '../paper-grain-plugin'
import '../engine/babylon-side-effects'

/** 單幀 dt 上限（ms）：掉幀時不讓遊戲物件瞬移穿牆 */
const MAX_FRAME_DELTA_MS = 34

/** 卡通描邊：與箱庭主場景同一組深藍紫細線，讓遊戲裡的物件也像被細筆勾過邊。
 * 少了這一層，同一批低多邊模型看起來就是廉價的塑膠塊
 */
const OUTLINE_COLOR = Color3.FromHexString('#2c2747')
const OUTLINE_WIDTH = 0.006

function readSkipOutline(metadata: unknown): boolean {
  return Boolean((metadata as { skipOutline?: boolean } | null)?.skipOutline)
}

/** 幫整個遊戲場景補上主場景的兩樣質感：卡通描邊與紙紋外掛（輪廓光）。
 *
 * 必須在遊戲的 start() 跑完之後呼叫——那時世界才建好，材質與網格都在場上了。
 * 疊圖類（HUD、瞄準扇形）一律跳過：它們是貼在鏡頭前的 2D 介面，描了邊會像貼紙鑲黑框
 */
function applySceneCraft(scene: Scene, camera: ArcRotateCamera, isDark: boolean): void {
  for (const mesh of scene.meshes) {
    // billboard 面（血條、旗標這類永遠面向鏡頭的 UI 感元素）不描邊
    if (mesh.billboardMode !== TransformNode.BILLBOARDMODE_NONE) {
      continue
    }
    // 掛在相機下的疊圖是 HUD，不屬於world；用祖先鏈判斷比用命名慣例可靠
    if (mesh.isDescendantOf(camera)) {
      continue
    }
    // 貼在別的表面上的裝飾（苔癬色塊這類「貼花」）自己標記跳過：
    // 描邊的實作是放大一圈的背面外殼，貼花貼得跟母體幾乎共平面，
    // 那圈外殼會整個溢到母體表面上，看起來就是一圈突兀的深紫邊
    if (readSkipOutline(mesh.metadata)) {
      continue
    }
    const material = mesh.material
    // 無光照材質是特效與提示（閃光扇形、衝擊環），描邊只會讓它們變髒
    if (!material || (material as { disableLighting?: boolean }).disableLighting) {
      continue
    }
    mesh.renderOutline = true
    mesh.outlineWidth = OUTLINE_WIDTH
    mesh.outlineColor = OUTLINE_COLOR
  }

  // 紙紋外掛此處只為輪廓光：面向邊緣的提亮把物件從背景托出，
  // 在 flat shading 下呈塊面提亮，正是切面之間彼此分明的關鍵
  setPaperGrainRimLight(
    isDark ? Color3.FromHexString('#8ea4ff') : Color3.FromHexString('#ffdca0'),
    isDark ? 0.12 : 0.08,
  )
  attachPaperGrainPlugins(scene)
}

export interface GameHostOptions {
  canvas: HTMLCanvasElement;
  /** 與箱庭共用的引擎 */
  engine: Engine;
  isDark: boolean;
  /** 分數變動時回報，供 HUD 顯示 */
  onScoreChange: (score: number) => void;
  /** 遊戲結束，帶最終分數。host 已停止 update，等外層決定重玩或離開 */
  onGameOver: (finalScore: number) => void;
  /** 短暫提示文字 */
  onToast: (text: string) => void;
  /** 遊戲自訂 HUD 的內容變動。沒有自訂 HUD 的遊戲永遠不會觸發 */
  onHudStateChange?: (state: GameHudState) => void;
  /** 遊戲場景就緒（資源建好、start 已呼叫），外層可據此收掉載入畫面 */
  onReady?: () => void;
}

export interface GameHost {
  /** 載入一款遊戲並開始渲染，但停在「尚未開始」狀態等玩家看完說明 */
  launch: (meta: MiniGameMeta) => Promise<void>;
  /** 關掉說明卡、真正開始遊玩 */
  beginPlay: () => void;
  /** 開關渲染迴圈。切分頁或不可見時關掉 */
  setRunning: (value: boolean) => void;
  setDarkMode: (value: boolean) => void;
  resize: () => void;
  /** 關閉目前遊戲並釋放其 Scene。之後可再 launch */
  close: () => void;
  /** HUD 上的按鈕被按下，轉交給目前的遊戲 */
  triggerHudAction: (actionKey: string) => void;
  /** 目前遊戲是否已結束（等待外層決定重玩或離開） */
  isGameOver: () => boolean;
  dispose: () => void;
}

/** 空的 HUD 內容。沒有自訂 HUD 的遊戲、以及關閉遊戲時都回到這個狀態 */
const EMPTY_HUD_STATE: GameHudState = { gaugeList: [], pipRowList: [], actionList: [] }

export function createGameHost(options: GameHostOptions): GameHost {
  const { canvas, engine, onScoreChange, onGameOver, onToast, onHudStateChange, onReady } = options

  let isDark = options.isDark
  let isDisposed = false
  let isRunning = false

  /** 目前遊戲的全部資源。null = 沒有遊戲在跑 */
  let activeSession: {
    meta: MiniGameMeta;
    scene: Scene;
    camera: ArcRotateCamera;
    lighting: DioramaLighting;
    look: DioramaLook;
    instance: MiniGameInstance;
    /** 玩家是否已看完說明按下開始。未開始時場景照樣渲染但不推進，
     * 說明卡背後就是這款遊戲世界的第一幀
     */
    hasStarted: boolean;
    isOver: boolean;
    /** launch 的世代序號，防止非同步載入回來時已被 close 或換了遊戲 */
    generation: number;
  } | null = null

  let launchGeneration = 0

  function renderFrame() {
    const session = activeSession
    if (!session) {
      return
    }
    const deltaSeconds = Math.min(engine.getDeltaTime(), MAX_FRAME_DELTA_MS) / 1000
    if (session.hasStarted && !session.isOver) {
      session.instance.update(deltaSeconds)
    }
    session.scene.render()
  }

  function setRunning(value: boolean) {
    if (isDisposed || isRunning === value) {
      return
    }
    isRunning = value
    if (value) {
      engine.runRenderLoop(renderFrame)
    }
    else {
      engine.stopRenderLoop(renderFrame)
    }
  }

  /** 把原生指標事件轉成遊戲契約的座標格式 */
  function toGamePointerEvent(
    type: GamePointerEvent['type'],
    event: PointerEvent,
  ): GamePointerEvent {
    const rect = canvas.getBoundingClientRect()
    return {
      type,
      xRatio: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5,
      yRatio: rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5,
      clientX: event.clientX,
      clientY: event.clientY,
    }
  }

  /** 遊戲進行中攔截 canvas 指標事件：在捕獲階段停止傳播，
   * 箱庭原有的點擊移動與拖曳邏輯就收不到，兩套輸入不會打架
   */
  function handlePointerEvent(type: GamePointerEvent['type']) {
    return (event: PointerEvent) => {
      const session = activeSession
      if (!session) {
        return
      }
      event.stopPropagation()
      // 說明卡還開著時就吞掉輸入：玩家點「開始」的那一下不該同時被
      // 遊戲當成第一個操作（在蠟筆滑道會變成畫出一條莫名其妙的線）
      if (!session.hasStarted || session.isOver) {
        return
      }
      session.instance.handlePointer?.(toGamePointerEvent(type, event))
    }
  }

  const handlePointerDown = handlePointerEvent('down')
  const handlePointerMove = handlePointerEvent('move')
  const handlePointerUp = handlePointerEvent('up')
  const handlePointerCancel = handlePointerEvent('cancel')

  function handleKeyDown(event: KeyboardEvent) {
    const session = activeSession
    if (!session || !session.hasStarted || session.isOver) {
      return
    }
    session.instance.handleKey?.(event)
  }

  function attachInputListenerList() {
    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true })
    canvas.addEventListener('pointermove', handlePointerMove, { capture: true })
    canvas.addEventListener('pointerup', handlePointerUp, { capture: true })
    canvas.addEventListener('pointercancel', handlePointerCancel, { capture: true })
    window.addEventListener('keydown', handleKeyDown)
  }

  function detachInputListenerList() {
    canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true })
    canvas.removeEventListener('pointermove', handlePointerMove, { capture: true })
    canvas.removeEventListener('pointerup', handlePointerUp, { capture: true })
    canvas.removeEventListener('pointercancel', handlePointerCancel, { capture: true })
    window.removeEventListener('keydown', handleKeyDown)
  }

  function applyClearColor(scene: Scene, meta: MiniGameMeta) {
    const hex = isDark
      ? meta.sceneOptions.darkClearColorHex ?? meta.sceneOptions.clearColorHex
      : meta.sceneOptions.clearColorHex
    const color = Color3.FromHexString(hex)
    scene.clearColor = new Color4(color.r, color.g, color.b, 1)
  }

  function close() {
    const session = activeSession
    // 先讓迴圈停下再拆場景，避免 renderFrame 摸到半銷毀的 Scene
    setRunning(false)
    activeSession = null
    if (!session) {
      return
    }
    detachInputListenerList()
    session.instance.dispose()
    session.look.dispose()
    session.lighting.dispose()
    session.scene.dispose()
    // HUD 是常駐的 Vue 元件，收掉遊戲時要主動清空，
    // 否則下一款遊戲載入前會殘留上一款的槽與按鈕
    onHudStateChange?.(EMPTY_HUD_STATE)
  }

  async function launch(meta: MiniGameMeta) {
    close()
    launchGeneration += 1
    const generation = launchGeneration

    // 實作程式碼與物理 WASM 並行載入，等待時間取兩者較長者而非相加。
    // WASM 失敗不擋啟動——遊戲各自有無物理的降級路徑
    const [factory] = await Promise.all([
      meta.loadFactory(),
      meta.sceneOptions.needsPhysics
        ? loadHavokInstance().catch(() => undefined)
        : Promise.resolve(undefined),
    ])

    if (isDisposed || generation !== launchGeneration) {
      return
    }

    const scene = new Scene(engine)
    applyClearColor(scene, meta)

    const camera = new ArcRotateCamera(
      `${meta.id}Camera`,
      -Math.PI / 2,
      Math.PI / 3,
      14,
      new Vector3(0, 1, 0),
      scene,
    )
    camera.fov = 0.7

    const hasPhysics = meta.sceneOptions.needsPhysics
      ? await enableScenePhysics(scene, { isSceneDisposed: () => scene.isDisposed })
      : false

    if (isDisposed || generation !== launchGeneration || scene.isDisposed) {
      scene.dispose()
      return
    }

    const lighting = createDioramaLighting(scene, {
      namePrefix: meta.id,
      ...meta.sceneOptions.lighting,
    })
    const look = applyDioramaLook(scene, camera, {
      namePrefix: meta.id,
      ...meta.sceneOptions.look,
    })

    let currentScore = 0
    const session = {
      meta,
      scene,
      camera,
      lighting,
      look,
      hasStarted: false,
      isOver: false,
      generation,
      /** 上一次送出去的 HUD 內容，用來擋掉沒變動的重繪 */
      hudStateJson: '',
      instance: undefined as unknown as MiniGameInstance,
    }

    session.instance = factory({
      scene,
      camera,
      lighting,
      hasPhysics,
      isDark,
      getAspectRatio: () => engine.getRenderWidth() / Math.max(1, engine.getRenderHeight()),
      reportScore(score) {
        if (session.isOver) {
          return
        }
        currentScore = score
        onScoreChange(score)
      },
      reportGameOver() {
        if (session.isOver) {
          return
        }
        session.isOver = true
        onGameOver(currentScore)
      },
      reportToast(text) {
        onToast(text)
      },
      reportHudState(state) {
        if (session.isOver) {
          return
        }
        // 遊戲每幀都會呼叫，這裡自己比對：HUD 是 Vue 元件，
        // 每幀無條件塞新物件會讓它每幀都重繪
        const serialized = JSON.stringify(state)
        if (serialized === session.hudStateJson) {
          return
        }
        session.hudStateJson = serialized
        onHudStateChange?.(state)
      },
    })

    activeSession = session
    attachInputListenerList()
    onScoreChange(0)
    // start() 是各遊戲建構世界與定位相機的地方，必須在說明卡出現前就跑完，
    // 否則玩家看到的是一個沒初始化的場景（角色停在原點、相機沒取景）。
    // 「還沒開始」只凍結 update 與輸入，畫面停在世界的第一幀當預覽
    session.instance.start()
    // 世界建好後才補描邊與輪廓光：這時材質與網格都已經在場上了
    applySceneCraft(scene, camera, isDark)
    setRunning(true)
    onReady?.()
  }

  /** 玩家看完說明按下開始，世界開始推進、輸入開始生效 */
  function beginPlay() {
    const session = activeSession
    if (!session) {
      return
    }
    session.hasStarted = true
  }

  return {
    launch,
    beginPlay,
    setRunning,
    setDarkMode(value) {
      isDark = value
      if (activeSession) {
        applyClearColor(activeSession.scene, activeSession.meta)
      }
    },
    resize() {
      engine.resize()
      activeSession?.instance.resize?.()
    },
    close,
    triggerHudAction(actionKey) {
      const session = activeSession
      // 說明卡還開著或已結算時不轉交，比照一般輸入的處理
      if (!session || !session.hasStarted || session.isOver) {
        return
      }
      session.instance.handleHudAction?.(actionKey)
    },
    isGameOver: () => activeSession?.isOver ?? false,
    dispose() {
      isDisposed = true
      close()
    },
  }
}
