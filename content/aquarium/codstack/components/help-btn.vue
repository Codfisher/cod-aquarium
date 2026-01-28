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
          <li>選取後按 <u-kbd>G</u-kbd>：移動</li>
          <li>選取後按 <u-kbd>S</u-kbd>：縮放</li>
          <li>選取後按 <u-kbd>R</u-kbd>：旋轉</li>
          <li>移動、縮放、旋轉時 + <u-kbd>Shift</u-kbd>：0.1 單位或 1 度步長</li>
          <li>移動、縮放、旋轉時 + <u-kbd>Alt</u-kbd>：自由步長</li>
          <li>按住 <u-kbd>Shift</u-kbd>選擇：多選</li>
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
