import { createSharedComposable, useMediaQuery } from '@vueuse/core'
import { ref } from 'vue'

export type GraphicsQuality = 'high' | 'low'

/**
 * 畫面等級管理
 *
 * - 手機預設「低」，電腦預設「高」
 * - 使用者可在系統選單中切換
 */
export function _useGraphicsQuality() {
  const isMobile = useMediaQuery('(pointer: coarse)')
  const quality = ref<GraphicsQuality>(isMobile.value ? 'low' : 'high')

  return { isMobile, quality }
}

export const useGraphicsQuality = createSharedComposable(_useGraphicsQuality)
