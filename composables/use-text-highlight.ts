import type { MaybeElementRef } from '@vueuse/core'
import { promiseTimeout, tryOnBeforeUnmount, tryOnMounted, useMutationObserver, useStyleTag, watchThrottled } from '@vueuse/core'
import { computed, type MaybeRefOrGetter, nextTick, toValue, useId } from 'vue'

interface UseTextHighlightParams {
  /** 搜尋目標，會標記以下文字節點 */
  target?: MaybeElementRef;
  background?: MaybeRefOrGetter<string>;
  color?: MaybeRefOrGetter<string>;
  /** 指定資料更新後也會更新執行 */
  triggerOn?: MaybeRefOrGetter;
  /** 強制延遲指定時間後再執行
   *
   * 若 target DOM 更新無法自動偵測，可以使用此參數
   */
  delay?: number;
}
export function useTextHighlight(
  text: MaybeRefOrGetter<string>,
  params: UseTextHighlightParams = {},
) {
  const highlightName = `highlight-${Math.random().toString(36).slice(2)}`

  const targetEl = computed(() => {
    const target = toValue(params.target)
    if (!target) {
      return document.documentElement
    }

    if (target instanceof Element) {
      return target
    }

    return target.$el as HTMLElement
  })

  /** Highlight 是一個類 Set 物件
   *
   * [MDN Highlight](https://developer.mozilla.org/en-US/docs/Web/API/Highlight#instance_methods)
   */
  const highlightSet = new Highlight()

  function clear() {
    CSS.highlights.delete?.(highlightName)
    highlightSet.clear?.()
  }

  // 建立全域樣式
  const style = computed(() => {
    const background = toValue(params.background) ?? '#ffeb3b'
    const color = toValue(params.color) ?? 'inherit'

    return `::highlight(${highlightName}) {
      background: ${background};
      color: ${color};
    }`
  })
  useStyleTag(style)

  tryOnMounted(() => {
    CSS.highlights.set?.(highlightName, highlightSet)
  })
  tryOnBeforeUnmount(() => {
    clear()
  })

  async function highlight(text: string) {
    highlightSet.clear?.()

    if (!text) {
      return
    }

    // 確保 DOM 已更新
    await nextTick()
    await promiseTimeout(params.delay ?? 0)

    targetEl.value?.querySelectorAll('*').forEach((el) => {
      const nodeIterator = document.createNodeIterator(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parentElement = node.parentElement
          // 排除不該進去的區塊
          if (!parentElement || /^(?:SCRIPT|STYLE|NOSCRIPT|TEXTAREA|TITLE|IFRAME)$/.test(parentElement.tagName)) {
            return NodeFilter.FILTER_REJECT
          }

          return NodeFilter.FILTER_ACCEPT
        },
      })

      let node = nodeIterator.nextNode()
      while (node) {
        if (!(node instanceof Text)) {
          node = nodeIterator.nextNode()
          continue
        }

        const txt = node.data
        let index = txt.toLocaleLowerCase().indexOf(text.toLocaleLowerCase())

        while (index !== -1) {
          const range = new Range()
          range.setStart(node, index)
          range.setEnd(node, index + text.length)

          highlightSet.add?.(range)
          index = txt.indexOf(text, index + text.length)
        }
        node = nodeIterator.nextNode()
      }
    })
  }

  watchThrottled(() => ({
    textValue: toValue(text),
    waitFor: toValue(params.triggerOn),
  }), async ({ textValue }) => {
    highlight(textValue)
  }, {
    throttle: 100,
    leading: true,
    trailing: true,
  })

  useMutationObserver(targetEl, () => {
    highlight(toValue(text))
  }, {
    childList: true,
    characterData: true,
    subtree: true,
  })
}
