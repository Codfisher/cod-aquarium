<template>
  <div class="control-guide">
    <div
      v-for="item in controlList"
      :key="item.action"
      class="control-row"
    >
      <span class="control-key">{{ item.key }}</span>
      <span class="control-action">{{ item.action }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import { useSimpleI18n } from '../composables/use-simple-i18n'

/**
 * 操作說明
 *
 * 開始畫面與暫停選單都要用，所以抽出來共用一份。
 * 桌機與觸控的操作方式完全不同，這裡直接依裝置給對應的那一組，
 * 不要兩組並列——玩家只需要知道自己手上這台怎麼操作
 */
const isMobile = useMediaQuery('(pointer: coarse)')

const controlList = computed(() => {
  if (isMobile.value) {
    return [
      { key: t('touchLeft'), action: t('move') },
      { key: t('touchRight'), action: t('look') },
      { key: t('touchJump'), action: t('jumpSwim') },
      { key: t('touchSprint'), action: t('sprint') },
      { key: t('touchMenu'), action: t('timeOfDay') },
    ]
  }

  return [
    { key: 'W A S D', action: t('move') },
    { key: t('mouse'), action: t('look') },
    { key: 'Space', action: t('jumpSwim') },
    { key: 'Shift', action: t('sprint') },
    { key: t('wheel'), action: t('timeOfDay') },
    { key: 'Tab', action: t('releaseCursor') },
    { key: 'Esc', action: t('menu') },
  ]
})

const { t } = useSimpleI18n({
  'zh-hant': {
    move: '移動',
    look: '轉動視角',
    jumpSwim: '跳躍 / 上浮',
    sprint: '衝刺',
    releaseCursor: '放開滑鼠',
    menu: '開關選單',
    mouse: '滑鼠',
    wheel: '滾輪',
    timeOfDay: '調整時刻',
    touchLeft: '左半螢幕拖曳',
    touchRight: '右半螢幕拖曳',
    touchJump: '右下大圓鈕',
    touchSprint: '右下小圓鈕',
    touchMenu: '選單時間軸',
  },
  'en': {
    move: 'Move',
    look: 'Look around',
    jumpSwim: 'Jump / Swim up',
    sprint: 'Sprint',
    releaseCursor: 'Release cursor',
    menu: 'Toggle menu',
    mouse: 'Mouse',
    wheel: 'Wheel',
    timeOfDay: 'Change time of day',
    touchLeft: 'Drag left half',
    touchRight: 'Drag right half',
    touchJump: 'Large button, bottom right',
    touchSprint: 'Small button, bottom right',
    touchMenu: 'Menu time slider',
  },
} as const)
</script>

<style scoped lang="sass">
/**
 * 排成兩欄
 *
 * 每一條說明左邊是按鍵、右邊是動作，本身就很短，
 * 一行只放一條的話右半邊整片留白。
 * 桌機的六條剛好兩欄三列；窄螢幕塞不下兩組「按鍵＋動作」，再退回一欄
 */
.control-guide
  padding: 12px 14px
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 6px 18px
  background: rgba(255, 255, 255, 0.06)
  border: 1px solid rgba(255, 255, 255, 0.14)

  @media (max-width: 420px)
    grid-template-columns: minmax(0, 1fr)

.control-row
  display: flex
  align-items: baseline
  gap: 8px
  font-size: 13px
  min-width: 0

.control-key
  flex: 0 0 auto
  font-weight: 700
  letter-spacing: 0.04em
  color: rgba(255, 255, 255, 0.92)

/** 觸控的說明字比較長，擠不下時讓它自己縮，不要把整欄撐開 */
.control-action
  min-width: 0
  opacity: 0.72
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
</style>
