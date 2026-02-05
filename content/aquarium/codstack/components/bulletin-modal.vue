<template>
  <u-modal title="Welcome to CodStack!">
    <slot />

    <template #content>
      <u-tabs :items="tabItems">
        <template #intro>
          <p
            v-for="(text, index) in tm('intro')"
            :key="index"
          >
            {{ text }}
          </p>
        </template>
      </u-tabs>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui/.'
import { computed, ref } from 'vue'
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

const { locale, tm, t } = useSimpleI18n({
  'zh-hant': {
    intro: [
      '感謝 {kenny}、{kay} 這些佛心大神們提供免費的 3D 模型。',
      '否則我自己畫，等到真的做出來，應該是 10 年後了。(╥ω╥ )',
    ],
  },
  'en': {
    intro: [
      'Thanks to {kenny} and {kay} for providing free 3D models.',
      'Otherwise, if I drew them myself, it would probably take 10 years to finish (╥ω╥ )',
    ],
  },
}, 'zh-hant')
</script>

<style scoped lang="sass">
</style>
