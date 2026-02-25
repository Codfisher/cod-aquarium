<template>
  <u-modal
    title="Welcome to CodStack!"
    :ui="{
      content: 'min-w-full md:min-w-160',
    }"
  >
    <slot />

    <template #content>
      <u-tabs
        v-model="currentTab"
        :items="tabItems"
        value-key="slot"
        :ui="{
          content: 'overflow-auto',
        }"
      >
        <template #intro>
          <div class="p-10 pt-4 space-y-5">
            <p
              v-for="(text, index) in t('intro')"
              :key="index"
              v-html="text"
            />
          </div>
        </template>

        <template #quick-start>
          <div class="p-10 pt-6">
            <u-carousel
              v-slot="{ item, index }"
              dots
              :items="quickStartItems"
              class="w-full h-full"
              :ui="{ item: 'flex flex-col' }"
            >
              <div class=" relative ">
                <div class="rounded-lg border overflow-hidden border-default">
                  <img
                    v-if="!item.img.includes('.mp4')"
                    :src="item.img"
                    class=" w-full h-full object-contain "
                  >

                  <video
                    v-else
                    :src="item.img"
                    autoplay
                    loop
                    muted
                  />
                </div>

                <div class="mt-2 relative z-10 pb-16">
                  <span
                    class="absolute bottom-0 right-0 text-[4rem] font-black opacity-10 select-none -z-10 font-mono leading-16"
                  >
                    0{{ index + 1 }}
                  </span>

                  <div
                    class="text-sm text-gray-600"
                    v-html="item.description"
                  />
                </div>
              </div>
            </u-carousel>
          </div>
        </template>
      </u-tabs>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui/.'
import { usePreferredLanguages } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useSimpleI18n } from '../composables/use-simple-i18n'

interface Props {
  label?: string;
}
const props = withDefaults(defineProps<Props>(), {
  label: '',
})

const currentTab = ref('intro')
const tabItems = computed(() => [
  {
    label: 'Intro',
    icon: 'i-ph:fish-simple-bold',
    slot: 'intro',
  },
  {
    label: 'Quick Start',
    icon: 'i-line-md:compass-loop',
    slot: 'quick-start',
  },
] satisfies TabsItem[])

const quickStartItems = computed(() => {
  const descriptionList = t('start')
  const imgList = t('startImg')

  return descriptionList.map((text, index) => ({
    img: imgList[index] || '',
    description: text,
  }))
})

const { locale, t } = useSimpleI18n({
  'zh-hant': {
    intro: [
      '<div class="font-bold text-2xl mb-6">歡迎來到 Hexazen！⁑｡٩(ˊᗜˋ*)و✧⁕</div>',
      `平常上班時耳機都常都是放白噪音、雨聲等等自然聲音。`,
      `同一個聲音聽太多次，連下一個雷聲甚麼時候出現我都快背起來了。(›´ω\`‹ )`,
      `雖然有很多不錯的線上混音器網站，但是總感覺差了一點甚麼，最後決定嘗試用 Babylon.js 做一個 3D 混音器，聲音使用隨機播放的形式呈現。`,

      `可以任意組合場景積木，積木種類與規模會產生不同自然音效。`,
      `<ul class="list-disc list-inside my-2 ml-2">
        <li>樹木：風吹過樹葉聲音</li>
        <li>房子：咖啡廳聲音</li>
        <li>河：流水聲</li>
      </ul>`,
      `不同規模還會產生生態系，例如：樹木夠多會有蟲鳴、鳥叫等等。`,
      `來發掘看看有甚麼聲音吧！(\ ´ ▽ \` )ﾉ`,
      '<div class="font-bold text-xl">特別感謝</div>',
      `使用以下工具或資源建構，感謝所有創作者！`,
      `<ul class="list-disc list-inside my-2 ml-2">
        <li>3D 模型：<a href="https://kenney.nl/assets/hexagon-kit" target="_blank">kenney Hexagon Kit</a></li>
        <li>音源：<a href="https://sound-effects.bbcrewind.co.uk/" target="_blank">BBC Sound Effects</a></li>
        <li>工具：<a href="https://codlin.me/aquarium/codstack/" target="_blank">CodStack</a></li>
      </ul>`,
    ],
    start: [
    ],
    startImg: [
    ],
  },
  'en': {
    intro: [
    ],
    start: [
    ],
    startImg: [
    ],
  },
} as const)

const languages = usePreferredLanguages()

watch(languages, ([lang]) => {
  locale.value = lang?.includes('zh') ? 'zh-hant' : 'en'

  // locale.value = 'en'
}, {
  immediate: true,
})
</script>

<style scoped lang="sass">
</style>
