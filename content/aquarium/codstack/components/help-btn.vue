<template>
  <u-modal title="Help">
    <u-icon
      name="i-material-symbols:help-outline-rounded"
      class=" size-12 opacity-30 p-2 cursor-pointer"
    />

    <template #body>
      <div class="">
        <h2>快捷鍵說明</h2>
        <ul>
          <li>Esc: 關閉</li>
          <li>Ctrl + Z: 撤銷</li>
          <li>Ctrl + Y: 重做</li>
          <li>選取後 + G: 移動</li>
          <li>選取後 + S: 縮放</li>
          <li>選取後 + R: 旋轉</li>
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
