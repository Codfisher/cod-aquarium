<template>
  <u-modal title="Help">
    <slot />

    <template #body>
      <div class="[&>h2:not(:first-child)]:mt-6">
        <h2 class="text-lg font-bold">
          Camera controls
        </h2>
        <ul class="list-disc list-inside space-y-1 mt-2 text-sm">
          <li><span class="font-medium">Left click</span>: Rotate</li>
          <li>
            <u-kbd value="Ctrl" />
            <span class="mx-1">+</span>
            <span class="font-medium">Left click</span>: Pan
          </li>
          <li><span class="font-medium">Scroll wheel</span>: Zoom</li>
        </ul>

        <h2 class="text-lg font-bold">
          Shortcuts
        </h2>
        <ul class="list-disc list-inside space-y-1 mt-2 text-sm">
          <li>
            Hold <u-kbd value="Shift" /> while moving / scaling / rotating:
            <span class="font-medium">step by 0.1 unit</span> or <span class="font-medium">15°</span>
          </li>
          <li>
            Hold <u-kbd value="Shift" /> while selecting:
            <span class="font-medium">multi-select</span>
          </li>
        </ul>

        <h2 class="text-lg font-bold">
          Placement preview
        </h2>
        <ul class="list-disc list-inside space-y-1 mt-2 text-sm">
          <li><u-kbd value="Q" /> : Move up <span class="font-medium">0.1</span></li>
          <li><u-kbd value="E" /> : Move down <span class="font-medium">0.1</span></li>
          <li><u-kbd value="A" /> : Rotate Y <span class="font-medium">+45°</span> (clockwise)</li>
          <li><u-kbd value="D" /> : Rotate Y <span class="font-medium">-45°</span> (counter-clockwise)</li>
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
