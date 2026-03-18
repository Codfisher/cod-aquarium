import { onScopeDispose, onUnmounted, ref } from 'vue'

/** 簡化版 useIntervalFn，用於示範 composable 的自動清除機制 */
export function useIntervalFnSimple(
  callback: () => void,
  interval: number,
) {
  let timerId: ReturnType<typeof setInterval> | null = null
  const isActive = ref(false)

  function stop() {
    if (timerId) {
      clearInterval(timerId)
      timerId = null
    }
    isActive.value = false
  }

  function start() {
    stop()
    timerId = setInterval(callback, interval)
    isActive.value = true
  }

  start()
  onScopeDispose(stop)

  return { isActive, start, stop }
}
