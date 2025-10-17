// useStickyToolbar.ts
import { useRafFn } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export interface StickyToolbarOptions {
  /** 是否加上 safe-area（預設 true） */
  includeSafeArea?: boolean;
  zIndex?: number;
  keyboardMinInset?: number;
  watchWhileFocusedOnly?: boolean;
}

export function useStickyToolbar(
  toolbarRef: Ref<HTMLElement | null>,
  options: StickyToolbarOptions = {},
) {
  const {
    includeSafeArea = true,
    zIndex = 60,
    keyboardMinInset = 120,
    watchWhileFocusedOnly = true,
  } = options

  /** 需往上墊高的距離（鍵盤/工具列遮擋） */
  const occluded = ref(0)
  const toolbarHeight = ref(0)

  function isTextInputFocused() {
    const el = (document.activeElement || null) as HTMLElement | null
    if (!el)
      return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
  }

  // 對齊實際 CSS 像素（避免 0.5px 抖）
  function toCssPx(v: number) {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    return Math.max(0, Math.round(v * dpr) / dpr)
  }

  function measureToolbar() {
    const el = toolbarRef.value
    if (el)
      toolbarHeight.value = el.getBoundingClientRect().height
  }

  // 計算「底部被遮住」的量：LayoutVH - (VVH + VVoTop)
  function computeInset() {
    if (typeof window === 'undefined')
      return 0

    const vv = window.visualViewport
    if (!vv)
      return 0

    const raw = window.innerHeight - (vv.height + vv.offsetTop)
    return toCssPx(raw)
  }

  function refresh() {
    const inset = computeInset()
    const looksLikeKeyboard = inset >= keyboardMinInset
    const focused = isTextInputFocused()

    // 只在鍵盤/輸入聚焦時啟用抬高；否則歸 0，避免 Android 上網址列收起造成晃動
    occluded.value = (looksLikeKeyboard || (!watchWhileFocusedOnly && inset > 0) || focused)
      ? inset
      : 0

    measureToolbar()
  }

  useRafFn(() => {
    refresh()
  })

  const baseBottom = includeSafeArea ? 'env(safe-area-inset-bottom)' : '0px'
  const bottomValue = computed(() => baseBottom)
  const transformValue = computed(() => `translate3d(0, -${occluded.value}px, 0)`)

  /** 綁在「固定底部的 toolbar」上的 style（transform 版） */
  const toolbarStyle = computed<Record<string, string | number>>(() => ({
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: bottomValue.value,
    // 只讓合成器層處理位移，避免 reflow
    transform: transformValue.value,
    willChange: 'transform',
    // 若你用 Tailwind，可加上 class: transform-gpu
    zIndex,
  }))

  /** 綁在「內容容器」上的 style（為 toolbar 騰出底部空間） */
  const contentStyle = computed<Record<string, string>>(() => ({
    paddingBottom: includeSafeArea
      ? `calc(${toolbarHeight.value}px + env(safe-area-inset-bottom))`
      : `${toolbarHeight.value}px`,
  }))

  return { toolbarStyle, contentStyle, occluded, toolbarHeight, refresh }
}
