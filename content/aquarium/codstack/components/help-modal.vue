<template>
  <u-modal title="Help">
    <slot />

    <template #body>
      <div class="[&>h2:not(:first-child)]:mt-3">
        <h2 class="text-lg font-bold ">
          Camera Controls
        </h2>
        <ul class="list-disc list-inside space-y-1 mt-1">
          <li>Left Click: Rotate Camera</li>
          <li><u-kbd value="Ctrl" /> + Left Click: Pan Camera</li>
          <li>Scroll Wheel: Zoom Camera</li>
        </ul>

        <h2 class="text-lg font-bold ">
          Shortcuts
        </h2>
        <ul class="list-disc list-inside space-y-1 mt-1">
          <li>Hold <u-kbd value="Shift" /> while moving, scaling, or rotating: 0.1 unit or 1 degree step</li>
          <li>Hold <u-kbd value="Shift" /> while selecting: Multi-select</li>
          <li>Press <u-kbd value="q" /> during placement preview: Move Up Vertically 0.1</li>
          <li>Press <u-kbd  value="e" /> during placement preview: Move Down Vertically 0.1</li>
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
