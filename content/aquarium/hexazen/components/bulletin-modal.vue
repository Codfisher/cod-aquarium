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
