<template>
  <input
    :value="currentString"
    type="text"
    @compositionstart="handleCompositionStart"
    @compositionend="handleCompositionEnd"
    @beforeinput="handleBeforeInput"
    @input="handleInput"
  >
</template>

<script setup lang="ts">
import { useActiveElement } from '@vueuse/core'
import { pipe, prop } from 'remeda'
import { computed, nextTick, shallowRef, triggerRef, watch } from 'vue'
import { useChar } from './use-char'

// #region Props
interface Props {
  modelValue?: string;

  /** 解碼效果的字元集
   *
   * 可以根據 char 來決定字元集，依矩陣順序判斷
   *
   * @default 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
   */
  charset?: string | Array<(char: string) => string | undefined>;

  /** 字符變化間隔毫秒數
   *
   * @default 20
   */
  decodeInterval?: number;

  /** 解碼次數
   *
   * @default 10
   */
  decodeTimes?: number;

  /** 每個字符的延遲毫秒數
   *
   * @default 20
   */
  perCharDecodeDelay?: number;

  /** 最大延遲毫秒數
   *
   * @default 1000
   */
  maxDecodeDelay?: number;
}
// #endregion Props

// #region Emits
interface Emits {
  'update:modelValue': [value: Props['modelValue']];
}
// #endregion Emits

// #region Slots
interface Slots {
  default?: () => unknown;
}
// #endregion Slots

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  decodeInterval: 20,
  decodeTimes: 10,
  perCharDecodeDelay: 20,
  maxDecodeDelay: 1000,
})

const emit = defineEmits<Emits>()

defineSlots<Slots>()

const activeEl = useActiveElement()

function getCharDataList(
  data: string,
  autoStart = true,
) {
  return data
    /** 確保 emoji 不會被拆分 */
    .split(/.*?/u)
    .map((char, i) => {
      const charset = pipe(undefined, () => {
        if (typeof props.charset === 'string') {
          return props.charset
        }

        for (const getCharset of props.charset) {
          const result = getCharset(char)
          if (result) {
            return result
          }
        }

        return ''
      })

      const result = useChar(char, charset, {
        interval: props.decodeInterval,
        count: props.decodeTimes,
      })
      if (autoStart) {
        result.start(Math.min(i * props.perCharDecodeDelay, props.maxDecodeDelay))
      }

      return result
    })
}

const charList = shallowRef(getCharDataList(props.modelValue))

/** 處理中文拼字問題 */
let isComposing = false
let isFirstComposed = false

/** 紀錄 caret 位置 */
let caretStart = 0
let caretEnd = 0

/** 在 onInput 中取得之 selectionStart、selectionEnd 永遠相同
 *
 * 刪除、反白後編輯，這類可能與 selectionRange 相關的事件必須在 onBeforeInput 中處理
 *
 * 反白後編輯（有 selectionRange 的 insertText）則預先刪除反白部分
 */
async function handleBeforeInput(event: Event) {
  // console.log(`🚀 ~ [handleBeforeInput] event:`, event)
  // console.log(`🚀 ~ [handleBeforeInput] charList:`, charList)
  if (!(event instanceof InputEvent)) {
    return
  }

  const targetEl = event.target
  if (!(targetEl instanceof HTMLInputElement)) {
    return
  }

  caretStart = targetEl.selectionStart ?? targetEl.value.length
  caretEnd = targetEl.selectionEnd ?? targetEl.value.length
  const selectedTextLength = caretEnd - caretStart

  // console.log(`🚀 ~ [handleBeforeInput] caretStart:`, caretStart)
  // console.log(`🚀 ~ [handleBeforeInput] caretEnd:`, caretEnd)
  // console.log(`🚀 ~ [handleBeforeInput] isComposing:`, isComposing)
  // console.log(`🚀 ~ [handleBeforeInput] isFirstComposed:`, isFirstComposed)

  /** 反白後編輯，僅刪除內容，插入文字同 insertText，所以統一交給 onInput 處理 */
  if (selectedTextLength > 0 && event.inputType === 'insertText') {
    // FIX: 若文字內有 emoji，這種刪除方式會刪錯位置，暫時找不到解法
    charList.value.splice(caretStart, selectedTextLength)
  }

  // insertFromPaste 需要在 onBeforeInput 處理，onInput 的 selectionStart 位置錯誤
  if (event.inputType === 'insertFromPaste') {
    charList.value.splice(caretStart, selectedTextLength)

    const charDataList = getCharDataList(event.data ?? '')
    charList.value.splice(caretStart, 0, ...charDataList)
  }
}
async function handleInput(event: Event) {
  // console.log(`🚀 ~ [handleInput] event:`, event)
  // console.log(`🚀 ~ [handleInput] charList:`, charList)

  /** CompositionEvent 用於中文輸入 */
  if (!(event instanceof InputEvent) && !(event instanceof CompositionEvent)) {
    return
  }

  const targetEl = event.target
  if (isComposing || !(targetEl instanceof HTMLInputElement)) {
    return
  }

  if (caretStart !== caretEnd && isFirstComposed) {
    // 表示有拼音選字，須根據 onBeforeInput 的 selectionStart 位置偏移後插入
    caretStart += 1
  }
  else {
    caretStart = targetEl.selectionStart ?? targetEl.value.length
  }
  caretEnd = targetEl.selectionEnd ?? targetEl.value.length

  // console.log(`🚀 ~ [handleInput] caretStart:`, caretStart)
  // console.log(`🚀 ~ [handleInput] caretEnd:`, caretEnd)
  // console.log(`🚀 ~ [handleInput] isComposing:`, isComposing)
  // console.log(`🚀 ~ [handleInput] isFirstComposed:`, isFirstComposed)

  const charDataList = getCharDataList(event.data ?? '')

  if (
    ('inputType' in event && event.inputType === 'insertText')
    || event.type === 'compositionend'
  ) {
    charList.value.splice(caretStart - 1, 0, ...charDataList)
  }

  if ('inputType' in event && event.inputType === 'insertFromDrop') {
    charList.value.splice(caretStart, 0, ...charDataList)
  }

  /** 全部停止並重建，避免 emoji 導致誤判 caret 位置，而刪錯字元 */
  if ('inputType' in event && event.inputType.includes('delete')) {
    let anyPlaying = false
    charList.value.forEach(({ stop, isPlaying }) => {
      if (isPlaying.value) {
        anyPlaying = true
      }

      stop()
    })

    await nextTick()

    const inputValue = pipe(
      targetEl.value,
      (value) => {
        /** 刪除最後一個字元 */
        if (anyPlaying && event.inputType.includes('Backward')) {
          /** 考慮到 emoji，不能直接用 string.slice(0, -1) */
          return [...value].slice(0, -1).join('')
        }
        return value
      },
    )

    charList.value = getCharDataList(inputValue, false)
  }

  /** 必須等到 onInput 完成後才能觸發 charList 變更響應
   *
   * 如果在 onBeforeInput 觸發，會導致刪除字元（deleteContentBackward）時， input value 多刪除一個字元
   *
   * 原因如下：
   *
   * 1. 假設字串為 123
   *
   * 2. 刪除 3，onBeforeInput 先觸發，讓 charList 變為 12
   *
   * 3. 這個時候 input value 還沒實際刪除 3，但是 charList 已經變為 12，所以 input value 變為 12
   *
   * 4. 接著 input value 觸發刪除，但是 3 已經沒了，導致 2 被刪掉，最終只剩下 1
   *
   * 5. 結果就是從 123 變成 1，而不是預期的 12
   */
  triggerRef(charList)
}

/** 處理中文拼字問題
 *
 * 等到拼字結束後才觸發 input 事件
 */
function handleCompositionStart() {
  // console.log(`🚀 ~ [handleCompositionStart]:`)
  isComposing = true
}
function handleCompositionEnd(event: Event) {
  // console.log(`🚀 ~ [handleCompositionEnd]:`)
  isComposing = false
  isFirstComposed = true
  handleInput(event)
  isFirstComposed = false
}

const currentString = computed(() => pipe(
  charList.value,
  (chars) => chars.map(({ char }) => char.value).join(''),
))

/** value 變化會讓 caret 跳至最後，所以要不斷復歸位置
 *
 * DOM 更新後觸發 setSelectionRange 才有用，所以 flush 設為 post
 */
watch(currentString, async () => {
  if (!(activeEl.value instanceof HTMLInputElement)) {
    return
  }

  const position = Math.max(caretEnd, caretStart)
  activeEl.value.setSelectionRange(position, position)
}, { flush: 'post' })

watch(charList, (list) => {
  const value = list.map(prop('original')).join('')
  emit('update:modelValue', value)
})
</script>

<style scoped lang="sass">
</style>
