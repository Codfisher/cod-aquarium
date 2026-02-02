<template>
  <u-modal title="Welcome to CodStack!">
    <slot />

    <template #body>
      <div class="">
        感謝 <a
          href="https://kenney.nl/assets"
          target="_blank"
          class="underline"
        >Kenny</a>、<a
          href="https://kaylousberg.itch.io"
          target="_blank"
          class="underline"
        >Kay</a> 這些佛心大神們提供的免費 3D 模型。

        否則我自己畫，等真的做出來，可能要 10 年後了（？
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
interface Props {
  label?: string;
}
const props = withDefaults(defineProps<Props>(), {
  label: '',
})
</script>

<style scoped lang="sass">
</style>
