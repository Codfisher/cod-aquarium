import type { Ref } from 'vue'
import type { RenderCommand, RenderInputMessage, RenderMoveKeys } from './protocol'
import { useEventListener, useRafFn } from '@vueuse/core'
import { clamp, isDeepEqual } from 'remeda'
import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { useMobileController } from '../../composables/use-mobile-controller'

/**
 * 單一次滑鼠事件的位移上限（像素）
 *
 * 一次事件對應的是一批硬體回報，再快的甩滑鼠也到不了這個量級。
 * 超過就是異常值：剛鎖定指標時瀏覽器可能夾帶鎖定前後的座標落差，
 * 分頁切回來、或系統指標加速失控時也會送出上千像素的位移。
 * 這種值不擋下來，畫面會瞬間轉過去。
 *
 * 靈敏度的換算在渲染端（見 use-fps-controller），這裡送的是夾限過的原始像素
 */
const MOUSE_MOVE_LIMIT = 260

/**
 * 滾輪撥一格是多少分鐘
 *
 * 一格二十分鐘：撥個三四下就從中午到黃昏，
 * 想從白天翻到深夜也只要滾一小段，不會滾到手痠
 */
const WHEEL_MINUTE_PER_NOTCH = 20
/** 一次滾輪事件最多算幾格，觸控板一口氣送一大串時才不會瞬移 */
const WHEEL_NOTCH_LIMIT = 3

interface UseInputCaptureParam {
  canvasRef: Ref<HTMLCanvasElement | undefined>;
  /** 還沒開始漫遊時滾輪屬於頁面，不能攔 */
  hasStarted: Ref<boolean>;
  postInput: (message: RenderInputMessage) => void;
  postCommand: (command: RenderCommand) => void;
  /**
   * 是否正在神遊
   *
   * 神遊不鎖定滑鼠：使用者只是在看、在聽，游標該留給桌面。
   * 這段期間點畫面不搶鎖定，轉頭改成按住左鍵拖曳
   */
  isDrifting: Ref<boolean>;
}

/**
 * 輸入擷取（主執行緒）
 *
 * 渲染端在 worker 裡，摸不到 window、document，也沒有 pointer lock。
 * 鍵盤、滑鼠、滾輪、pointer lock 與觸控全留在這裡，整理成訊息送過去。
 * 暫停與游標是否放開是這裡決定的——它們跟著 pointer lock 走——
 * 渲染端只是照著動作。
 *
 * 位移累積起來、每一幀最多送一次：滑鼠的輪詢率動輒一千赫，
 * 逐事件送的話，一秒的訊息量足以把佇列塞滿
 */
export function useInputCapture({ canvasRef, hasStarted, postInput, postCommand, isDrifting }: UseInputCaptureParam) {
  const mobile = useMobileController()
  const { isMobile } = mobile
  /**
   * start 是世界準備好之後才呼叫的，那時已經不在元件的 setup 裡了
   *
   * 把那一刻的 scope 記下來，事後掛上去的監聽器才會跟著元件一起拆掉
   */
  const componentScope = getCurrentScope()

  const isPaused = ref(true)
  /**
   * 滑鼠是否已交還給桌面
   *
   * 與暫停分開：Esc 解除鎖定會叫出選單擋住畫面，
   * 想單純把滑鼠拿回來看看風景時走這條路，世界照樣運轉
   */
  const isCursorFree = ref(false)
  /**
   * 現在是不是「要」鎖住滑鼠
   *
   * 鎖定的請求是非同步的，還會重試；這個旗標記的是最新的意圖，
   * 請求成功或重試的那一刻拿它來對，意圖變了就不鎖（見 handlePointerLockChange）
   */
  let isLockWanted = false

  const keys: RenderMoveKeys = {
    isForwardPressed: false,
    isBackwardPressed: false,
    isLeftPressed: false,
    isRightPressed: false,
    isJumpPressed: false,
    isSprintPressed: false,
  }

  /** 還沒送出的滑鼠位移（像素） */
  const mouseDelta = { x: 0, y: 0 }
  /** 剛鎖定指標時的第一筆事件要丟掉 */
  let hasSettledPointerLock = false

  /**
   * 上一次送出的按鍵與搖桿狀態，沒變也沒有位移就不送
   *
   * 逐欄比對，不要拼成字串：這個函式每一幀都跑，站著不動時也一樣，
   * 為了確認「沒事」而每幀配置一個陣列與字串是不划算的
   */
  const lastSentKeys: RenderMoveKeys = { ...keys }
  const lastSentTouch = { joystickX: 0, joystickZ: 0, magnitude: 0, isJumpPressed: false, isSprintPressed: false }

  function clearMoveKeys() {
    keys.isForwardPressed = false
    keys.isBackwardPressed = false
    keys.isLeftPressed = false
    keys.isRightPressed = false
    keys.isJumpPressed = false
    keys.isSprintPressed = false
  }

  /** 暫停與游標狀態一變就通知渲染端 */
  watch([isPaused, isCursorFree], ([nextIsPaused, nextIsCursorFree]) => {
    postCommand({ command: 'set-control', isPaused: nextIsPaused, isCursorFree: nextIsCursorFree })
  })

  /**
   * 每一幀把累積的輸入送出去
   *
   * 排在主執行緒自己的 rAF 上。渲染端在 worker 裡有自己的迴圈，
   * 兩邊不必同步：位移是累積量，渲染端每一幀取用一次
   */
  const { pause: pauseFlush, resume: resumeFlush } = useRafFn(flushInput, { immediate: false })

  function flushInput() {
    const look = mobile.consumeLookDelta()
    const { joystick, joystickMagnitude, jump, sprint } = mobile.state

    const hasDelta = mouseDelta.x !== 0 || mouseDelta.y !== 0 || look.deltaX !== 0 || look.deltaY !== 0
    const hasStateChanged = !isDeepEqual(keys, lastSentKeys)
      || joystick.x !== lastSentTouch.joystickX
      || joystick.z !== lastSentTouch.joystickZ
      || joystickMagnitude !== lastSentTouch.magnitude
      || jump !== lastSentTouch.isJumpPressed
      || sprint !== lastSentTouch.isSprintPressed

    if (!hasDelta && !hasStateChanged)
      return

    Object.assign(lastSentKeys, keys)
    lastSentTouch.joystickX = joystick.x
    lastSentTouch.joystickZ = joystick.z
    lastSentTouch.magnitude = joystickMagnitude
    lastSentTouch.isJumpPressed = jump
    lastSentTouch.isSprintPressed = sprint

    postInput({
      type: 'input',
      keys: { ...keys },
      joystick: { x: joystick.x, z: joystick.z },
      joystickMagnitude,
      isTouchJumping: jump,
      isTouchSprinting: sprint,
      mouseDeltaX: mouseDelta.x,
      mouseDeltaY: mouseDelta.y,
      touchLookDeltaX: look.deltaX,
      touchLookDeltaY: look.deltaY,
    })

    mouseDelta.x = 0
    mouseDelta.y = 0
  }

  function handleMouseMove(event: MouseEvent) {
    if (!hasStarted.value)
      return

    if (document.pointerLockElement !== canvasRef.value) {
      /** 神遊中沒有鎖定，按住左鍵拖曳才轉頭；放開時滑鼠就只是游標 */
      if (isDrifting.value && isCursorFree.value && (event.buttons & 1) === 1) {
        mouseDelta.x += clamp(event.movementX, { min: -MOUSE_MOVE_LIMIT, max: MOUSE_MOVE_LIMIT })
        mouseDelta.y += clamp(event.movementY, { min: -MOUSE_MOVE_LIMIT, max: MOUSE_MOVE_LIMIT })
      }
      return
    }

    /**
     * 剛鎖定的那一筆位移常常是鎖定前後的座標落差
     *
     * 值可能是好幾百像素，直接套用畫面會瞬間轉過去
     */
    if (!hasSettledPointerLock) {
      hasSettledPointerLock = true
      return
    }

    mouseDelta.x += clamp(event.movementX, { min: -MOUSE_MOVE_LIMIT, max: MOUSE_MOVE_LIMIT })
    mouseDelta.y += clamp(event.movementY, { min: -MOUSE_MOVE_LIMIT, max: MOUSE_MOVE_LIMIT })
  }

  function handleLockStateChange() {
    hasSettledPointerLock = false
    if (document.pointerLockElement !== canvasRef.value) {
      mouseDelta.x = 0
      mouseDelta.y = 0
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    /**
     * 還沒按「開始漫遊」，鍵盤不歸這裡管
     *
     * 世界一準備好輸入就接上了，但那時開始面板還蓋在畫面上。
     * 沒有這一行，面板底下按 Esc 會走「選單開著時 Esc 是繼續」那條路，
     * 在面板後面鎖住滑鼠，接著 WASD 就把人走遠了
     */
    if (!hasStarted.value)
      return

    /**
     * Esc 是開關，不是只有開
     *
     * 按第一次時，瀏覽器自己解除指標鎖定，選單跟著跳出來；
     * 但再按一次什麼都不會發生——指標鎖定早就解除了，沒有第二次事件可以接。
     * 所以選單開著的時候要自己把 Esc 接下來，重新鎖定指標回到漫遊。
     *
     * 這一段要擺在最前面：選單開著時焦點通常落在某個按鈕上，
     * 底下那道「焦點在按鈕上就把鍵盤還給瀏覽器」會先攔截掉
     */
    if (event.code === 'Escape' && isPaused.value) {
      event.preventDefault()
      /** 神遊中關掉選單是回到神遊（游標自由），不是鎖定滑鼠回到操控 */
      if (isDrifting.value) {
        freeCursorForDrift()
      }
      else {
        resume()
      }
      return
    }

    /** 焦點在選單按鈕之類的元素上，鍵盤就該還給瀏覽器 */
    if (event.target instanceof HTMLElement && event.target.closest('button, a, input, select, textarea')) {
      return
    }

    /** 選單開著時不搶鍵盤，Tab 還要在按鈕之間移動焦點 */
    if (isPaused.value) {
      return
    }

    /**
     * Tab 收放滑鼠
     *
     * Esc 是瀏覽器解除鎖定的固定行為，會連選單一起叫出來擋住畫面；
     * 只想把滑鼠拿回來時按 Tab，世界照樣運轉
     */
    if (event.code === 'Tab') {
      event.preventDefault()

      /** 神遊中游標本來就是自由的，Tab 沒有東西可以收放 */
      if (isDrifting.value)
        return

      if (isCursorFree.value) {
        resume()
      }
      else {
        releaseCursor()
      }
      return
    }

    /** 滑鼠已經放開，鍵盤就不該還在操控人物 */
    if (isCursorFree.value) {
      if (event.code === 'Escape') {
        pause()
      }
      return
    }

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.isForwardPressed = true
        break
      case 'KeyS':
      case 'ArrowDown':
        keys.isBackwardPressed = true
        break
      case 'KeyA':
      case 'ArrowLeft':
        keys.isLeftPressed = true
        break
      case 'KeyD':
      case 'ArrowRight':
        keys.isRightPressed = true
        break
      case 'Space':
        keys.isJumpPressed = true
        event.preventDefault()
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        keys.isSprintPressed = true
        break
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.isForwardPressed = false
        break
      case 'KeyS':
      case 'ArrowDown':
        keys.isBackwardPressed = false
        break
      case 'KeyA':
      case 'ArrowLeft':
        keys.isLeftPressed = false
        break
      case 'KeyD':
      case 'ArrowRight':
        keys.isRightPressed = false
        break
      case 'Space':
        keys.isJumpPressed = false
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        keys.isSprintPressed = false
        break
    }
  }

  function handleCanvasClick() {
    if (!hasStarted.value)
      return

    /** 神遊中點畫面是在拖曳轉頭，不是要回到操控 */
    if (isDrifting.value)
      return

    if (!isMobile.value && !isPaused.value) {
      isLockWanted = true
      canvasRef.value?.requestPointerLock()
    }
  }

  /**
   * 滾輪撥時間
   *
   * 只在滾輪真的屬於這個場景時才攔截：沒開始漫遊、
   * 或按 Tab 把滑鼠交還給桌面之後，捲動都該還給頁面。
   * 這件事一定要在主執行緒做——preventDefault 得在事件當下同步呼叫，
   * 等訊息繞到 worker 再回來就來不及了
   */
  function handleWheel(event: WheelEvent) {
    if (!hasStarted.value || isPaused.value || isCursorFree.value)
      return

    event.preventDefault()

    /** deltaMode 為 1 時單位是行不是像素，一行大約十六像素 */
    const pixelDelta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    const notch = clamp(pixelDelta / 100, { min: -WHEEL_NOTCH_LIMIT, max: WHEEL_NOTCH_LIMIT })

    /**
     * 直接加上去，不做追趕也不留慣性：滾輪轉多少、時間就走多少，
     * 手一停天色就停在那裡。中間補一段緩衝看起來是順了，
     * 實際操作起來卻是「放開之後畫面還在自己動」，反而不好對準想要的光線
     */
    postCommand({ command: 'add-time', delta: notch * WHEEL_MINUTE_PER_NOTCH / (24 * 60) })
  }

  /**
   * 要求鎖定滑鼠
   *
   * 剛按 Esc 解除鎖定之後，瀏覽器會有一秒多的冷卻期擋下所有請求。
   * 選單的開關是跟著鎖定狀態走的，請求被擋下就等於「按了沒反應」，
   * 而畫面又已經回到遊戲，看起來就像整個卡住。
   * 所以失敗了要隔一小段時間再試，直到冷卻期過去
   */
  function requestPointerLock(retryCount = 5) {
    /** 等重試的這段時間裡改了主意（開始神遊、叫出選單），就不要再鎖了 */
    if (!isLockWanted)
      return

    const canvas = canvasRef.value
    const request = canvas?.requestPointerLock() as unknown
    if (!(request instanceof Promise))
      return

    request.catch(() => {
      if (retryCount <= 0 || !canvas || document.pointerLockElement === canvas)
        return

      setTimeout(() => requestPointerLock(retryCount - 1), 320)
    })
  }

  /** 桌機的暫停狀態交給 Pointer Lock 決定，避免鎖定失敗時狀態不同步 */
  function resume() {
    isCursorFree.value = false
    isLockWanted = true

    if (isMobile.value) {
      isPaused.value = false
      return
    }

    requestPointerLock()
  }

  function pause() {
    isLockWanted = false
    isCursorFree.value = false
    isPaused.value = true

    if (!isMobile.value && document.pointerLockElement === canvasRef.value) {
      document.exitPointerLock()
    }
  }

  /**
   * 把滑鼠交還給桌面，但不暫停
   *
   * 不叫出選單，畫面照樣跑，點一下畫面就回到操控
   */
  function releaseCursor() {
    if (isMobile.value || isPaused.value)
      return

    isLockWanted = false
    isCursorFree.value = true
    clearMoveKeys()

    if (document.pointerLockElement === canvasRef.value) {
      document.exitPointerLock()
    }
  }

  /**
   * 進入神遊：放開滑鼠但不暫停
   *
   * 與按 Tab 放開滑鼠是同一個狀態（世界照樣跑、選單不跳出來），
   * 差別只在不必先處於操控中——從選單或開始畫面進神遊時，那一刻可能還沒鎖上
   */
  function freeCursorForDrift() {
    if (isMobile.value)
      return

    isLockWanted = false
    isPaused.value = false
    isCursorFree.value = true
    clearMoveKeys()

    if (document.pointerLockElement === canvasRef.value) {
      document.exitPointerLock()
    }
  }

  /** 桌機以 Pointer Lock 的狀態決定暫停與否 */
  function handlePointerLockChange() {
    if (isMobile.value)
      return

    if (document.pointerLockElement === canvasRef.value) {
      /**
       * 鎖上了，但現在已經不要鎖：馬上放開
       *
       * 鎖定是非同步的，剛按過 Esc 還有一秒多的冷卻要重試（見 requestPointerLock）。
       * 從漫遊的選單按「在這裡神遊」時，關選單那一下送出的鎖定請求會晚於「開始神遊、放開滑鼠」才成功，
       * 結果神遊中滑鼠被鎖住、游標拿不回來（使用者回報）。
       * 所以鎖上的當下再確認一次是不是還要鎖
       */
      if (!isLockWanted) {
        document.exitPointerLock()
        return
      }

      isCursorFree.value = false
      isPaused.value = false
      clearMoveKeys()
      return
    }

    /** 自己放開滑鼠不算暫停，選單才不會跳出來擋住畫面 */
    isPaused.value = !isCursorFree.value
  }

  useEventListener(document, 'pointerlockchange', handlePointerLockChange)

  /**
   * 世界準備好之後才開始接輸入
   *
   * 傳進來的 canvas 在 worker 那條路上已經是一塊空殼，但它仍然是頁面上的元素，
   * 點擊、滾輪、觸控與 pointer lock 都還是發生在它身上
   */
  function start() {
    const canvas = canvasRef.value
    if (!canvas)
      return

    componentScope?.run(() => {
      useEventListener(window, 'keydown', handleKeyDown)
      useEventListener(window, 'keyup', handleKeyUp)
      useEventListener(canvas, 'click', handleCanvasClick)
      useEventListener(window, 'mousemove', handleMouseMove)
      useEventListener(document, 'pointerlockchange', handleLockStateChange)
      useEventListener(canvas, 'wheel', handleWheel, { passive: false })

      if (isMobile.value) {
        mobile.setupTouchListeners(canvas)
      }
    })

    resumeFlush()
  }

  onScopeDispose(() => {
    pauseFlush()
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  })

  return {
    start,
    resume,
    pause,
    releaseCursor,
    freeCursorForDrift,
    isPaused,
    isCursorFree,
    isMobile,
    joystickActive: mobile.joystickActive,
    joystickOffset: mobile.joystickOffset,
    joystickOrigin: mobile.joystickOrigin,
    setJump: mobile.setJump,
    setSprint: mobile.setSprint,
  }
}
