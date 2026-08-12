import { useEventListener, useMediaQuery } from '@vueuse/core'
import { reactive, ref } from 'vue'

/** 搖桿輸入狀態（-1 ~ 1） */
interface JoystickState {
  x: number;
  z: number;
}

/** 手機觸控控制的輸出狀態 */
export interface MobileControlState {
  /** 搖桿移動向量（-1 ~ 1） */
  joystick: JoystickState;
  /** 搖桿偏移比例（0 ~ 1），用於類比速度控制 */
  joystickMagnitude: number;
  /** 視角旋轉增量（每幀消費後歸零） */
  lookDeltaX: number;
  lookDeltaY: number;
  /** 按鈕狀態 */
  jump: boolean;
  sprint: boolean;
}

/**
 * 手機虛擬控制
 *
 * 只管理觸控狀態，UI 交給 touch-control-panel.vue
 */
export function useMobileController() {
  const isMobile = useMediaQuery('(pointer: coarse)')

  const state = reactive<MobileControlState>({
    joystick: { x: 0, z: 0 },
    joystickMagnitude: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    jump: false,
    sprint: false,
  })

  // ── 搖桿 ──

  let joystickTouchId: number | null = null
  let joystickCenterX = 0
  let joystickCenterY = 0
  const JOYSTICK_RADIUS = 60

  const joystickOffset = reactive({ x: 0, y: 0 })
  const joystickActive = ref(false)
  const joystickOrigin = reactive({ x: 0, y: 0 })

  function handleJoystickStart(touch: Touch) {
    joystickTouchId = touch.identifier
    joystickCenterX = touch.clientX
    joystickCenterY = touch.clientY
    joystickOrigin.x = touch.clientX
    joystickOrigin.y = touch.clientY
    joystickActive.value = true
    joystickOffset.x = 0
    joystickOffset.y = 0
    state.joystick.x = 0
    state.joystick.z = 0
  }

  function handleJoystickMove(touch: Touch) {
    const deltaX = touch.clientX - joystickCenterX
    const deltaY = touch.clientY - joystickCenterY
    const distance = Math.hypot(deltaX, deltaY)
    const clampedDistance = Math.min(distance, JOYSTICK_RADIUS)

    if (distance <= 0)
      return

    const ratio = clampedDistance / distance
    const clampedX = deltaX * ratio
    const clampedY = deltaY * ratio
    state.joystick.x = clampedX / JOYSTICK_RADIUS
    state.joystick.z = clampedY / JOYSTICK_RADIUS
    state.joystickMagnitude = clampedDistance / JOYSTICK_RADIUS
    joystickOffset.x = clampedX
    joystickOffset.y = clampedY
  }

  function handleJoystickEnd() {
    joystickTouchId = null
    joystickActive.value = false
    joystickOffset.x = 0
    joystickOffset.y = 0
    state.joystick.x = 0
    state.joystick.z = 0
    state.joystickMagnitude = 0
  }

  // ── 視角觸控 ──

  let lookTouchId: number | null = null
  let lastLookX = 0
  let lastLookY = 0
  const LOOK_SENSITIVITY = 0.008

  function handleLookStart(touch: Touch) {
    lookTouchId = touch.identifier
    lastLookX = touch.clientX
    lastLookY = touch.clientY
  }

  function handleLookMove(touch: Touch) {
    state.lookDeltaX += (touch.clientX - lastLookX) * LOOK_SENSITIVITY
    state.lookDeltaY += (touch.clientY - lastLookY) * LOOK_SENSITIVITY
    lastLookX = touch.clientX
    lastLookY = touch.clientY
  }

  function handleLookEnd() {
    lookTouchId = null
  }

  // ── 觸控分發（左半 = 搖桿，右半 = 視角） ──

  function setupTouchListeners(canvas: HTMLCanvasElement) {
    useEventListener(canvas, 'touchstart', (event: TouchEvent) => {
      event.preventDefault()
      const canvasRect = canvas.getBoundingClientRect()
      const middleX = canvasRect.left + canvasRect.width / 2

      for (const touch of Array.from(event.changedTouches)) {
        if (touch.clientX < middleX && joystickTouchId === null) {
          handleJoystickStart(touch)
        }
        else if (touch.clientX >= middleX && lookTouchId === null) {
          handleLookStart(touch)
        }
      }
    }, { passive: false })

    useEventListener(canvas, 'touchmove', (event: TouchEvent) => {
      event.preventDefault()
      for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier === joystickTouchId) {
          handleJoystickMove(touch)
        }
        else if (touch.identifier === lookTouchId) {
          handleLookMove(touch)
        }
      }
    }, { passive: false })

    const handleTouchEnd = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier === joystickTouchId) {
          handleJoystickEnd()
        }
        else if (touch.identifier === lookTouchId) {
          handleLookEnd()
        }
      }
    }

    useEventListener(canvas, 'touchend', handleTouchEnd)
    useEventListener(canvas, 'touchcancel', handleTouchEnd)
  }

  /** 消費視角增量（每幀呼叫一次後歸零） */
  function consumeLookDelta() {
    const deltaX = state.lookDeltaX
    const deltaY = state.lookDeltaY
    state.lookDeltaX = 0
    state.lookDeltaY = 0
    return { deltaX, deltaY }
  }

  function setJump(pressed: boolean) {
    state.jump = pressed
  }

  function setSprint(pressed: boolean) {
    state.sprint = pressed
  }

  return {
    isMobile,
    state,
    joystickOffset,
    joystickActive,
    joystickOrigin,
    setupTouchListeners,
    consumeLookDelta,
    setJump,
    setSprint,
  }
}
