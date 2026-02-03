<template>
  <u-modal
    title="匯入場景"
    :ui="{ width: 'sm:max-w-2xl' }"
  >
    <slot />

    <template #body>
      <div class="space-y-4">
        <u-form-field :error="errorMessage">
          <u-textarea
            ref="textareaRef"
            v-model="inputContent"
            autoresize
            :rows="10"
            class="w-full font-mono text-xs"
            placeholder="{ version: 'x.y.z', partList: ... }"
            @input="clearErrorMessage()"
          />
        </u-form-field>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <u-button
          color="gray"
          variant="ghost"
          label="Cancel"
          @click="emit('close')"
        />

        <u-button
          label="Confirm Import"
          color="primary"
          :loading="isLoading"
          @click="handleImport"
        />
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { ref, nextTick, useTemplateRef } from 'vue'
import { z } from 'zod'
import { useMainStore } from '../stores/main-store'
import { SceneData, sceneDataSchema } from '../type';

const emit = defineEmits<{
  data: [data: SceneData],
  close: [],
}>()

const mainStore = useMainStore()
const toast = useToast()

const inputContent = ref('')
const isLoading = ref(false)
const errorMessage = ref<string>()
function clearErrorMessage() {
  errorMessage.value = undefined
}

const textareaRef = useTemplateRef('textareaRef')

// --- 2. 輔助函式：將 Zod Path 轉換為字串 Index ---
/**
 * 簡易定位器：根據 Zod 的路徑 (['scenes', 0, 'id']) 在字串中尋找大概位置
 * 注意：這是一個 heuristic (啟發式) 搜尋，對於複雜的 JS Object 不一定 100% 準確，
 * 但對於標示錯誤位置通常足夠。
 */
function locatePathInString(jsonString: string, path: (string | number)[]) {
  let currentIndex = 0;
  let targetIndex = 0;
  let targetLength = 0;

  // 逐層搜尋
  for (const segment of path) {
    const key = String(segment);
    // 尋找 Key (允許 key 有引號或沒引號)
    // 這裡的正則表達式尋找：key 接著冒號，或者如果是陣列索引則略過
    if (typeof segment === 'number') {
      // 如果是陣列索引，比較難精確定位，我們嘗試尋找 `{` 或 `[` 的區塊
      // 簡單實作：暫時跳過索引定位，直接找下一個 Key，或者停留在當前陣列開頭
      // 若需要精確定位陣列第 N 個元素，需要寫完整的 Parser，這裡做簡易處理
      continue;
    }

    // 搜尋 Key，例如 "scenes": 或 scenes:
    // Regex 解釋: 
    // (?:"${key}"|'${key}'|${key}) -> 匹配 "key", 'key' 或 key
    // \s*: -> 後面接冒號
    const regex = new RegExp(`(?:"${key}"|'${key}'|${key})\\s*:`, 'g');

    // 從上次找到的地方往後找
    regex.lastIndex = currentIndex;
    const match = regex.exec(jsonString);

    if (match) {
      currentIndex = match.index;
      targetIndex = match.index;
      targetLength = match[0].length - 1; // 減去冒號

      // 移動 currentIndex 到冒號之後，準備找下一層
      currentIndex += match[0].length;
    } else {
      // 找不到就停在上一層
      break;
    }
  }

  return { start: targetIndex, end: targetIndex + targetLength };
}

// --- 3. 處理匯入與錯誤反白 ---
function parseConfigInput(str: string): any {
  const trimmed = str.trim();
  if (!trimmed) throw new Error('Content cannot be empty');
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    try {
      return new Function(`"use strict"; return (${trimmed})`)();
    } catch (e2) {
      throw new Error('Syntax Error: Unable to parse object, please check parentheses or commas');
    }
  }
}

async function handleImport() {
  isLoading.value = true;
  errorMessage.value = undefined;

  try {
    const rawData = parseConfigInput(inputContent.value);
    const result = sceneDataSchema.safeParse(rawData);

    if (!result.success) {
      // 取出第一個錯誤
      const firstIssue = result.error.issues[0];
      if (!firstIssue) return;
      const pathString = firstIssue.path.join('.');

      // 設定錯誤訊息
      errorMessage.value = `Format Error (${pathString}): ${firstIssue.message}`;

      throw new Error('Data validation failed');
    }

    toast.add({ title: 'Import Success', color: 'primary' });
    emit('data', result.data);

  } catch (error: any) {
    if (error instanceof Error) {
      errorMessage.value = error.message;
    } else {
      errorMessage.value = 'Unknown error';
    }
  } finally {
    isLoading.value = false;
  }
}
</script>