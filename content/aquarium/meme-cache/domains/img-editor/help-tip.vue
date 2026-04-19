<template>
  <u-popover
    :ui="{
      content: 'z-9999 p-0 text-sm min-w-64 overflow-hidden',
    }"
    arrow
  >
    <div class="absolute right-0 bottom-0 p-6 opacity-60">
      <u-icon
        name="i-material-symbols:help-outline-rounded"
        class="size-10 text-white"
      />
    </div>

    <template #content>
      <div class="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
        <section class="p-3 flex flex-col gap-2">
          <div class="section-title">
            新增素材
          </div>

          <div
            v-for="(tip, i) in addTipList"
            :key="i"
            class="tip-row"
          >
            <u-icon
              :name="tip.icon"
              class="tip-icon"
            />
            <span v-html="tip.html" />
          </div>
        </section>

        <section class="p-3 flex flex-col gap-2">
          <div class="section-title">
            調整素材
          </div>

          <div
            v-for="(tip, i) in adjustTipList"
            :key="i"
            class="tip-row"
          >
            <u-icon
              :name="tip.icon"
              class="tip-icon"
            />
            <span>{{ tip.text }}</span>
          </div>
        </section>
      </div>
    </template>
  </u-popover>
</template>

<script setup lang="ts">
const KBD_CLASS = 'inline-flex items-center px-1.5 py-0.5 mx-0.5 text-xs font-mono rounded-md border border-b-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 leading-none'

const addTipList = [
  {
    icon: 'i-material-symbols:touch-app-outline-rounded',
    html: '點擊空白處加入文字',
  },
  {
    icon: 'i-material-symbols:content-paste-rounded',
    html: `按「插入圖片」或 <kbd class="${KBD_CLASS}">Ctrl</kbd>+<kbd class="${KBD_CLASS}">V</kbd> 貼上`,
  },
]

const adjustTipList = [
  {
    icon: 'i-material-symbols:open-with-rounded',
    text: '拖曳移動，兩指旋轉',
  },
  {
    icon: 'i-material-symbols:zoom-out-map-rounded',
    text: '圖片邊角可拖拉縮放',
  },
  {
    icon: 'i-material-symbols:ads-click-rounded',
    text: '點選後可複製或刪除',
  },
]
</script>

<style scoped lang="sass">
.section-title
  font-size: 0.7rem
  font-weight: 600
  letter-spacing: 0.08em
  text-transform: uppercase
  opacity: 0.55

.tip-row
  display: flex
  align-items: center
  gap: 0.55rem
  line-height: 1.5

.tip-icon
  flex-shrink: 0
  width: 1rem
  height: 1rem
  opacity: 0.6
</style>
