import type { SceneSettings } from '../../type'
import { defineStore } from 'pinia'
import { clone } from 'remeda'
import { computed, ref, shallowRef } from 'vue'

export const useSceneStore = defineStore('scene', () => {
  const settings = ref<SceneSettings>({
    enablePreviewRotation: false,
    previewGroundYOffset: 0,
  })
  function patchSettings(newSettings: Partial<SceneSettings>) {
    settings.value = { ...settings.value, ...newSettings }
  }

  return {
    settings: computed(() => clone(settings.value)),
    patchSettings,
  }
})
