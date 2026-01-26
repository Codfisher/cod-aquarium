<template>
  <u-dashboard-sidebar>
    <div class=" flex flex-col justify-center items-center h-full gap-2">
      <u-button
        label="選擇目錄"
        variant="outline"
        color="neutral"
        icon="material-symbols:folder"
        @click="handleClick"
      />

      <div class=" text-xs text-gray-500">
        預覽此目錄下所有 3D 模型
      </div>
    </div>
  </u-dashboard-sidebar>
</template>

<script setup lang="ts">
interface Props {
  /** 目標目錄，掃描此目錄下的所有 3D 模型 */
  directory?: string;
}
const props = withDefaults(defineProps<Props>(), {})

function handleClick() {
  console.log('handleClick')
}
</script>

<style lang="sass" scoped>
</style>
