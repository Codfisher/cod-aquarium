<template>
  <div class="p-2 flex flex-col gap-1">
    <div
      v-if="isLoading"
      class=" p-2 text-center opacity-50 flex-1 flex flex-col justify-center items-center gap-2"
    >
      <div class="font-orbitron text-4xl mb-4">{{ progress }}%</div>
      <div>奮力初始化，請稍等... <span class="text-nowrap">─=≡Σ((( つ•̀ω•́)つ</span></div>
      <div>（第一次會比較久，畢竟人生地不熟 <span class="text-nowrap">(´・ω・`)</span> ）</div>
    </div>

    <div
      v-else-if="error"
      class=" p-2 text-center opacity-50 flex-1 flex flex-col justify-center items-center gap-2"
    >
      <div>出了一點意外，請重新整理後再試一次 (╥ω╥`)</div>
    </div>

    <div
      v-else
      ref="chatRef"
      class="chat flex flex-col flex-1 overflow-auto pb-10 gap-2"
    >
      <div
        v-for="item, i in messageList"
        v-decoding-text="{
          interval: 10,
          initChar: '　',
          count: 10,
          decodeInterval: 10,
          onFinish: scrollToBottom,
        }"
        :key="i"
        class="p-2 px-4 max-w-[60%] overflow-hidden text-ellipsis shrink-0"
        :class="item.role"
      >
        <div
          v-if="item.markdown"
          v-html="item.markdown"
        />

        <template v-else>
          {{ item.content }}
        </template>
      </div>

      <div
        v-if="isThinking"
        v-decoding-text="{
          interval: 10,
          initChar: '　',
          count: 10,
          decodeInterval: 10,
          onFinish: scrollToBottom,
        }"
        class="loading border p-2 max-w-[60%] bg-gray-200 opacity-40"
      >
        正在思考...
      </div>
    </div>

    <span class="font-orbitron  text-xs opacity-60">
      {{ progressReport.text }}
    </span>

    <div class=" flex gap-2 w-full">
      <base-input
        v-model="message"
        class=" w-full"
        @keydown.enter="sendMessage"
      />

      <base-btn
        label="發送"
        :disabled="sendBtnDisabled"
        @click="sendMessage"
      />

      <!-- <base-btn
        label="設定"
        @click="openSetting"
      /> -->
    </div>


    <teleport to="body">
      <base-dialog
        v-model="settingDialogVisible"
        class="z-[9999]"
      >
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
import { ChatCompletionMessageParam, CreateMLCEngine, CreateWebWorkerMLCEngine, InitProgressReport, prebuiltAppConfig } from '@mlc-ai/web-llm'
import { useAsyncState } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, shallowRef, triggerRef, useTemplateRef, watch } from 'vue'
import BaseBtn from '../base-btn/base-btn.vue'
import BaseDialog from '../base-dialog/base-dialog.vue'
import BaseInput from '../base-input/base-input.vue'
import { vDecodingText } from '../../../../../directives/v-decoding-text'
import { nextFrame } from '../../../../../common/utils'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  linkify: true,
  breaks: true
})

const modelList = prebuiltAppConfig.model_list.map(({ model_id }) => model_id)
// console.log('🚀 ~ modelList:', modelList);

const defaultModel = 'Llama-3.2-1B-Instruct-q0f16-MLC'

const message = ref('')
const chatDataList = shallowRef<ChatCompletionMessageParam[]>([{
  role: 'system',
  content: '你是鱈魚小助手'
}])

const messageList = computed(() => chatDataList.value
  .filter(({ role }) => role !== 'system')
  .map((data) => {
    const markdown = typeof data.content === 'string' ? md.render(data.content) : undefined

    return {
      ...data,
      markdown,
    }
  })
)

const isThinking = ref(false)
async function sendMessage() {
  if (sendBtnDisabled.value || !engine.value || isThinking.value) {
    return
  }

  chatDataList.value.push({
    role: 'user',
    content: message.value,
  })
  message.value = ''
  triggerRef(chatDataList)

  isThinking.value = true
  const reply = await engine.value.chat.completions.create({
    messages: chatDataList.value,
  });
  isThinking.value = false

  if (reply.choices[0]) {
    chatDataList.value.push(reply.choices[0].message)
  }
  triggerRef(chatDataList)
}

const progressReport = ref<InitProgressReport>({
  progress: 0,
  text: '',
  timeElapsed: 0,
})
const progress = computed(() => Math.round(progressReport.value.progress * 100))

const {
  isLoading,
  error,
  state: engine,
} = useAsyncState(async () => {
  const engine = await CreateWebWorkerMLCEngine(
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    defaultModel,
    {
      initProgressCallback(value) {
        progressReport.value = value
      }
    }
  );

  return engine
}, undefined)
onBeforeUnmount(() => {
  engine.value?.unload()
})

const sendBtnDisabled = computed(
  () => isLoading.value || message.value === ''
)

const chatRef = useTemplateRef('chatRef')

async function scrollToBottom() {
  await nextFrame()
  chatRef.value?.scrollTo({
    top: chatRef.value.scrollHeight,
    behavior: 'smooth',
  })
}


const settingDialogVisible = ref(false)
function openSetting() {
  settingDialogVisible.value = true
}
</script>

<style scoped lang="sass">
.chat
  .user
    align-self: flex-end
    background: #EEE
  .assistant, .loading
    background: #2DD4BF
</style>
