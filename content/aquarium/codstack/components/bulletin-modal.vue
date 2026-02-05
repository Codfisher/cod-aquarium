<template>
  <u-modal title="Welcome to CodStack!">
    <slot />

    <template #content>
      <u-tabs
        :items="tabItems"
        :ui="{
          content: 'p-4 space-y-4',
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
    icon: 'i-lucide-user',
    slot: 'intro',
  },
] satisfies TabsItem[])

const { locale, t } = useSimpleI18n({
  'zh-hant': {
    test: '',
    intro: [
      '歡迎來到 CodStack！✧⁑｡٩(ˊᗜˋ*)و✧⁕｡',
      '感謝 <a href="https://kenney.nl/assets" target="_blank" class="underline text-primary">Kenny</a>、<a href="https://kaylousberg.itch.io" target="_blank" class="underline text-primary">Kay</a> 這些佛心大神們提供免費的 3D 模型。',
      '否則我自己畫，等到真的做出來，應該是 10 年後了。(╥ω╥ )',
    ],
  },
  'en': {
    test: '',
    intro: [
      'Welcome to CodStack! ✧⁑｡٩(ˊᗜˋ*)و✧⁕｡',
      'Thanks to <a href="https://kenney.nl/assets" target="_blank" class="underline text-primary">Kenny</a> and <a href="https://kaylousberg.itch.io" target="_blank" class="underline text-primary">Kay</a> for providing free 3D models.',
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
