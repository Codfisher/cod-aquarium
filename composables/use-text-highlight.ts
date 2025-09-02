import type { MaybeElementRef } from '@vueuse/core'
import { promiseTimeout, tryOnBeforeUnmount, tryOnMounted, useMutationObserver, useStyleTag, watchThrottled } from '@vueuse/core'
import { computed, type MaybeRefOrGetter, nextTick, toValue, useId } from 'vue'

interface UseTextHighlightOptions {
  /** 搜尋目標，會標記以下文字節點 */
  target?: MaybeElementRef;
  /** 標記底色 */
  background?: MaybeRefOrGetter<string>;
  /** 標記文字顏色 */
  color?: MaybeRefOrGetter<string>;
  /** 額外的觸發條件，變動時會更新標記
   *
   * 可確保外部依賴資料更新後也會更新標記
   */
  triggerOn?: MaybeRefOrGetter;
  /** 強制延遲指定時間後再執行
   *
   * 若 target DOM 更新自動偵測無效，可以使用此參數
   */
  delay?: number;
}
export function useTextHighlight(
  keyword: MaybeRefOrGetter<string>,
  options: UseTextHighlightOptions = {},
) {
  const highlightName = `highlight-${Math.random().toString(36).slice(2)}`

  const targetEl = computed<HTMLElement | SVGElement>(() => {
    const target = toValue(options.target)
    if (!target) {
      return document.documentElement
    }

    if (target instanceof Element) {
      return target
    }

    if (target.$el instanceof HTMLElement) {
      return target.$el
    }

    throw new Error('Invalid target')
  })

  /** Highlight 是一個類 Set 物件
   *
   * [MDN Highlight](https://developer.mozilla.org/en-US/docs/Web/API/Highlight#instance_methods)
   */
  const highlightSet = new Highlight()

  function clear() {
    // @ts-expect-error TS 誤報
    CSS.highlights.delete?.(highlightName)
    // @ts-expect-error TS 誤報
    highlightSet.clear?.()
  }

  // 建立全域樣式
  const style = computed(() => {
    const background = toValue(options.background) ?? '#ffeb3b'
    const color = toValue(options.color) ?? 'inherit'

    return `::highlight(${highlightName}) {
      background: ${background};
      color: ${color};
    }`
  })
  useStyleTag(style)

  tryOnMounted(() => {
    // @ts-expect-error TS 誤報
    CSS.highlights.set?.(highlightName, highlightSet)
  })
  tryOnBeforeUnmount(() => {
    clear()
  })

  async function highlight(keyword: string) {
    // @ts-expect-error TS 誤報
    highlightSet.clear?.()

    if (!keyword)
      return

    // 確保 DOM 已更新
    await nextTick()
    await promiseTimeout(options.delay ?? 0)

    const nodeIterator = document.createNodeIterator(
      targetEl.value,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parentElement = node.parentElement
          // 排除不該進去的區塊
          if (!parentElement || /^(?:SCRIPT|STYLE|NOSCRIPT|TEXTAREA|TITLE|IFRAME)$/.test(parentElement.tagName)) {
            return NodeFilter.FILTER_REJECT
          }

          return NodeFilter.FILTER_ACCEPT
        },
      },
    )

    let node = nodeIterator.nextNode()
    while (node) {
      if (!(node instanceof Text)) {
        node = nodeIterator.nextNode()
        continue
      }

      const txt = node.data
      let index = txt.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase())

      while (index !== -1) {
        const range = new Range()
        range.setStart(node, index)
        range.setEnd(node, index + keyword.length)

        // @ts-expect-error TS 誤報
        highlightSet.add?.(range)
        index = txt.indexOf(keyword, index + keyword.length)
      }
      node = nodeIterator.nextNode()
    }
  }

  watchThrottled(() => ({
    keywordValue: toValue(keyword),
    waitFor: toValue(options.triggerOn),
  }), async ({ keywordValue }) => {
    highlight(keywordValue)
  }, {
    throttle: 100,
    leading: true,
    trailing: true,
  })

  useMutationObserver(targetEl, () => {
    highlight(toValue(keyword))
  }, {
    childList: true,
    characterData: true,
    subtree: true,
  })
}
