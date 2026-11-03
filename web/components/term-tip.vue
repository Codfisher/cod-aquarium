<template>
  <span
    ref="triggerRef"
    class="term-tip"
    role="button"
    tabindex="0"
    :aria-expanded="tipVisible"
    :aria-describedby="tipVisible ? tipId : undefined"
    @click="togglePin"
    @keydown.enter.prevent="togglePin"
    @keydown.space.prevent="togglePin"
  >
    <slot />

    <!-- 傳送到 body：表格、程式碼區塊的 overflow 才不會裁掉說明框，也不會讓 <p> 裡出現 <div> -->
    <teleport to="body">
      <transition name="term-tip-fade">
        <div
          v-if="tipVisible"
          :id="tipId"
          ref="floatingRef"
          class="term-tip-panel"
          role="tooltip"
          :style="floatingStyles"
        >
          <slot name="tip">
            {{ props.tip }}
          </slot>
        </div>
      </transition>
    </teleport>
  </span>
</template>

<script setup lang="ts">
import type { Placement } from '@floating-ui/vue'
import { autoUpdate, flip, inline, offset, shift, useFloating } from '@floating-ui/vue'
import { onClickOutside, onKeyStroke, useElementHover, useFocus } from '@vueuse/core'
import { computed, ref, toRef, useId, useTemplateRef, watch } from 'vue'

/**
 * 文章內嵌的術語提示：滑鼠移上去、點擊、鍵盤聚焦時，顯示補充說明。
 *
 * ```md
 * <TermTip tip="性質測試組第 2 位">P2</TermTip>
 * ```
 *
 * 說明只有純文字時用 `tip` 屬性；需要連結、程式碼等內容時改用 `tip` slot。
 * 屬性值用雙引號包起來，所以說明文字裡不要再放雙引號，改用「」。
 */
interface Props {
  /** 純文字說明 */
  tip?: string;
  placement?: Placement;
}

interface Slots {
  /** 被標示的文字 */
  default?: () => unknown;
  /** 說明內容，優先於 tip 屬性 */
  tip?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  tip: '',
  placement: 'top',
})
defineSlots<Slots>()

const tipId = useId()

const triggerRef = useTemplateRef('triggerRef')
const floatingRef = useTemplateRef('floatingRef')

/**
 * 說明框本身也要算進 hover，讀者才能把滑鼠移進去選取文字、點擊連結。
 * triggerOnRemoval：說明框被移除時補一次 leave，避免 hover 狀態卡在 true。
 */
const isTriggerHovered = useElementHover(triggerRef, { delayEnter: 100, delayLeave: 160 })
const isPanelHovered = useElementHover(floatingRef, { delayLeave: 160, triggerOnRemoval: true })

/** 只在鍵盤操作的聚焦（:focus-visible）時顯示，滑鼠點擊造成的聚焦交給 isPinned 處理 */
const { focused: isKeyboardFocused } = useFocus(triggerRef, { focusVisible: true })

/** 點擊後固定顯示，滑鼠移開也不會消失 */
const isPinned = ref(false)

/** 按 Esc 或再次點擊後暫時隱藏，直到滑鼠與焦點都離開才恢復 */
const isDismissed = ref(false)

const tipVisible = computed(() => !isDismissed.value
  && (isPinned.value || isTriggerHovered.value || isPanelHovered.value || isKeyboardFocused.value))

function togglePin() {
  if (isPinned.value) {
    isPinned.value = false
    isDismissed.value = true
    return
  }

  isPinned.value = true
  isDismissed.value = false
}

function dismissTip() {
  if (!tipVisible.value)
    return

  isPinned.value = false
  isDismissed.value = true
}

watch([isTriggerHovered, isPanelHovered, isKeyboardFocused], ([triggerHovered, panelHovered, keyboardFocused]) => {
  if (!triggerHovered && !panelHovered && !keyboardFocused)
    isDismissed.value = false
})

onClickOutside(triggerRef, () => {
  isPinned.value = false
}, { ignore: [floatingRef] })

onKeyStroke('Escape', dismissTip)

const { floatingStyles } = useFloating(triggerRef, floatingRef, {
  placement: toRef(props, 'placement'),
  // inline 要排在最前面：被標示的文字跨行折斷時，才會對齊文字本身而不是整個外框
  middleware: [inline(), offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
})
</script>

<style scoped>
.term-tip {
  border-bottom: 1px dotted var(--vp-c-text-3);
  border-radius: 2px;
  cursor: help;
  transition: border-color 0.2s;
}

.term-tip:hover {
  border-bottom-color: var(--vp-c-brand-1);
}

.term-tip:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.term-tip-panel {
  z-index: 100;
  width: max-content;
  max-width: min(20rem, calc(100vw - 1rem));
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-3);
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  font-weight: normal;
  line-height: 1.6;
  text-align: left;
}

.term-tip-fade-enter-active,
.term-tip-fade-leave-active {
  transition: opacity 0.12s;
}

.term-tip-fade-enter-from,
.term-tip-fade-leave-to {
  opacity: 0;
}
</style>
