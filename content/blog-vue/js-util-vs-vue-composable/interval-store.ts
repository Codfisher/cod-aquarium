import { ref } from 'vue'

/** 同步呼叫的計數 */
export const syncCount = ref(0)

/** 非同步呼叫的計數 */
export const asyncCount = ref(0)

export function resetSyncCount() {
  syncCount.value = 0
}

export function resetAsyncCount() {
  asyncCount.value = 0
}
