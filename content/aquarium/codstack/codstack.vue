<template>
  <client-only>
    <u-app
      :toaster="{
        position: 'top-right',
      }"
    >
      <u-dashboard-group storage="local">
        <u-dashboard-sidebar
          resizable
          :min-size="15"
          :default-size="30"
          :max-size="40"
        >
          <file-preview-panel />
        </u-dashboard-sidebar>

        <sense-viewer class="w-full h-full" />
      </u-dashboard-group>

      <div class=" fixed right-0 top-0 p-2 px-3 text-xs opacity-10">
        {{ version }}
      </div>
    </u-app>
  </client-only>
</template>

<script setup lang="ts">
import FilePreviewPanel from './components/file-preview-panel.vue'
import SenseViewer from './components/sense-viewer.vue'

const version = '0.1.0'
</script>

<style lang="sass" scoped>
</style>
