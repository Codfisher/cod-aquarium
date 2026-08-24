<template>
  <ins
    ref="insRef"
    class="adsbygoogle block w-full"
    :style="insStyle"
    :data-ad-client="adClient"
    :data-ad-slot="adSlot"
    :data-ad-format="height ? undefined : format"
    :data-full-width-responsive="height ? undefined : fullWidthResponsive"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

interface Props {
  /** 發布商 ID，格式 ca-pub-XXXXXXXXXXXXXXXX */
  adClient: string;
  /** 廣告版位 ID */
  adSlot: string;
  /** 廣告格式 */
  format?: string;
  /** 是否啟用全寬度響應式 */
  fullWidthResponsive?: boolean;
  /** 最小高度（px），避免未填充時版面塌陷 */
  minHeight?: number;
  /** 固定高度（px）。設定後採固定高度模式：滿寬、固定高，
   * 且不帶 data-ad-format／data-full-width-responsive，
   * AdSense 不會沿祖先鏈清除高度限制，可控制版位高度不超框
   */
  height?: number;
  /** 等候投放結果的毫秒數，逾時仍空白就視為被擋掉 */
  statusTimeout?: number;
}
const props = withDefaults(defineProps<Props>(), {
  format: 'auto',
  fullWidthResponsive: true,
  minHeight: 100,
  height: undefined,
  statusTimeout: 10_000,
})

const emit = defineEmits<{
  /** 投放結果。unfilled 為 AdSense 沒庫存，blocked 為廣告腳本根本沒跑起來，
   * 兩者呼叫端通常要有不同反應
   */
  statusChange: [status: 'filled' | 'unfilled' | 'blocked'];
}>()

/** 固定高度模式給定高、滿寬；否則用 minHeight 佔位避免塌陷 */
const insStyle = computed(() =>
  props.height
    ? { display: 'block', width: '100%', height: `${props.height}px` }
    : { minHeight: `${props.minHeight}px` },
)

const insRef = useTemplateRef<HTMLElement>('insRef')

let statusObserver: MutationObserver | undefined
let statusTimeoutId: ReturnType<typeof setTimeout> | undefined
let statusResolved = false

function resolveStatus(status: 'filled' | 'unfilled' | 'blocked') {
  statusResolved = true
  statusObserver?.disconnect()
  statusObserver = undefined
  clearStatusTimeout()
  emit('statusChange', status)
}

function clearStatusTimeout() {
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId)
    statusTimeoutId = undefined
  }
}

/** AdSense 沒有事件可聽，投放結果只會寫在 ins 的 data-ad-status */
function readStatus() {
  const status = insRef.value?.getAttribute('data-ad-status')
  if (status === 'filled' || status === 'unfilled') {
    resolveStatus(status)
  }
}

onMounted(() => {
  const insElement = insRef.value

  // 等 DOM 掛載後再請求廣告，避免 loader 尚未就緒
  if (!insElement) {
    return
  }

  statusObserver = new MutationObserver(readStatus)
  statusObserver.observe(insElement, {
    attributes: true,
    attributeFilter: ['data-ad-status'],
  })

  /** 廣告腳本被擋掉時連 data-ad-status 都不會寫，只能靠 ins 是否真的長出東西判斷 */
  statusTimeoutId = setTimeout(() => {
    if (statusResolved || insElement.childElementCount > 0) {
      return
    }
    resolveStatus('blocked')
  }, props.statusTimeout)

  try {
    // adsbygoogle.js 延後注入，此處先推進佇列，腳本就緒後會自動消化
    (window.adsbygoogle ??= []).push({})
  }
  catch (error) {
    console.error('[google-adsense] 推送廣告失敗', error)
  }
})

onBeforeUnmount(() => {
  statusObserver?.disconnect()
  statusObserver = undefined
  clearStatusTimeout()
})
</script>
