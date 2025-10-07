<template>
  <div class="p-2 flex flex-col gap-4 ">
    <textarea
      v-model="currentText"
      class="w-full flex-1 p-2 border rounded resize-none"
      placeholder="這裡輸入你的筆記…"
    />

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
import { downloadAsFile } from '../../utils'
import BaseBtn from '../base-btn/base-btn.vue'

const fileHandle = ref<FileSystemFileHandle>()

const text = ref('')
const currentText = ref('')

const isChanged = computed(() => text.value !== currentText.value)

/** 是否支援 File System Access API */
const supportsFSAccess = typeof window !== 'undefined'
  && 'showOpenFilePicker' in window
  && 'showSaveFilePicker' in window

/** 開啟檔案：支援就用選檔器；不支援就用 <input type="file"> */
async function openFile() {
  if (!supportsFSAccess) {
    // TODO 再調整
    // eslint-disable-next-line no-alert
    alert('此瀏覽器不支援 File System Access API，請使用 Chrome 或 Edge。')
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

/** 有檔案則覆蓋檔案，否則下載 */
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
    return
  }

  downloadAsFile(currentText.value, 'note.txt', { type: 'text/plain' })
  text.value = currentText.value
}

/** 確認讀寫權限 */
async function ensureReadWrite(handle: FileSystemHandle) {
  const queryResult = await handle.queryPermission({ mode: 'readwrite' })
  if (queryResult === 'granted')
    return true

  const reqResult = await handle.requestPermission({ mode: 'readwrite' })
  return reqResult === 'granted'
}
</script>

<style scoped lang="sass">
</style>
