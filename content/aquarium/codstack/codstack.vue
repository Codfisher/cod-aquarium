<template>
  <client-only>
    <u-app
      :toaster="{
        position: 'top-right',
      }"
    >
      <u-dashboard-group
        unit="rem"
        storage="local"
      >
        <sidebar />

        <sense-viewer class="w-full h-full" />
      </u-dashboard-group>

      <div class=" fixed right-0 top-0 p-2 px-3 text-xs opacity-10">
        {{ version }}
      </div>
    </u-app>
  </client-only>
</template>

<script setup lang="ts">
import SenseViewer from './sense-viewer.vue'
import Sidebar from './sidebar.vue'

const version = '0.1.0'
</script>

<style lang="sass" scoped>
</style>
