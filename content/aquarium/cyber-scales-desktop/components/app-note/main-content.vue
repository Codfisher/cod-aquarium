<template>
  <div class="p-2 flex flex-col gap-4 ">
    <textarea
      v-model="currentText"
      class="w-full flex-1 p-2 border rounded resize-none"
      placeholder="這裡輸入你的筆記…"
    />

    <!-- 不支援 File System Access API 時用的 fallback -->
    <input
      ref="fileInput"
      type="file"
      accept=".txt,.md,text/plain"
      class="hidden"
      @change="onFileInputChange"
    >

    <div class="flex justify-end gap-2">
      <base-btn
        label="開啟"
        class="flex-1"
        @click="openFile"
      />
      <base-btn
        label="儲存"
        :disabled="!isChanged"
        class="flex-1"
        @click="save"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import BaseBtn from '../base-btn/base-btn.vue'

// 目前開啟的檔案 handle；只有用 showOpenFilePicker 開啟才會有值
const fileHandle = ref<FileSystemFileHandle | null>(null)

// 內容狀態
const text = ref('')
const currentText = ref('')

const isChanged = computed(() => text.value !== currentText.value)

// fallback 用的 input
const fileInput = ref<HTMLInputElement | null>(null)

// 是否支援 File System Access API
const supportsFSAccess
  = typeof window !== 'undefined'
    && 'showOpenFilePicker' in window
    && 'showSaveFilePicker' in window

/** 開啟檔案：支援就用選檔器；不支援就用 <input type="file"> */
async function openFile() {
  if (!supportsFSAccess) {
    fileInput.value?.click()
    return
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: '純文字檔',
          accept: { 'text/plain': ['.txt', '.md', '.log'] },
        },
      ],
      excludeAcceptAllOption: false,
    })
    fileHandle.value = handle
    const file = await handle.getFile()
    const content = await file.text()
    text.value = content
    currentText.value = content
  }
  catch (err: any) {
    if (err?.name !== 'AbortError')
      console.error(err)
  }
}

// fallback: 用 <input type="file"> 讀檔
function onFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  fileHandle.value = null // 不是透過選檔器的 handle，無法覆寫來源檔
  file.text().then((content) => {
    text.value = content
    currentText.value = content
  })
  input.value = '' // 允許下次選同一檔
}

/** 儲存：
 * - 有 fileHandle（用選檔器開啟）且權限 OK → 覆蓋原檔
 * - 其他情況 → 直接觸發下載（notes.txt）
 */
async function save() {
  if (!isChanged.value)
    return

  if (supportsFSAccess && fileHandle.value) {
    const granted = await ensureReadWrite(fileHandle.value)
    if (granted) {
      const writable = await fileHandle.value.createWritable()
      await writable.write(currentText.value)
      await writable.close()
      text.value = currentText.value
      return
    }
  }

  // 覆蓋不成或根本沒開檔 → 下載新檔
  downloadAsFile(currentText.value, 'notes.txt')
  text.value = currentText.value
}

// 詢問/確認讀寫權限
async function ensureReadWrite(handle: FileSystemHandle) {
  // 部分 TS 環境沒有型別，先容錯
  const q = await handle.queryPermission?.({ mode: 'readwrite' })
  if (q === 'granted')
    return true
  const r = await handle.requestPermission?.({ mode: 'readwrite' })
  return r === 'granted'
}

// 下載文字成檔案
function downloadAsFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped lang="sass">
</style>
