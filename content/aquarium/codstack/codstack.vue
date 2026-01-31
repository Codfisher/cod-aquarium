<template>
  <client-only>
    <u-app
      :toaster="{
        position: 'top-right',
      }"
    >
      <u-dashboard-group storage="local">
        <u-dashboard-sidebar :default-size="25">
          <file-preview-panel v-model:selected-model-file="selectedModelFile" />
        </u-dashboard-sidebar>

        <scene-viewer
          v-slot="{ addedMeshList }"
          class="w-full h-full"
          :selected-model-file="selectedModelFile"
          @cancel-preview="cancelPreview"
        >
          <div class="flex absolute left-0 bottom-0 p-4 gap-2">
            <help-modal>
              <u-icon
                name="i-material-symbols:help-outline-rounded"
                class=" size-12 opacity-30 p-2 cursor-pointer"
              />
            </help-modal>
          </div>

          <div class="flex absolute left-0 top-0 p-4 gap-2">
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
          v{{ version }}
        </span>
      </div>
    </u-app>
  </client-only>
</template>

<script setup lang="ts">
import type { ModelFile } from './type'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import ExportModal from './components/export-modal.vue'
import FilePreviewPanel from './components/file-preview-panel.vue'
import HelpModal from './components/help-modal.vue'
import SceneViewer from './components/scene-viewer/scene-viewer.vue'
import { useMainStore } from './stores/main-store'

const version = '0.1.0'

const mainStore = useMainStore()

const selectedModelFile = shallowRef<ModelFile>()
function cancelPreview() {
  selectedModelFile.value = undefined
}
watch(() => mainStore.rootFsHandle, () => cancelPreview())

// 載入字體
const fontHref = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&family=Orbitron:wght@400..900'
let linkEl: HTMLLinkElement
onMounted(() => {
  // 已經有同樣的 link 就不要重複
  const existed = Array.from(document.head.querySelectorAll('link'))
    .find((link) => link.getAttribute('href') === fontHref)
  if (existed)
    return

  linkEl = document.createElement('link')
  linkEl.rel = 'stylesheet'
  linkEl.href = fontHref
  document.head.appendChild(linkEl)
})

onBeforeUnmount(() => {
  if (linkEl)
    document.head.removeChild(linkEl)
})
</script>

<style lang="sass">
@use './styles/animation.sass'
</style>

<style lang="sass" scoped>
.font-orbitron
  font-family: "Orbitron", sans-serif
</style>
