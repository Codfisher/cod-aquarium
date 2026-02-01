import type { SceneSettings } from '../../type'
import { defineStore } from 'pinia'
import { clone } from 'remeda'
import { computed, ref, shallowRef } from 'vue'

export const useSceneStore = defineStore('scene', () => {
  const settings = ref<SceneSettings>({
    enablePreviewRotation: false,
    previewGroundYOffset: 0,
    metadata: {
      mass: {
        label: 'Mass',
        type: 'number',
        key: 'mass',
        defaultValue: 0,
      },
      restitution: {
        label: 'Restitution',
        type: 'number',
        key: 'restitution',
        defaultValue: 0.5,
      },
      friction: {
        label: 'Friction',
        type: 'number',
        key: 'friction',
        defaultValue: 0,
      },
      otherFieldList: [],
    },
  })
  function patchSettings(newSettings: Partial<SceneSettings>) {
    settings.value = { ...settings.value, ...newSettings }
  }

  return {
    settings: computed(() => clone(settings.value)),
    patchSettings,
  }
})
