<template>
  <u-modal title="Welcome to CodStack!">
    <slot />

    <template #content>
      <u-tabs :items="tabItems">
        <template #intro>
          <i18n-t
            keypath="welcome_intro"
            tag="span"
          >
            <template #kenny>
              <a
                href="https://kenney.nl/assets"
                target="_blank"
                class="underline font-medium"
              >Kenny</a>
            </template>
            <template #kay>
              <a
                href="https://kaylousberg.itch.io"
                target="_blank"
                class="underline font-medium"
              >Kay</a>
            </template>
          </i18n-t>
        </template>
      </u-tabs>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui/.'
import { watchImmediate } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  label?: string;
}
const props = withDefaults(defineProps<Props>(), {
  label: '',
})

const { locale, t } = useI18n()

const lang = ref<'zh-hant' | 'en'>('zh-hant')
watchImmediate(lang, (newLang) => {
  locale.value = newLang
})

const tabItems = computed(() => [
  {
    label: 'Intro',
    icon: 'i-lucide-user',
    slot: 'intro',
  },
] satisfies TabsItem[])
</script>

<style scoped lang="sass">
</style>

<i18n lang="yaml">
zh-hant:
  intro: |
    感謝 {kenny}、{kay} 這些佛心大神們提供免費的 3D 模型。

    否則我自己畫，等到真的做出來，應該是 10 年後了。(╥ω╥ )

en:
  intro: |
    Thanks to {kenny} and {kay} for providing free 3D models.

    Otherwise, if I drew them myself, it would probably take 10 years to finish (╥ω╥ )
</i18n>
