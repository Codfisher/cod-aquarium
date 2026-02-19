<template>
  <u-form
    :state="optionForm"
    class="w-full flex flex-col gap-4"
  >
    <u-form-field
      label="App"
      description=""
      v-bind="fieldProps"
      :ui="{ label: 'text-lg font-semibold', ...fieldProps.ui }"
    />

    <u-form-field
      label="Clear All Cache"
      description="Clears all cache, such as model preview thumbnails. Useful when thumbnail errors occur."
      v-bind="fieldProps"
    >
      <u-popover>
        <u-button
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
              <u-button
                label="Cancel"
                color="neutral"
                variant="soft"
                @click="close"
              />
              <u-button
                label="Clear All Cache"
                color="error"
                variant="solid"
                @click="clearCache(); close()"
              />
            </div>
          </div>
        </template>
      </u-popover>
    </u-form-field>

    <u-separator />

    <u-form-field
      label="Preview"
      description=""
      v-bind="fieldProps"
      :ui="{ label: 'text-lg font-semibold', ...fieldProps.ui }"
    />

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
      label="Ground Snap Vertical Offset"
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
        stacking on other meshes). Use <u-kbd value="Q" />(up) / <u-kbd value="E" />(down) to adjust.
      </template>
    </u-form-field>

    <u-separator />

    <u-form-field
      label="Model Metadata"
      description="Metadata for the models in the scene."
      v-bind="fieldProps"
      :ui="{ label: 'text-lg font-semibold', ...fieldProps.ui }"
    />

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
