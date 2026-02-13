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
      '<div class="font-bold text-2xl mb-6">歡迎來到 CodStack！⁑｡٩(ˊᗜˋ*)و✧⁕</div>',
      '自<a href="https://youtu.be/PPWyUhT6gRk?si=XVD7uTdHl3Mr9kFU" target="_blank">派對動物</a>之後，我一直想繼續做其他有趣的 3D 專案，但 3D 建模實在是太難了，程式還沒開始寫，搞建模就搞到熱情冷卻了。゜・(PД`q｡)・゜',
      '直到某天發現原來有現成的模型包，感謝 <a href="https://kenney.nl/assets" target="_blank">Kenney</a>、<a href="https://kaylousberg.itch.io" target="_blank">Kay</a>、<a href="https://tinytreats.itch.io/" target="_blank">Isa</a> 這些佛心大神們提供免費的 3D 模型包，否則我自己畫，等到真的做出來，應該是 10 年後了。( ´•̥̥̥ ω •̥̥̥` )',
      '<span></span>',
      '不過使用這些 3D Pack 時有些小困擾，沒辦法快速預覽內容就算了，用程式碼組裝實在是極度痛苦。(›´ω`‹ )',
      '先在 3D 軟體中組裝，又會失去在程式中控制的彈性，<span class="font-bold">於是 CodStack 誕生了！(/≧▽≦)/</span>',
      '<span></span>',
      'CodStack 使用 <a href="https://www.babylonjs.com/" target="_blank">babylon.js</a>、<a href="https://vuejs.org/" target="_blank">Vue</a> 與 <a href="https://ui.nuxt.com/" target="_blank">Nuxt UI</a> 開發，目標是讓組裝 3D 模型變得像拼積木一樣簡單，可輸出結構資料並再次匯入編輯，方便 3D 網頁專案載入模型，免安裝，趕快來試試看吧。',
      '有任何問題或功能許願，歡迎隨時連絡我。若此工具對您有幫助，也可以<a href="https://portaly.cc/codfish/support" target="_blank">請我喝一杯咖啡</a>，鼓勵我喔！(*´∀`)~♥',
      '有空的話也可以來我的<a href="https://codlin.me/" >部落格</a>逛逛，裡面還有很多酷東西喔！(・∀・)９',
    ],
    start: [
      `下載您喜歡的模型套組並解壓縮（目前僅支援 glb、gltf 檔案）

      <br><br>
      找不到模型的話可以來這裡下載 ( \´ ▽ \` )ﾉ：
      <a href="https://kenney.nl/assets" target="_blank">Kenney</a>、<a href="https://kaylousberg.itch.io" target="_blank">Kay</a>、<a href="https://tinytreats.itch.io/" target="_blank">Isa</a>`,

      `將檔案放置到網頁專案的靜態目錄中，因為 CodStack 最後輸出是依照路徑輸出，若檔案結構與最終引用路經相同，就不用再轉換一次，會更方便
  
      <br><br>
      （若只是單純查看模型，則可忽略此步驟）`,
      '點擊左上角資料夾圖示，選擇先前步驟下載的模型資料夾',
      '選擇後，CodStack 會自動掃描資料夾中的模型檔案，並產生模型預覽圖',
      '點擊模型預覽圖，就可以在右側預覽、放置模型了',
      '場景完成後，即可輸出結構化資料，也可以再次匯入過往輸出的場景資料',
    ],
    startImg: [
      '/codstack/quick-start/step01.png',
      '/codstack/quick-start/step02.png',
      '/codstack/quick-start/step03.gif',
      '/codstack/quick-start/step04.mp4',
      '/codstack/quick-start/step05.mp4',
      '/codstack/quick-start/step06.mp4',
    ],
  },
  'en': {
    intro: [
      '<div class="font-bold text-2xl mb-6">Welcome to CodStack! ⁑｡٩(ˊᗜˋ*)و✧⁕</div>',
      'Ever since <a href="https://youtu.be/PPWyUhT6gRk?si=XVD7uTdHl3Mr9kFU" target="_blank">Party Animals</a>, I\'ve wanted to create more fun 3D projects. However, 3D modeling is incredibly difficult. My passion would usually cool down just trying to model, before I could even start writing the code. ゜・(PД`q｡)・゜',
      'That is, until I discovered ready-made model packs! Huge thanks to the benevolent legends <a href="https://kenney.nl/assets" target="_blank">Kenney</a>, <a href="https://kaylousberg.itch.io" target="_blank">Kay</a>, and <a href="https://tinytreats.itch.io/" target="_blank">Isa</a> for providing free 3D model packs. If I had to make them myself, it would probably take 10 years to finish. ( ´•̥̥̥ ω •̥̥̥` )',
      '<span></span>',
      'However, I ran into some minor annoyances when using these 3D packs. Aside from not being able to quickly preview the content, assembling them via code was absolute torture. (›´ω`‹ )',
      'Assembling them in 3D software first meant losing the flexibility of programmatic control, <span class="font-bold">and thus, CodStack was born! (/≧▽≦)/</span>',
      '<span></span>',
      'CodStack is developed using <a href="https://www.babylonjs.com/" target="_blank">babylon.js</a>, <a href="https://vuejs.org/" target="_blank">Vue</a>, and <a href="https://ui.nuxt.com/" target="_blank">Nuxt UI</a>. The goal is to make assembling 3D models as simple as playing with building blocks. It exports structured data that can be re-imported for editing, making it easy to load models into 3D web projects. No installation required—give it a try now!',
      'Feel free to contact me with any questions or feature requests. If this tool helps you, you can also <a href="https://portaly.cc/codfish/support" target="_blank">buy me a coffee</a> to support me! (*´∀`)~♥',
      'If you have time, feel free to visit my <a href="https://codlin.me/" >blog</a>—there are lots of other cool things there! (・∀・)９',
    ],
    start: [
      `Download your favorite model pack and unzip it (currently only supports glb and gltf files).

      <br><br>
      If you can't find any models, you can download them here ( \´ ▽ \` )ﾉ:
      <a href="https://kenney.nl/assets" target="_blank">Kenney</a>, <a href="https://kaylousberg.itch.io" target="_blank">Kay</a>, <a href="https://tinytreats.itch.io/" target="_blank">Isa</a>`,

      `Place the files into your web project's static directory. Since CodStack exports based on file paths, it's more convenient if the file structure matches your final import path, saving you from having to convert it later.
  
      <br><br>
      (You can skip this step if you are simply viewing models).`,
      'Click the folder icon in the top left corner and select the model folder downloaded in the previous step.',
      'Once selected, CodStack will automatically scan for model files in the folder and generate preview images.',
      'Click on a model preview image to preview and place the model on the right side.',
      'Once the scene is complete, you can export the structured data. You can also re-import previously exported scene data.',
    ],
    startImg: [
      '/codstack/quick-start/step01.png',
      '/codstack/quick-start/step02.png',
      '/codstack/quick-start/step03.gif',
      '/codstack/quick-start/step04.mp4',
      '/codstack/quick-start/step05.mp4',
      '/codstack/quick-start/step06.mp4',
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
