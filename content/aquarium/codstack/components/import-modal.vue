<template>
  <u-modal
    title="匯入場景"
    :ui="{ width: 'sm:max-w-2xl' }"
  >
    <slot />

    <template #body>
      <div class="space-y-4">
        <u-form-group :error="errorMessage">
          <u-textarea
            ref="textareaRef"
            v-model="inputContent"
            autoresize
            :rows="10"
            class="w-full font-mono text-xs"
            placeholder="{ scenes: ... }"
            @input="errorMessage = ''"
          />
        </u-form-group>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <u-button
          color="gray"
          variant="ghost"
          @click="emit('close')"
        >取消</u-button>
        <u-button
          color="primary"
          :loading="isLoading"
          @click="handleImport"
        >確認匯入</u-button>
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { z } from 'zod'
import { useMainStore } from '../stores/main-store'

const props = withDefaults(defineProps<{}>(), {})
const emit = defineEmits(['close', 'import-success'])

const mainStore = useMainStore()
const toast = useToast()

const inputContent = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

// 取得 UTextarea 的參照，注意：Nuxt UI 的 textarea ref 結構可能包含 .textarea 或 .input
const textareaRef = ref<any>(null)

// --- 1. 定義 Zod Schema ---
// 這裡定義你的資料結構，讓 Zod 幫你抓錯
const SceneSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    meshes: z.array(z.any()).optional() // 根據需求詳細定義
  })),
  version: z.number().optional()
})

// --- 2. 輔助函式：將 Zod Path 轉換為字串 Index ---
/**
 * 簡易定位器：根據 Zod 的路徑 (['scenes', 0, 'id']) 在字串中尋找大概位置
 * 注意：這是一個 heuristic (啟發式) 搜尋，對於複雜的 JS Object 不一定 100% 準確，
 * 但對於標示錯誤位置通常足夠。
 */
const locatePathInString = (jsonString: string, path: (string | number)[]) => {
  let currentIndex = 0
  let targetIndex = 0
  let targetLength = 0

  // 逐層搜尋
  for (const segment of path) {
    const key = String(segment)
    // 尋找 Key (允許 key 有引號或沒引號)
    // 這裡的正則表達式尋找：key 接著冒號，或者如果是陣列索引則略過

    if (typeof segment === 'number') {
      // 如果是陣列索引，比較難精確定位，我們嘗試尋找 `{` 或 `[` 的區塊
      // 簡單實作：暫時跳過索引定位，直接找下一個 Key，或者停留在當前陣列開頭
      // 若需要精確定位陣列第 N 個元素，需要寫完整的 Parser，這裡做簡易處理
      continue
    }

    // 搜尋 Key，例如 "scenes": 或 scenes:
    // Regex 解釋: 
    // (?:"${key}"|'${key}'|${key}) -> 匹配 "key", 'key' 或 key
    // \s*: -> 後面接冒號
    const regex = new RegExp(`(?:"${key}"|'${key}'|${key})\\s*:`, 'g')

    // 從上次找到的地方往後找
    regex.lastIndex = currentIndex
    const match = regex.exec(jsonString)

    if (match) {
      currentIndex = match.index
      targetIndex = match.index
      targetLength = match[0].length - 1 // 減去冒號
      // 移動 currentIndex 到冒號之後，準備找下一層
      currentIndex += match[0].length
    } else {
      // 找不到就停在上一層
      break
    }
  }

  return { start: targetIndex, end: targetIndex + targetLength }
}

// --- 3. 處理匯入與錯誤反白 ---
const parseConfigInput = (str: string): any => {
  const trimmed = str.trim()
  if (!trimmed) throw new Error('內容不能為空')
  try {
    return JSON.parse(trimmed)
  } catch (e) {
    try {
      return new Function(`"use strict"; return (${trimmed})`)()
    } catch (e2) {
      throw new Error('語法錯誤：無法解析物件，請檢查括號或逗號')
    }
  }
}

const handleImport = async () => {
  isLoading.value = true
  errorMessage.value = ''

  try {
    // A. 解析字串
    const rawData = parseConfigInput(inputContent.value)

    // B. Zod 驗證
    const result = SceneSchema.safeParse(rawData)

    if (!result.success) {
      // 取出第一個錯誤
      const firstIssue = result.error.issues[0]
      if (!firstIssue) return
      const pathString = firstIssue.path.join('.')

      // 設定錯誤訊息
      errorMessage.value = `格式錯誤 (${pathString}): ${firstIssue.message}`

      // C. 反白錯誤位置
      highlightError(firstIssue.path)

      throw new Error('資料驗證失敗') // 中斷流程
    }

    // D. 通過驗證，執行匯入
    toast.add({ title: '匯入成功', color: 'green' })
    emit('import-success')
    emit('close')

  } catch (error: any) {
    if (!errorMessage.value) errorMessage.value = error.message
    // 震動效果或額外提示可加在這
  } finally {
    isLoading.value = false
  }
}

const highlightError = (path: (string | number)[]) => {
  const { start, end } = locatePathInString(inputContent.value, path)

  if (start === end) return // 沒找到位置就不動作

  nextTick(() => {
    // 取得原生 textarea DOM 元素
    // Nuxt UI 的 Textarea 元件通常將 ref 暴露在 .textarea 或 .input
    const textareaEl = textareaRef.value?.$el?.querySelector('textarea') || textareaRef.value?.textarea

    if (textareaEl) {
      textareaEl.focus()
      // 選取錯誤的 Key
      textareaEl.setSelectionRange(start, end)

      // 簡單的平滑捲動到大概位置 (計算行數)
      const valueBeforeError = inputContent.value.substring(0, start)
      const lineNum = valueBeforeError.split('\n').length
      const lineHeight = 20 // 假設行高，這只是估算
      textareaEl.scrollTop = (lineNum - 2) * lineHeight
    }
  })
}
</script>