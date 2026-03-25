import { onBeforeUnmount, onMounted, reactive } from 'vue'

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  /** -1（左）到 1（右）的轉向軸 */
  axisX: number;
  /** -1（後退）到 1（前進）的油門軸 */
  axisZ: number;
}

export function useInput() {
  const state = reactive<InputState>({
    forward: false,
    back: false,
    left: false,
    right: false,
    axisX: 0,
    axisZ: 0,
  })

  function updateAxis() {
    state.axisX = (state.right ? 1 : 0) - (state.left ? 1 : 0)
    state.axisZ = (state.forward ? 1 : 0) - (state.back ? 1 : 0)
  }

  function handleKeyDown(event: KeyboardEvent) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        state.forward = true
        break
      case 'KeyS':
      case 'ArrowDown':
        state.back = true
        break
      case 'KeyA':
      case 'ArrowLeft':
        state.left = true
        break
      case 'KeyD':
      case 'ArrowRight':
        state.right = true
        break
    }
    updateAxis()
  }

  function handleKeyUp(event: KeyboardEvent) {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        state.forward = false
        break
      case 'KeyS':
      case 'ArrowDown':
        state.back = false
        break
      case 'KeyA':
      case 'ArrowLeft':
        state.left = false
        break
      case 'KeyD':
      case 'ArrowRight':
        state.right = false
        break
    }
    updateAxis()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
  })

  return { input: state }
}
