<template>
  <u-modal
    title="操控說明"
    :ui="{
      overlay: 'mc-overlay',
      content: 'mc-panel mc-font rounded-none! shadow-none! ring-0! border-0! max-w-md',
      close: 'mc-close-btn',
      body: 'p-0!',
    }"
  >
    <slot />

    <template #body>
      <div class="p-4">
        <!-- 電腦版 -->
        <div v-if="!isMobile">
          <ul class="flex flex-col gap-4">
            <li
              v-for="item in desktopControls"
              :key="item.action"
              class="flex items-center gap-2"
            >
              <div class="flex gap-2 flex-wrap">
                <kbd
                  v-for="key in item.keys"
                  :key="typeof key === 'string' ? key : key.icon"
                  class="mc-key"
                >
                  {{ key }}
                </kbd>
              </div>
              <span class="mc-separator">—</span>
              <span>{{ item.action }}</span>
            </li>
          </ul>
        </div>

        <!-- 手機版 -->
        <div v-else>
          <ul class="flex flex-col gap-4">
            <li
              v-for="item in mobileControls"
              :key="item.action"
              class="flex items-center gap-2"
            >
              <div class="flex gap-2 flex-wrap">
                <kbd
                  v-for="key in item.keys"
                  :key="typeof key === 'string' ? key : key.icon"
                  class="mc-key"
                >
                  <u-icon
                    v-if="typeof key === 'object'"
                    :name="key.icon"
                    class="text-base leading-none"
                  />
                  <template v-else>{{ key }}</template>
                </kbd>
              </div>
              <span class="mc-separator">—</span>
              <span>{{ item.action }}</span>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'

const isMobile = useMediaQuery('(pointer: coarse)')

type ControlKey = string | { icon: string }

interface ControlItem {
  keys: ControlKey[];
  action: string;
}

const desktopControls: ControlItem[] = [
  { keys: ['W', 'A', 'S', 'D'], action: '移動' },
  { keys: ['滑鼠移動'], action: '視角旋轉' },
  { keys: ['Space'], action: '跳躍' },
  { keys: ['左鍵'], action: '放置方塊（持有方塊時）' },
  { keys: ['左鍵 長按'], action: '挖掘方塊（未持有方塊時）' },
  { keys: ['右鍵 長按'], action: '傳送至瞄準位置（蓄力 1 秒）' },
  { keys: ['ESC'], action: '開啟 / 關閉系統選單' },
]

const mobileControls: ControlItem[] = [
  { keys: ['左側搖桿'], action: '移動' },
  { keys: ['右側滑動'], action: '視角旋轉' },
  { keys: [{ icon: 'i-pixelarticons:arrow-up' }], action: '跳躍' },
  { keys: [{ icon: 'i-pixelarticons:download' }, { icon: 'i-pixelarticons:drop-area' }], action: '放置方塊（持有時）/ 挖掘方塊（未持有時）' },
  { keys: [{ icon: 'i-pixelarticons:loader' }], action: '傳送至瞄準位置（蓄力 1 秒）' },
  { keys: [{ icon: 'i-pixelarticons:menu' }], action: '開啟系統選單' },
]
</script>

<style scoped lang="sass">
// ── 字型 ──

.mc-font
  font-family: 'Minecraft', monospace
  image-rendering: pixelated
  -webkit-font-smoothing: none
  font-smooth: never

.mc-key
  display: inline-flex
  align-items: center
  justify-content: center
  min-width: 1.6rem
  height: 1.4rem
  padding: 0 5px
  background: #555555
  color: #E0E0E0
  font-size: 0.65rem
  font-family: inherit
  white-space: nowrap
  // 立體 slot 效果
  box-shadow: inset -1px -2px 0px #333333, inset 1px 1px 0px #888888
  text-shadow: 1px 1px 0px #000000
  transition: none
</style>
