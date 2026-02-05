<template>
  <u-modal title="Welcome to CodStack!">
    <slot />

    <template #content>
      <u-tabs
        :items="tabItems"
        :ui="{
          content: 'p-4 space-y-4 h-[65vh] overflow-auto',
        }"
      >
        <template #intro>
          <p
            v-for="(text, index) in t('intro')"
            :key="index"
            v-html="text"
          />
        </template>

        <template #quick-start>
          <p
            v-for="(text, index) in t('start')"
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
  // {
  //   label: 'Quick Start',
  //   icon: 'i-line-md:compass-loop',
  //   slot: 'quick-start',
  // },
] satisfies TabsItem[])

const { locale, t } = useSimpleI18n({
  'zh-hant': {
    intro: [
      '<div class="font-bold text-2xl mb-6">歡迎來到 CodStack！⁑｡٩(ˊᗜˋ*)و✧⁕</div>',
      '自<a href="https://youtu.be/PPWyUhT6gRk?si=XVD7uTdHl3Mr9kFU" target="_blank">派對動物</a>之後，我一直想繼續做其他有趣的 3D 專案，但 3D 建模實在是太難了，程式還沒開始寫，搞建模就搞到熱情冷卻了。゜・(PД`q｡)・゜',
      '直到某天發現原來有現成的模型套組，感謝 <a href="https://kenney.nl/assets" target="_blank">Kenny</a>、<a href="https://kaylousberg.itch.io" target="_blank">Kay</a> 這些佛心大神們提供免費的 3D 模型。，否則我自己畫，等到真的做出來，應該是 10 年後了。( ´•̥̥̥ ω •̥̥̥` )',
      '<span></span>',
      '不過使用這些 3D Kit 時有些小困擾，沒辦法快速預覽內容就算了，用程式碼組裝實在是極度痛苦。(›´ω`‹ )',
      '先在 3D 軟體中組裝，又會失去在程式中控制的彈性，<span class="font-bold">於是 CodStack 誕生了！(/≧▽≦)/</span>',
      '<span></span>',
      'CodStack 使用 <a href="https://www.babylonjs.com/" target="_blank">babylon.js</a>、<a href="https://vuejs.org/" target="_blank">Vue</a> 與 <a href="https://ui.nuxt.com/" target="_blank">Nuxt UI</a> 開發，目標是讓組裝 3D 模型變得像拼積木一樣簡單，可輸出結構資料並再次匯入編輯，免安裝，趕快來試試看吧。',
      '有任何問題或功能許願，歡迎隨時連絡我。( ´ ▽ ` )ﾉ',
      '<span></span>',
      '如果此工具對您有幫助，也可以<a href="https://portaly.cc/codfish/support" target="_blank">請我喝一杯咖啡</a>，鼓勵我喔！(*´∀`)~♥',
      '有空的話也可以來我的<a href="https://codlin.me/" >部落格</a>逛逛，裡面還有很多酷東西喔！(・∀・)９',
    ],
    start: [
      '1. 點擊左上角資料夾圖示，選擇一個資料夾。',
      '2. 選擇後，CodStack 會自動掃描資料夾中的模型檔案。',
      '3. 點擊模型預覽圖，可以在右側預覽模型。',
    ],
  },
  'en': {
    intro: [
      'Welcome to CodStack! ✧⁑｡٩(ˊᗜˋ*)و✧⁕｡',
      'Thanks to <a href="https://kenney.nl/assets" target="_blank">Kenny</a> and <a href="https://kaylousberg.itch.io" target="_blank">Kay</a> for providing free 3D models.',
      'Otherwise, if I drew them myself, it would probably take 10 years to finish (╥ω╥ )',
    ],
    start: [
      '1. Click the folder icon in the top-left corner to select a folder.',
      '2. After selection, CodStack will automatically scan the folder for model files.',
      '3. Click on the model preview image to preview the model on the right.',
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
