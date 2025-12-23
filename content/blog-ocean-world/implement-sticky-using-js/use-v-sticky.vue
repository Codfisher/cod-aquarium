<template>
  <div class="h-[20vh] card border-gray-100">
    <div class="h-[25vh] card border-gray-200">
      <div class="h-[30vh] card border-gray-300">
        <div class="h-[35vh] card border-gray-400">
          <div class="h-[40vh] card border-gray-500">
            <div
              v-sticky
              class="sticky top-0 text-center p-4 rounded-lg bg-blue-400 text-white"
            >
              我是內容 ヽ(́◕◞౪◟◕‵)ﾉ
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { vSticky } from '../../../web/directives/v-sticky'
</script>

<style scoped>
.card {
  border-width: 3px;
  padding: 40px;
  padding-left: 20px;
  border-radius: 8px;
  overflow-y: auto;
}
</style>
