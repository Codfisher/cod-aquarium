<template>
  <u-modal
    :title="t('title')"
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
              <div class="flex gap-2 flex-nowrap">
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
import { computed } from 'vue'
import { useSimpleI18n } from '../composables/use-simple-i18n'

const isMobile = useMediaQuery('(pointer: coarse)')

const { t } = useSimpleI18n({
  'zh-hant': {
    title: '操控說明',
    actionMove: '移動',
    actionRotate: '視角旋轉',
    actionJump: '跳躍',
    actionPlace: '放置方塊（持有方塊時）',
    actionMine: '挖掘方塊（未持有方塊時）',
    actionTeleport: '傳送至瞄準位置（蓄力 1 秒）',
    actionToggleMenu: '開啟 / 關閉系統選單',
    actionPlaceMineMobile: '放置方塊（持有時）/ 挖掘方塊（未持有時）',
    actionOpenMenu: '開啟系統選單',
    keyMouseMove: '滑鼠移動',
    keyLeftClick: '滑鼠左鍵',
    keyLeftHold: '滑鼠左鍵 長按',
    keyRightHold: '滑鼠右鍵 長按',
    keyLeftJoystick: '左側搖桿',
    keyRightSwipe: '右側滑動',
  },
  'en': {
    title: 'Controls Guide',
    actionMove: 'Move',
    actionRotate: 'Rotate Camera',
    actionJump: 'Jump',
    actionPlace: 'Place Block (when holding)',
    actionMine: 'Mine Block (empty-handed)',
    actionTeleport: 'Teleport to target (hold 1s)',
    actionToggleMenu: 'Toggle System Menu',
    actionPlaceMineMobile: 'Place (holding) / Mine (empty-handed)',
    actionOpenMenu: 'Open System Menu',
    keyMouseMove: 'Mouse Move',
    keyLeftClick: 'Mouse Left Click',
    keyLeftHold: 'Mouse Left Hold',
    keyRightHold: 'Mouse Right Hold',
    keyLeftJoystick: 'Left Joystick',
    keyRightSwipe: 'Right Swipe',
  },
} as const)

type ControlKey = string | { icon: string }

interface ControlItem {
  keys: ControlKey[];
  action: string;
}

const desktopControls = computed<ControlItem[]>(() => [
  { keys: ['W', 'A', 'S', 'D'], action: t('actionMove') },
  { keys: [t('keyMouseMove')], action: t('actionRotate') },
  { keys: ['Space'], action: t('actionJump') },
  { keys: [t('keyLeftClick')], action: t('actionPlace') },
  { keys: [t('keyLeftHold')], action: t('actionMine') },
  { keys: [t('keyRightHold')], action: t('actionTeleport') },
  { keys: ['ESC'], action: t('actionToggleMenu') },
])

const mobileControls = computed<ControlItem[]>(() => [
  { keys: [t('keyLeftJoystick')], action: t('actionMove') },
  { keys: [t('keyRightSwipe')], action: t('actionRotate') },
  { keys: [{ icon: 'i-pixelarticons:arrow-up' }], action: t('actionJump') },
  { keys: [{ icon: 'i-pixelarticons:download' }, { icon: 'i-pixelarticons:drop-area' }], action: t('actionPlaceMineMobile') },
  { keys: [{ icon: 'i-pixelarticons:loader' }], action: t('actionTeleport') },
  { keys: [{ icon: 'i-pixelarticons:menu' }], action: t('actionOpenMenu') },
])
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
