<template>
  <u-form
    :state="optionForm"
    class="w-full flex flex-col gap-4"
  >
    <u-form-field
      as="label"
      label="Align to Surface"
      v-bind="fieldProps"
    >
      <u-checkbox v-model="optionForm.enablePreviewRotation" />

      <template #description>
        Automatically aligns the model to the surface normal. You can also hold <u-kbd value="Alt" /> (Option) to
        temporarily enable this
        without checking the box.
      </template>
    </u-form-field>

    <u-form-field
      label="Preview Ground Vertical Offset"
      v-bind="fieldProps"
    >
      <u-input-number
        v-model="optionForm.previewGroundYOffset"
        :min="-10"
        :max="10"
        :step="0.5"
      />

      <template #description>
        Applies a vertical offset only when the preview snaps to the ground to prevent clipping. (Does not affect
        stacking on other meshes). Use <u-kbd value="Q" /> / <u-kbd value="E" /> to adjust.
      </template>
    </u-form-field>

    <u-separator />

    <u-form-field
      label="Model Metadata"
      description="Metadata for the models in the scene."
      v-bind="fieldProps"
      :ui="{ label: 'text-lg font-semibold', ...fieldProps.ui }"
    >
    </u-form-field>

    <u-form-field
      label="Mass"
      description="default value for new models"
      v-bind="fieldProps"
    >
      <u-input-number
        v-model="optionForm.metadata.mass.defaultValue"
        :step="0.1"
      />
    </u-form-field>

    <u-form-field
      label="Restitution"
      description="default value for new models"
      v-bind="fieldProps"
    >
      <u-input-number
        v-model="optionForm.metadata.restitution.defaultValue"
        :step="0.1"
      />
    </u-form-field>

    <u-form-field
      label="Friction"
      description="default value for new models"
      v-bind="fieldProps"
    >
      <u-input-number
        v-model="optionForm.metadata.friction.defaultValue"
        :step="0.1"
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

// const optionSchema = z.object({
//   /** 預覽時是否要旋轉 */
//   enablePreviewRotation: z.boolean().default(false),
//   /** 預覽模型的垂直軸起點 */
//   previewGroundYOffset: z.number().default(0),
//   metadata: z.object({
//     mass: z.number().default(1),
//     restitution: z.number().default(0),
//     friction: z.number().default(0),
//     otherFieldList: z.array(z.object({
//       label: z.string(),
//       type: z.string(),
//       key: z.string(),
//       defaultValue: z.any(),
//     })).default([]),
//   })
// })

const optionForm = ref(clone(sceneStore.settings))

watch(optionForm, (newValue) => {
  sceneStore.patchSettings(newValue)
}, { deep: true })
</script>

<style scoped lang="sass">
</style>
