<template>
  <u-modal title="Help">
    <u-icon
      name="i-material-symbols:help-outline-rounded"
      class=" size-12 opacity-30 p-2 cursor-pointer"
    />

    <template #body>
      <div class="">
        <h2 class="text-lg font-bold">
          快捷鍵說明
        </h2>
        <ul class="list-disc list-inside space-y-1">
          <li><u-kbd>Esc</u-kbd>：關閉、取消選取</li>
          <li><u-kbd>Ctrl</u-kbd> + <u-kbd>Z</u-kbd>：上一步</li>
          <li><u-kbd>Ctrl</u-kbd> + <u-kbd>Y</u-kbd>：下一步</li>
          <li>選取後 + <u-kbd>G</u-kbd>：移動</li>
          <li>選取後 + <u-kbd>S</u-kbd>：縮放</li>
          <li>選取後 + <u-kbd>R</u-kbd>：旋轉</li>
        </ul>
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
