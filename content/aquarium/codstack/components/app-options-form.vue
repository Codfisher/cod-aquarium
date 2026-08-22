<template>
  <UForm
    :state="optionForm"
    class="w-full flex flex-col gap-4"
  >
    <UFormField
      label="App"
      description=""
      v-bind="fieldProps"
      :ui="{ label: 'text-lg font-semibold', ...fieldProps.ui }"
    />

    <UFormField
      label="Clear All Cache"
      description="Clears all cache, such as model preview thumbnails. Useful when thumbnail errors occur."
      v-bind="fieldProps"
    >
      <UPopover>
        <UButton
          label="Clear"
          color="error"
        />

        <template #content="{ close }">
          <div class="flex flex-col gap-2 p-4">
            <div class="text-sm font-bold">
              This action cannot be undone
            </div>
            <div class="text-xs opacity-50">
              Are you sure you want to clear all cache?
            </div>

            <div class="flex justify-end gap-2 mt-2">
              <UButton
                label="Cancel"
                color="neutral"
                variant="soft"
                @click="close"
              />
              <UButton
                label="Clear All Cache"
                color="error"
                variant="solid"
                @click="clearCache(); close()"
              />
            </div>
          </div>
        </template>
      </UPopover>
    </UFormField>

    <USeparator />

    <UFormField
      label="Preview"
      description=""
      v-bind="fieldProps"
      :ui="{ label: 'text-lg font-semibold', ...fieldProps.ui }"
    />

    <UFormField
      as="label"
      label="Align to Surface"
      v-bind="fieldProps"
    >
      <UCheckbox v-model="optionForm.enablePreviewRotation" />

      <template #description>
        Automatically aligns the model to the surface normal. You can also hold <UKbd value="Alt" /> (Option) to
        temporarily enable this
        without checking the box.
      </template>
    </UFormField>

    <UFormField
      label="Ground Snap Vertical Offset"
      v-bind="fieldProps"
    >
      <UInputNumber
        v-model="optionForm.previewGroundYOffset"
        :min="-10"
        :max="10"
        :step="0.5"
      />

      <template #description>
        Applies a vertical offset only when the preview snaps to the ground to prevent clipping. (Does not affect
        stacking on other meshes). Use <UKbd value="Q" />(up) / <UKbd value="E" />(down) to adjust.
      </template>
    </UFormField>

    <USeparator />

    <UFormField
      label="Model Metadata"
      description="Metadata for the models in the scene."
      v-bind="fieldProps"
      :ui="{ label: 'text-lg font-semibold', ...fieldProps.ui }"
    />

    <UFormField
      label="Mass"
      description="default value for new models"
      v-bind="fieldProps"
    >
      <UInputNumber
        v-model="optionForm.metadata.mass.defaultValue"
        :step="0.1"
      />
    </UFormField>

    <UFormField
      label="Restitution"
      description="default value for new models"
      v-bind="fieldProps"
    >
      <UInputNumber
        v-model="optionForm.metadata.restitution.defaultValue"
        :step="0.1"
      />
    </UFormField>

    <UFormField
      label="Friction"
      description="default value for new models"
      v-bind="fieldProps"
    >
      <UInputNumber
        v-model="optionForm.metadata.friction.defaultValue"
        :step="0.1"
      />
    </UFormField>
  </UForm>
</template>

<script setup lang="ts">
import { clear } from 'idb-keyval'
import { clone } from 'remeda'
import { ref, watch } from 'vue'
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

const toast = useToast()
const sceneStore = useSceneStore()

const fieldProps = {
  orientation: 'horizontal',
  ui: { description: 'text-xs opacity-50' },
}

const optionForm = ref(clone(sceneStore.settings))

watch(optionForm, (newValue) => {
  sceneStore.patchSettings(newValue)
}, { deep: true })

function clearCache() {
  clear().then(() => {
    toast.add({
      title: 'Cache cleared',
      description: 'All cache has been cleared',
      color: 'success',
    })
  }).catch(() => {
    toast.add({
      title: 'Cache cleared failed',
      description: 'please try again',
      color: 'error',
    })
  })
}
</script>

<style scoped lang="sass">
</style>
