<template>
  <u-modal
    title="Welcome to CodStack!"
    :ui="{
      content: 'min-w-full md:min-w-160 overflow-auto',
    }"
  >
    <slot />

    <template #content>
      <u-tabs
        v-model="currentTab"
        :items="tabItems"
        value-key="slot"
        :ui="{
          indicator: 'chamfer-2',
          content: '',
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

const currentTab = ref('quick-start')
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
      `點擊灰色的六角積木，選擇、放置你喜歡的積木`,
      `點擊積木可以旋轉，啟用鏟子圖示可以移除積木`,
      `不同組合、數量的場景會產生不同的自然音效<br><br>來試試看不同組合，仔細聽聽看有甚麼聲音，打造屬於您自己的音景吧！ヾ(◍'౪\`◍)ﾉﾞ`,
    ],
    startImg: [
      '/hexazen/quick-start/step01.mp4',
      '/hexazen/quick-start/step02.mp4',
      '/hexazen/quick-start/step03.png',
    ],
  },
  'en': {
    intro: [
      '<div class="font-bold text-2xl mb-6">Welcome to Hexazen! ⁑｡٩(ˊᗜˋ*)و✧⁕</div>',
      `I usually listen to white noise, rain, and other natural sounds with my headphones while working.`,
      `After listening to the exact same audio too many times, I can almost memorize when the next thunderstrike will hit. (›´ω\`‹ )`,
      `Although there are many great online audio mixer websites, they always felt like they were missing something. So, I decided to try building a 3D audio mixer using Babylon.js, featuring randomized sound playback.`,

      `You can freely combine the scene blocks. Different types and scales of blocks will generate different natural sound effects.`,
      `<ul class="list-disc list-inside my-2 ml-2">
        <li>Trees: Wind rustling through leaves</li>
        <li>Houses: Cafe ambiance</li>
        <li>Rivers: Flowing water</li>
      </ul>`,
      `Different scales will also create ecosystems. For example, if there are enough trees, you'll hear insects chirping, birds singing, and more.`,
      `Let's explore and see what sounds you can find! (\\ ´ ▽ \` )ﾉ`,
      '<div class="font-bold text-xl">Special Thanks</div>',
      `Built with the following tools and resources. Huge thanks to all the creators!`,
      `<ul class="list-disc list-inside my-2 ml-2">
        <li>3D Models: <a href="https://kenney.nl/assets/hexagon-kit" target="_blank">kenney Hexagon Kit</a></li>
        <li>Audio Sources: <a href="https://sound-effects.bbcrewind.co.uk/" target="_blank">BBC Sound Effects</a></li>
        <li>Tools: <a href="https://codlin.me/aquarium/codstack/" target="_blank">CodStack</a></li>
      </ul>`,
    ],
    start: [
      `Click on the gray hexagonal blocks to select and place your favorite blocks.`,
      `Click on a block to rotate it, and enable the shovel icon to remove blocks.`,
      `Different combinations and quantities of scene blocks will produce different natural sound effects.<br><br>Try out various combinations, listen closely to the sounds, and build your very own soundscape! ヾ(◍'౪\`◍)ﾉﾞ`,
    ],
    startImg: [
      '/hexazen/quick-start/step01.mp4',
      '/hexazen/quick-start/step02.mp4',
      '/hexazen/quick-start/step03.png',
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
