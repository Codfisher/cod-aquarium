<template>
  <u-form
    :state="optionForm"
    :schema="optionSchema"
    class="w-full p-4 flex flex-col gap-4"
  >
    <u-form-field
      as="label"
      label="Enable Preview Rotation"
      description="When enabled, objects will automatically rotate and stay perpendicular to the surface."
      v-bind="fieldProps"
    >
      <u-checkbox v-model="optionForm.enablePreviewRotation" />
    </u-form-field>

    <u-form-field
      label="Preview Base Y"
      description="Prevents objects from sinking below the floor during preview."
      v-bind="fieldProps"
    >
      <u-input-number
        v-model="optionForm.previewBaseY"
        :min="-10"
        :max="10"
        :step="0.5"
      />
    </u-form-field>
  </u-form>
</template>

<script setup lang="ts">
import { clone } from 'remeda'
import { ref, watch } from 'vue'
import z from 'zod/v4'
import { useSceneStore } from '../domains/scene/scene-store'

interface Props {
  label?: string;
}
const props = withDefaults(defineProps<Props>(), {
  label: '',
})

const emit = defineEmits<{
  'update:model-value': [value: string];
}>()

const sceneStore = useSceneStore()

const fieldProps = {
  orientation: 'horizontal',
  ui: { description: 'text-xs opacity-50' },
}

const optionSchema = z.object({
  /** 預覽時是否要旋轉 */
  enablePreviewRotation: z.boolean().default(false),
  /** 預覽模型的垂直軸起點 */
  previewBaseY: z.number().default(0),
})

const optionForm = ref(clone(sceneStore.settings))

watch(optionForm, (newValue) => {
  sceneStore.patchSettings(newValue)
}, { deep: true })
</script>

<style scoped lang="sass">
</style>
