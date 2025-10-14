<template>
  <div class="p-4 flex flex-col gap-4">
    <div class="flex flex-col overflow-auto flex-1">
      {{ progressReport }}
    </div>

    <div class=" flex gap-2 w-full">
      <div class="border flex-1">
        <input
          v-model="message"
          class=" p-2"
        >
      </div>

      <base-btn
        label="發送"
        :disabled="message === ''"
      />

      <base-btn
        label="設定"
        @click="openSetting"
      />
    </div>


    <teleport to="body">
      <base-dialog v-model="settingDialogVisible" class="z-[999999]">
        設定視窗

        <base-btn
          label="確定"
          @click="settingDialogVisible = false"
        />
      </base-dialog>
    </teleport>
  </div>
</template>

<script lang="ts" setup>
import { CreateMLCEngine, InitProgressReport, prebuiltAppConfig } from '@mlc-ai/web-llm'
import { useAsyncState } from '@vueuse/core'
import { ref } from 'vue'
import BaseBtn from '../base-btn/base-btn.vue'
import BaseDialog from '../base-dialog/base-dialog.vue'

const modelList = prebuiltAppConfig.model_list.map(({ model_id }) => model_id)

const defaultModel = 'Llama-3.2-1B-Instruct-q4f32_1-MLC'

const message = ref('')

const progressReport = ref<InitProgressReport>({
  progress: 0,
  text: '',
  timeElapsed: 0,
})
const { isLoading, state: engine } = useAsyncState(async () => {
  const engine = await CreateMLCEngine(defaultModel, {
    initProgressCallback: (progress) => {
      progressReport.value = progress
    },
  })

  return engine
}, undefined, {
  immediate: false,
})

const settingDialogVisible = ref(false)
function openSetting() {
  settingDialogVisible.value = true
}
</script>

<style scoped lang="sass">
</style>
