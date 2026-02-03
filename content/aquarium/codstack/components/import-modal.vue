<template>
  <u-modal
    title="Import Scene"
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
import type { SceneData } from '../type'
import { pipe } from 'remeda'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { z } from 'zod'
import { useMainStore } from '../stores/main-store'
import { sceneDataSchema } from '../type'

const emit = defineEmits<{
  data: [data: SceneData];
  close: [];
}>()

const mainStore = useMainStore()
const toast = useToast()

const rootFolder = computed(() => mainStore.rootFsHandle)

const inputContent = ref('')
const isLoading = ref(false)
const errorMessage = ref<string>()
function clearErrorMessage() {
  errorMessage.value = undefined
}

const textareaRef = useTemplateRef('textareaRef')

function parseConfigInput(str: string): any {
  const trimmed = str.trim()
  if (!trimmed)
    throw new Error('Content cannot be empty')
  try {
    return JSON.parse(trimmed)
  }
  catch {
    try {
      // eslint-disable-next-line no-new-func
      return new Function(`"use strict"; return (${trimmed})`)()
    }
    catch {
      throw new Error('Syntax Error: Unable to parse object, please check parentheses or commas')
    }
  }
}

async function handleImport() {
  const rootFolderName = rootFolder.value?.name
  if (!rootFolderName) {
    toast.add({ title: 'Please select a folder', color: 'warning' })
    return
  }

  isLoading.value = true
  errorMessage.value = undefined

  try {
    const rawData = parseConfigInput(inputContent.value)
    const result = sceneDataSchema.safeParse(rawData)

    if (!result.success) {
      // 只顯示第一個錯誤
      const firstIssue = result.error.issues[0]
      if (!firstIssue)
        return
      const pathString = firstIssue.path.join('.')

      errorMessage.value = `Format Error (${pathString}): ${firstIssue.message}`

      throw new Error('Data validation failed')
    }

    const { data } = result
    const rootErrorMessage = pipe('', () => {
      for (const part of data.partList) {
        if (!part.path.includes(rootFolderName)) {
          return `Path Error: ${part.path} does not include ${rootFolderName}`
        }
      }
    })
    if (rootErrorMessage) {
      errorMessage.value = rootErrorMessage
      return
    }

    // 移除根目錄名稱
    const resultData = {
      ...data,
      partList: data.partList.map((part) => ({
        ...part,
        path: part.path.replace(rootFolderName, ''),
      })),
    }

    emit('data', resultData)
    toast.add({ title: 'Import Success', color: 'primary' })
  }
  catch (error: any) {
    if (error instanceof Error) {
      errorMessage.value = error.message
    }
    else {
      errorMessage.value = 'Unknown error'
    }
  }
  finally {
    isLoading.value = false
  }
}
</script>
