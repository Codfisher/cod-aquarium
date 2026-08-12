<template>
  <div class="start-panel">
    <div class="panel-body">
      <div class="title">
        Minespace
      </div>
      <div class="subtitle">
        {{ t('subtitle') }}
      </div>

      <div class="intro">
        <p
          v-for="(text, index) in t('intro')"
          :key="index"
          v-html="text"
        />
      </div>

      <div class="control-guide">
        <div
          v-for="(item, index) in controlList"
          :key="index"
          class="control-row"
        >
          <span class="control-key">{{ item.key }}</span>
          <span class="control-action">{{ item.action }}</span>
        </div>
      </div>

      <button
        class="mc-button start-button"
        :disabled="!ready"
        @click="$emit('start')"
      >
        {{ confirmLabel }}
      </button>

      <div class="credit" v-html="t('credit')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import { useSimpleI18n } from '../composables/use-simple-i18n'

const props = defineProps<{
  ready: boolean;
  /** 從選單再次打開時，按鈕改成回到漫遊 */
  isReopened?: boolean;
}>()

defineEmits<{
  start: [];
}>()

const isMobile = useMediaQuery('(pointer: coarse)')

const confirmLabel = computed(() => {
  if (props.isReopened) {
    return t('back')
  }
  return props.ready ? t('start') : t('loading')
})

const controlList = computed(() => {
  if (isMobile.value) {
    return [
      { key: t('touchLeft'), action: t('move') },
      { key: t('touchRight'), action: t('look') },
      { key: t('touchButton'), action: t('jumpSwim') },
    ]
  }

  return [
    { key: 'W A S D', action: t('move') },
    { key: t('mouse'), action: t('look') },
    { key: 'Space', action: t('jumpSwim') },
    { key: 'Shift', action: t('sprint') },
    { key: 'Tab', action: t('releaseCursor') },
    { key: 'Esc', action: t('menu') },
  ]
})

const { t } = useSimpleI18n({
  'zh-hant': {
    subtitle: '戴上耳機，走進一座會發出聲音的島',
    intro: [
      '這裡沒有任務、沒有方塊要挖，只有一座島與五十個聲音。',
      '森林、雪山、沼澤、海岸、村莊、洞窟，每個地方都有自己的聲響。營火在你左邊燒、瀑布在你右後方落下，<b>走近會變大聲，轉頭會換邊</b>。',
      '島西邊的長雨谷終年下著雨，走過去就知道了。南邊的沼澤則整天罩著霧。',
      '建議<b>戴上耳機</b>，方位感會清楚很多。( ´ ▽ ` )ﾉ',
    ],
    start: '開始漫遊',
    back: '回到漫遊',
    loading: '正在堆方塊⋯⋯',
    move: '移動',
    look: '轉動視角',
    jumpSwim: '跳躍 / 上浮',
    sprint: '衝刺',
    releaseCursor: '放開滑鼠',
    menu: '選單',
    mouse: '滑鼠',
    touchLeft: '左半螢幕拖曳',
    touchRight: '右半螢幕拖曳',
    touchButton: '右下按鈕',
    credit: '音源：<a href="https://sound-effects.bbcrewind.co.uk/" target="_blank" rel="noopener">BBC Sound Effects</a>　空間音效：<a href="https://www.babylonjs.com/" target="_blank" rel="noopener">Babylon.js</a>',
  },
  'en': {
    subtitle: 'Put on headphones and walk onto an island that sounds back',
    intro: [
      'No quests, no blocks to mine — just an island and fifty sounds.',
      'Forest, snow ridge, swamp, coast, village, cavern: each place has its own voice. The campfire crackles on your left, the waterfall falls behind your right shoulder. <b>Walk closer and it grows louder; turn your head and it switches sides.</b>',
      'Everrain Vale in the west is under permanent rain; the swamp to the south sits in mist all day. Walk there and see.',
      '<b>Headphones recommended</b> — the direction is much easier to feel. ( ´ ▽ ` )ﾉ',
    ],
    start: 'Start Roaming',
    back: 'Back to Roaming',
    loading: 'Stacking blocks...',
    move: 'Move',
    look: 'Look around',
    jumpSwim: 'Jump / Swim up',
    sprint: 'Sprint',
    releaseCursor: 'Release cursor',
    menu: 'Menu',
    mouse: 'Mouse',
    touchLeft: 'Drag left half',
    touchRight: 'Drag right half',
    touchButton: 'Bottom-right button',
    credit: 'Audio: <a href="https://sound-effects.bbcrewind.co.uk/" target="_blank" rel="noopener">BBC Sound Effects</a>　Spatial audio: <a href="https://www.babylonjs.com/" target="_blank" rel="noopener">Babylon.js</a>',
  },
} as const)
</script>

<style scoped lang="sass">
.start-panel
  position: absolute
  inset: 0
  z-index: 50
  display: flex
  align-items: center
  justify-content: center
  padding: 24px
  background: rgba(0, 0, 0, 0.72)
  backdrop-filter: blur(4px)
  -webkit-backdrop-filter: blur(4px)
  overflow-y: auto

.panel-body
  width: 100%
  max-width: 520px
  color: #E6E6E6
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6)

.title
  font-size: 2.6rem
  font-weight: 900
  letter-spacing: 0.04em
  line-height: 1.1

.subtitle
  margin-top: 6px
  font-size: 15px
  opacity: 0.75

.intro
  margin-top: 22px
  display: flex
  flex-direction: column
  gap: 12px
  font-size: 14px
  line-height: 1.85
  opacity: 0.92

.control-guide
  margin-top: 22px
  padding: 12px 14px
  display: flex
  flex-direction: column
  gap: 6px
  background: rgba(255, 255, 255, 0.06)
  border: 1px solid rgba(255, 255, 255, 0.14)

.control-row
  display: flex
  align-items: center
  gap: 12px
  font-size: 13px

.control-key
  min-width: 116px
  font-weight: 700
  opacity: 0.95

.control-action
  opacity: 0.7

.mc-button
  display: block
  background: #AAAAAA
  border: none
  color: white
  cursor: pointer
  text-align: center
  box-shadow: inset -2px -4px 0 #555555, inset 2px 2px 0 #FFFFFF
  text-shadow: 2px 2px 0 #3F3F3F
  transition: transform 0.1s
  padding: 10px 20px

  &:hover:not(:disabled)
    background: #C6C6C6

  &:active:not(:disabled)
    transform: scale(0.98)
    background: #777777
    box-shadow: inset 2px 4px 0 #555555, inset -2px -2px 0 #FFFFFF

  &:disabled
    cursor: progress
    opacity: 0.55

.start-button
  margin-top: 24px
  width: 100%
  padding: 16px
  font-size: 1.25rem
  font-weight: 700

.credit
  margin-top: 16px
  font-size: 12px
  opacity: 0.55

  :deep(a)
    text-decoration: underline
</style>
