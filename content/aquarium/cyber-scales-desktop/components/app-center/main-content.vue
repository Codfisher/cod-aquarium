<template>
  <div class="p-4 flex flex-wrap items-start justify-start content-start gap-4 ">
    <base-tooltip
      v-for="item, i in list"
      :key="i"
      :text="item.tip"
    >
      <base-item
        v-bind="item"
        :delay="baseDelay + i * 100"
        class=" w-[7rem]"
      >
      </base-item>
    </base-tooltip>
  </div>
</template>

<script lang="ts" setup>
import { useAppStore } from '../../stores/app-store'
import BaseItem from '../base-item/base-item.vue'
import BaseTooltip from '../base-tooltip/base-tooltip.vue'

const appStore = useAppStore()
const baseDelay = 600

const list = [
  {
    label: '記事本',
    icon: 'docs',
    onClick() {
      appStore.open('note')
    },
  },
  {
    label: 'ChatLLM',
    icon: 'chat_apps_script',
    tip: [
      `基於 <a href="https://github.com/mlc-ai/web-llm" target="_blank">WebLLM</a>，`,
      `可以在網頁中運行 LLM`,
    ].join(''),
    onClick() {
      appStore.open('chat-llm')
    },
  },
]
</script>

<style scoped lang="sass">
</style>
