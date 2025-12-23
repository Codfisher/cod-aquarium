import { useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { type Directive, effectScope } from 'vue'

// #region utils
/** 取得所有可捲動的祖先元素 */
function getScrollableParents(el: Element | null) {
  const result: Array<HTMLElement | Window> = []
  if (!el)
    return [window]

  let parent = el.parentElement
  while (parent) {
    const style = getComputedStyle(parent)
    const oy = style.overflowY
    const ox = style.overflowX

    const scrollY = (oy === 'auto' || oy === 'scroll' || oy === 'overlay')
      && parent.scrollHeight > parent.clientHeight

    const scrollX = (ox === 'auto' || ox === 'scroll' || ox === 'overlay')
      && parent.scrollWidth > parent.clientWidth

    if (scrollY || scrollX)
      result.push(parent)
    parent = parent.parentElement
  }

  result.push(window)
  return result
}

interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** 取得 window viewport，用於初始可視區 */
function windowRect(): RectLike {
  return {
    top: 0,
    left: 0,
    bottom: window.innerHeight,
    right: window.innerWidth,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

/** 計算兩個 Rect 的交集 */
function intersectRect(a: RectLike, b: RectLike): RectLike {
  const top = Math.max(a.top, b.top)
  const left = Math.max(a.left, b.left)
  const bottom = Math.min(a.bottom, b.bottom)
  const right = Math.min(a.right, b.right)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  return { top, left, bottom, right, width, height }
}

/** 取所有 scrollable 元素的「可視區交集」 */
function getEffectiveRootRect(parentEl: HTMLElement) {
  const parents = getScrollableParents(parentEl)
  let rect = windowRect()
  for (const p of parents) {
    if (p === window)
      continue
    rect = intersectRect(rect, (p as Element).getBoundingClientRect())
    if (rect.height <= 0 || rect.width <= 0)
      break
  }
  return rect
}
// #endregion utils

// #region options
/** number 表示 top 值 */
type StickyValue =
  | number
  | {
    top?: number;
    bottomPadding?: number;
  }

function getOptions(value: StickyValue | undefined) {
  if (typeof value === 'number')
    return { top: value, bottomPadding: 0 }
  return {
    top: value?.top ?? 0,
    bottomPadding: value?.bottomPadding ?? 0,
  }
}
// #endregion options

// #region directive
interface StickyInstance {
  scope: ReturnType<typeof effectScope>;
  setOptions: (value: StickyValue) => void;
  restore: () => void;
}
const KEY = Symbol('vSticky')
/** 取得存在元素上的上下文資料 */
function getContext(el: HTMLElement): StickyInstance | undefined {
  return (el as any)[KEY]
}
/** 將上下文資料存到元素上，讓 updated/beforeUnmount 調用同一個上下文資料 */
function setContext(el: HTMLElement, instance: StickyInstance) {
  (el as any)[KEY] = instance
}

/** 突破 CSS sticky 限制
 *
 * 用 translate 模擬 sticky，支援多層 scroll + 動態出現的 scroll area
 */
export const vSticky: Directive<HTMLElement, StickyValue> = {
  mounted(el, binding) {
    const parentEl = el.parentElement
    if (!parentEl) {
      console.warn('v-sticky 父元素不能為空')
      return
    }

    const scope = effectScope()
    let opts = getOptions(binding.value)

    const oriStyle = {
      translate: el.style.translate,
      willChange: el.style.willChange,
    }

    let appliedY = 0
    let rafId = 0

    const update = async () => {
      if (rafId)
        return

      /** 用 requestAnimationFrame 省去多餘的更新 */
      rafId = requestAnimationFrame(() => {
        rafId = 0
        if (!el.isConnected)
          return

        const parentRect = parentEl.getBoundingClientRect()
        const rootRect = getEffectiveRootRect(parentEl)
        const elRect = el.getBoundingClientRect()

        /** 扣掉目前位移，原始 top 位置 */
        const naturalTop = elRect.top - appliedY
        const deltaInParent = naturalTop - parentRect.top

        const minTop = rootRect.top + opts.top
        let nextY = Math.max(0, minTop - naturalTop)

        // 卡在父元素底部，不要超出去
        const maxYRaw = parentRect.height - (deltaInParent + elRect.height) - opts.bottomPadding
        const maxY = Math.max(0, maxYRaw)
        nextY = Math.min(nextY, maxY)

        if (Math.abs(nextY - appliedY) > 0.5) {
          appliedY = nextY
          el.style.translate = `0px ${appliedY}px`
        }
      })
    }

    const restore = () => {
      if (rafId)
        cancelAnimationFrame(rafId)
      rafId = 0
      el.style.translate = oriStyle.translate
      el.style.willChange = oriStyle.willChange
    }

    scope.run(() => {
      el.style.willChange = 'translate'

      // capture 抓到「任何元素」的 scroll（包含後來才出現的內層 scroll area）
      useEventListener(document, 'scroll', update, { passive: true, capture: true })
      useEventListener(window, 'resize', update, { passive: true })

      useMutationObserver(parentEl, update, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      })

      useResizeObserver(parentEl, update)
      useResizeObserver(el, update)

      update()
    })

    // 存起來讓 updated/beforeUnmount 用
    setContext(el, {
      scope,
      setOptions: (v: StickyValue) => opts = getOptions(v),
      restore,
    })
  },

  updated(el, binding) {
    const ctx = getContext(el)
    ctx?.setOptions(binding.value)
  },

  beforeUnmount(el) {
    const ctx = getContext(el)

    ctx?.restore()
    ctx?.scope.stop()
  },
}
// #endregion directive
