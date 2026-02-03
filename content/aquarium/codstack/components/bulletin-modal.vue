<template>
  <u-modal title="Welcome to CodStack!">
    <slot />

    <template #body>
      <div class="flex flex-col">
        <p class="">
          感謝 <a
            href="https://kenney.nl/assets"
            target="_blank"
            class="underline"
          >Kenny</a>、<a
            href="https://kaylousberg.itch.io"
            target="_blank"
            class="underline"
          >Kay</a> 這些佛心大神們提供免費的 3D 模型。

          否則我自己畫，等真的做出來，可能就 10 年後了（？
        </p>


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
