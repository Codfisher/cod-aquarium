<template>
  <u-modal title="Welcome to CodStack!">
    <slot />

    <template #content>
      <u-tabs :items="tabItems">
        <template #account>
          <!-- <div v-html="t('welcome')" /> -->
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
    label: 'Account',
    icon: 'i-lucide-user',
    slot: 'account',
  },
  {
    label: 'Password',
    icon: 'i-lucide-lock',
    slot: 'password',
  },
] satisfies TabsItem[])
</script>

<style scoped lang="sass">
</style>

<i18n lang="js">
{
  "zh-hant": {
    "welcome": `
    <p>
      感謝 <a
        href="https://kenney.nl/assets"
        target="_blank"
        class="underline"
      >Kenny</a>、<a
        href="https://kaylousberg.itch.io"
        target="_blank"
        class="underline"
      >Kay</a> 這些佛心大神們提供免費的 3D 模型。
    </p>

    <p>
      否則我自己畫，到等真的做出來，應該是 10 年後了。(╥ω╥ )
    </p>
    `
  },
  "en": {
    "welcome": `
    <p>
      Thanks to <a
        href="https://kenney.nl/assets"
        target="_blank"
        class="underline"
      >Kenny</a> and <a
        href="https://kaylousberg.itch.io"
        target="_blank"
        class="underline"
      >Kay</a> for providing free 3D models.
    </p>

    <p>
      Otherwise, if I drew them myself, it would probably take 10 years to finish (╥ω╥ )
    </p>
    `
  }
}
</i18n>
