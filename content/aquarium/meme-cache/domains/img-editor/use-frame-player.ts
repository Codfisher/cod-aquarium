import type { Ref } from 'vue'
import type { FrameSprite } from './animated-output'
import { useRafFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

/** 影格間隔缺漏時的預設值，比照瀏覽器對 gif 的處理 */
const DEFAULT_FRAME_DELAY = 100

/**
 * 動圖的逐格播放器。
 *
 * `<img>` 播動圖雖然順，卻拿不到當下是第幾格，
 * 文字要跟著影格出現消失就得自己掌握播放進度
 */
export function useFramePlayer(sprite: Ref<FrameSprite | undefined>) {
  const frameIndex = ref(0)
  const playing = ref(true)

  const frameCount = computed(() => sprite.value?.frameCount ?? 0)

  /** 累積到目前影格為止的顯示時間，超過就換下一格 */
  let elapsed = 0

  const { pause: pauseRaf, resume: resumeRaf } = useRafFn(({ delta }) => {
    const current = sprite.value
    if (!current || !playing.value)
      return

    elapsed += delta
    const delay = current.delayList[frameIndex.value] ?? DEFAULT_FRAME_DELAY
    if (elapsed < delay)
      return

    elapsed = 0
    frameIndex.value = (frameIndex.value + 1) % current.frameCount
  }, { immediate: false })

  function play() {
    playing.value = true
    resumeRaf()
  }

  function pause() {
    playing.value = false
  }

  /** 跳到指定影格並暫停，供拖曳時間軸時預覽 */
  function seek(index: number) {
    const max = Math.max(0, frameCount.value - 1)
    frameIndex.value = Math.min(Math.max(0, Math.round(index)), max)
    elapsed = 0
    pause()
  }

  watch(sprite, (value) => {
    frameIndex.value = 0
    elapsed = 0
    if (value) {
      play()
    }
    else {
      pauseRaf()
    }
  }, { immediate: true })

  return { frameIndex, frameCount, playing, play, pause, seek }
}

/** 影格是否落在顯示區間內。未設定區間視為全程顯示 */
export function isFrameInRange(frameRange: [number, number] | undefined, frameIndex: number) {
  if (!frameRange)
    return true

  const [start, end] = frameRange
  return frameIndex >= start && frameIndex <= end
}
