import { type MaybeElement, promiseTimeout, useEventListener } from '@vueuse/core'
import { pipe } from 'remeda'
import { getCurrentInstance, onMounted, ref, toValue } from 'vue'

interface UseImagesReadyParams {
  /** 不指定則為目前元件 */
  target?: MaybeElement;
  /** 強制延遲（ms），保險起見 */
  forceDelay?: number;
}

/** 偵測目標下所有圖片是否載入完成
 *
 * 暫時不考慮動態新增的圖片
 */
export function useImagesReady(params: UseImagesReadyParams = {}) {
  const {
    target,
    forceDelay = 0,
  } = params

  const totalImages = ref(0)
  const isReady = ref(false)
  const instance = getCurrentInstance()

  /** 元素是否可見 */
  function isElementVisible(el: HTMLElement | null) {
    /** 要一路往父層檢查 */
    while (el) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false
      }
      el = el.parentElement
    }
    return true
  }

  onMounted(() => {
    const rootElement = pipe(
      toValue(target),
      (value) => {
        if (value && '$el' in value) {
          return value.$el
        }

        return value
          ?? instance?.vnode?.el
          ?? instance?.proxy?.$el
          ?? document.documentElement
      },
      (value) => value as HTMLElement | undefined,
    )

    if (!rootElement) {
      isReady.value = true
      console.warn('[useImagesReady] no element found')
      return
    }

    const imageElements = Array.from(
      rootElement.querySelectorAll('img'),
    ).filter((img) =>
      /** 排除 display:none 的元素，offsetParent
       *
       * 暫時不考慮 background-image
       *
       * https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetParent
       */
      img.src && isElementVisible(img),
    )

    totalImages.value = imageElements.length

    if (totalImages.value === 0) {
      isReady.value = true
      return
    }

    let loadedCount = 0

    async function checkCompletion() {
      if (loadedCount === totalImages.value) {
        await promiseTimeout(forceDelay)
        isReady.value = true
      }
    }

    function handleEvent() {
      loadedCount++
      checkCompletion()
    }

    imageElements.forEach((img) => {
      if (img.complete) {
        loadedCount++
        return
      }

      useEventListener(img, 'load', handleEvent, { once: true })
      useEventListener(img, 'error', handleEvent, { once: true })
    })

    checkCompletion()
  })

  return {
    isReady,
    totalImages,
  }
}
