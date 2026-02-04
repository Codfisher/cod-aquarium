<template>
  <client-only>
    <u-app
      :toaster="{
        position: 'top-right',
      }"
    >
      <u-dashboard-group storage="local">
        <u-dashboard-sidebar
          :min-size="20"
          :default-size="25"
          resizable
          :max-size="50"
        >
          <file-preview-panel v-model:selected-model-file="selectedModelFile" />
        </u-dashboard-sidebar>

        <scene-viewer
          v-slot="{ addedMeshList }"
          class="w-full h-full"
          :selected-model-file="selectedModelFile"
          :imported-scene-data="importedSceneData"
          @cancel-preview="cancelPreview"
        >
          <div class="flex flex-col absolute left-0 bottom-0 p-2 gap-1">
            <bulletin-modal>
              <u-icon
                name="material-symbols:notifications-outline-rounded"
                color="white"
                class=" size-14 p-2 cursor-pointer filter-[drop-shadow(0_0_2px_#777)]"
              />
            </bulletin-modal>

            <help-modal>
              <u-icon
                name="i-material-symbols:help-outline-rounded"
                color="white"
                class=" size-14 p-2 cursor-pointer filter-[drop-shadow(0_0_2px_#777)]"
              />
            </help-modal>
          </div>

          <div class="flex flex-col absolute left-0 top-0 p-4 gap-2">
            <import-modal @data="handleImportData">
              <u-tooltip
                :text="importBtnState.tooltip"
                :content="{ side: 'right' }"
                :delay-duration="importBtnState.disabled ? 0 : undefined"
              >
                <u-button
                  icon="i-material-symbols:database-upload-outline-rounded"
                  color="neutral"
                  variant="subtle"
                  size="xl"
                  :disabled="importBtnState.disabled"
                />
              </u-tooltip>
            </import-modal>

            <export-modal :mesh-list="addedMeshList">
              <u-tooltip
                text="Export scene"
                :content="{ side: 'right' }"
              >
                <u-button
                  icon="i-material-symbols:download-2-rounded"
                  color="neutral"
                  variant="subtle"
                  size="xl"
                />
              </u-tooltip>
            </export-modal>
          </div>
        </scene-viewer>
      </u-dashboard-group>

      <div class="font-orbitron fixed right-0 bottom-0 p-2 px-3 opacity-50">
        <span class="text-base">CodStack</span>

        <span class="ml-1 text-xs text-gray-500">
          v{{ mainStore.version }}
        </span>
      </div>
    </u-app>
  </client-only>
</template>

<script setup lang="ts">
import type { ModelFile, SceneData } from './type'
import { computed, shallowRef, watch } from 'vue'
import BulletinModal from './components/bulletin-modal.vue'
import ExportModal from './components/export-modal.vue'
import FilePreviewPanel from './components/file-preview-panel/file-preview-panel.vue'
import HelpModal from './components/help-modal.vue'
import ImportModal from './components/import-modal.vue'
import SceneViewer from './components/scene-viewer/scene-viewer.vue'
import { useFontLoader } from './composables/use-font-loader'
import { useMainStore } from './stores/main-store'

useFontLoader()
const mainStore = useMainStore()

const selectedModelFile = shallowRef<ModelFile>()
function cancelPreview() {
  selectedModelFile.value = undefined
}
watch(() => mainStore.rootFsHandle, () => cancelPreview())

const importBtnState = computed(() => {
  if (!mainStore.rootFsHandle) {
    return {
      disabled: true,
      tooltip: 'Please select a folder',
    }
  }
  return {
    disabled: false,
    tooltip: 'Import scene',
  }
})

const importedSceneData = shallowRef<SceneData>()
function handleImportData(data: SceneData) {
  importedSceneData.value = data
}
</script>

<style lang="sass">
@use './styles/animation.sass'
</style>

<style lang="sass" scoped>
.font-orbitron
  font-family: "Orbitron", sans-serif
</style>
