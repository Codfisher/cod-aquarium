<template>
  <u-modal title="Help">
    <slot />

    <template #body>
      <div class="[&>h2:not(:first-child)]:mt-3">
        <h2 class="text-lg font-bold ">
          Welcome to CodStack!
        </h2>
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
