import { createSharedComposable, useMediaQuery, useStorage } from '@vueuse/core'
import { computed } from 'vue'

export type GraphicsQuality = 'high' | 'low'

/**
 * 畫面等級管理
 *
 * - 手機預設「低」，電腦預設「高」
 * - 使用者可在系統選單中切換，選過就記在瀏覽器裡
 */
export function _useGraphicsQuality() {
  const isMobile = useMediaQuery('(pointer: coarse)')

  /**
   * 沒選過是 null，不是預設值
   *
   * 直接把裝置判斷的結果當預設存進去是不行的：useMediaQuery 要等
   * 媒體查詢回報才知道答案，第一拍可能還是 false——手機上那一拍
   * 會把「高」寫進儲存並從此固定下來，之後再也回不到裝置該有的預設。
   *
   * 存 null 表示「使用者還沒表示意見」，這時每次都重新問裝置；
   * 一旦動過選單才寫進去。兩種狀態分開，誤判就不會被記成選擇
   */
  const storedQuality = useStorage<GraphicsQuality | null>('minespace-graphics-quality', null)

  const quality = computed<GraphicsQuality>({
    get: () => storedQuality.value ?? (isMobile.value ? 'low' : 'high'),
    set: (value) => {
      storedQuality.value = value
    },
  })

  return { isMobile, quality }
}

export const useGraphicsQuality = createSharedComposable(_useGraphicsQuality)
