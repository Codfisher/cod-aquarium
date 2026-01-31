<template>
  <u-modal title="Help">
    <slot />

    <template #body>
      <div class="[&>h2:not(:first-child)]:mt-3">
        <h2 class="text-lg font-bold ">
          鏡頭控制
        </h2>
        <ul class="list-disc list-inside space-y-1 mt-1">
          <li>左鍵：移動鏡頭</li>
          <li><u-kbd>Ctrl</u-kbd>+左鍵：平移鏡頭</li>
          <li>滾輪：縮放鏡頭</li>
        </ul>

        <h2 class="text-lg font-bold ">
          快捷鍵說明
        </h2>
        <ul class="list-disc list-inside space-y-1 mt-1">
          <li>移動、縮放、旋轉時 + <u-kbd>Shift</u-kbd>：0.1 單位或 1 度步長</li>
          <li>選擇時按住 <u-kbd>Shift</u-kbd>：多選</li>
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
