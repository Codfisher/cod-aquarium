<template>
  <u-modal title="Welcome to CodStack!">
    <slot />

    <template #content>
      <u-tabs
        :items="tabItems"
        :ui="{
          content: 'p-4 space-y-4 h-[60vh] overflow-auto',
        }"
      >
        <template #intro>
          <p
            v-for="(text, index) in t('intro')"
            :key="index"
            v-html="text"
          />
        </template>
      </u-tabs>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui/.'
import { usePreferredLanguages } from '@vueuse/core'
import { computed, watch } from 'vue'
import { useSimpleI18n } from '../composables/use-simple-i18n'

interface Props {
  label?: string;
}
const props = withDefaults(defineProps<Props>(), {
  label: '',
})

const tabItems = computed(() => [
  {
    label: 'Intro',
    icon: 'i-line-md:emoji-grin',
    slot: 'intro',
  },
  {
    label: 'Quick Start',
    icon: 'i-line-md:compass-loop',
    slot: 'quick-start',
  },
] satisfies TabsItem[])

const { locale, t } = useSimpleI18n({
  'zh-hant': {
    intro: [
      '<div class="font-bold text-2xl mb-8">歡迎來到 CodStack！✧⁑｡٩(ˊᗜˋ*)و✧⁕｡</div>',
      '感謝 <a href="https://kenney.nl/assets" target="_blank">Kenny</a>、<a href="https://kaylousberg.itch.io" target="_blank">Kay</a> 這些佛心大神們提供免費的 3D 模型。',
      '否則我自己畫，等到真的做出來，應該是 10 年後了。(╥ω╥ )',
      '<span></span>',
      '不過使用這些 3D Kit 時有些小困擾，沒辦法快速預覽內容就算了，用程式碼組裝實在是極度痛苦。(›´ω`‹ )',
      '先在 3D 軟體中組裝，又會失去在程式中控制的彈性，<span class="font-bold">於是 CodStack 誕生了！(/≧▽≦)/</span>',
      '<span></span>',
      'CodStack 的目標是讓組裝 3D 模型變得像拼積木一樣簡單並輸出結構資料，免安裝，趕快來試試看吧。',
      '有任何問題或功能許願，歡迎隨時連絡我。( ´ ▽ ` )ﾉ',
      '有空的話也可以來我的<a href="https://codlin.me/" >部落格</a>逛逛，裡面還有很多酷東西喔！(・∀・)９',
      '<span></span>',
      '如果此工具對您有幫助，也可以<a href="https://portaly.cc/codfish/support" target="_blank">請我喝一杯咖啡</a>，鼓勵我喔！(*´∀`)~♥',
    ],
  },
  'en': {
    intro: [
      'Welcome to CodStack! ✧⁑｡٩(ˊᗜˋ*)و✧⁕｡',
      'Thanks to <a href="https://kenney.nl/assets" target="_blank">Kenny</a> and <a href="https://kaylousberg.itch.io" target="_blank">Kay</a> for providing free 3D models.',
      'Otherwise, if I drew them myself, it would probably take 10 years to finish (╥ω╥ )',
    ],
  },
} as const)

const languages = usePreferredLanguages()

watch(languages, ([lang]) => {
  locale.value = lang?.includes('zh') ? 'zh-hant' : 'en'
}, {
  immediate: true,
})
</script>

<style scoped lang="sass">
</style>
