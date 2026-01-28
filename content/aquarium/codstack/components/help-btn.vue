<template>
  <u-modal>
    <u-button
      icon="i-heroicons-question-mark-circle"
      color="neutral"
      variant="subtle"
    />

    <template #content>
      <placeholder class="h-48 m-4" />
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
