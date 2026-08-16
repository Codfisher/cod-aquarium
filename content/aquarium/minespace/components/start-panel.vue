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
          v-for="(text, index) in introList"
          :key="index"
          v-html="text"
        />
      </div>

      <control-guide class="mt-[22px]" />

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
import { computed } from 'vue'
import { useSimpleI18n } from '../composables/use-simple-i18n'
import { GARDEN_LIST } from '../domains/garden/garden-layout'
import ControlGuide from './control-guide.vue'

const props = defineProps<{
  ready: boolean;
  /** 從選單再次打開時，按鈕改成回到漫遊 */
  isReopened?: boolean;
}>()

defineEmits<{
  start: [];
}>()

const confirmLabel = computed(() => {
  if (props.isReopened) {
    return t('back')
  }
  return props.ready ? t('start') : t('loading')
})

/** 一到九十九的中文數字，說明文裡不該出現阿拉伯數字 */
const CHINESE_DIGIT_LIST = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

function formatChineseNumber(value: number): string {
  if (value < 10) {
    return CHINESE_DIGIT_LIST[value] ?? String(value)
  }

  const tens = Math.floor(value / 10)
  const ones = value % 10
  const tensText = tens === 1 ? '十' : `${CHINESE_DIGIT_LIST[tens]}十`

  return ones === 0 ? tensText : `${tensText}${CHINESE_DIGIT_LIST[ones]}`
}

/**
 * 箱庭有幾座，數給讀的人聽
 *
 * 這個數字原本是寫死的，寫下時是十七座，後來加到二十一座卻沒人記得改。
 * 這種數字不會有人特地回來核對——除非它自己去數
 */
const introList = computed(() => t('intro', {
  count: locale.value === 'en' ? GARDEN_LIST.length : formatChineseNumber(GARDEN_LIST.length),
}))

const { t, locale } = useSimpleI18n({
  'zh-hant': {
    subtitle: '戴上耳機，走進一片白沙上的聲音庭園',
    /**
     * 說明只留四句
     *
     * 這是一座庭園的入口，不是說明書。走進去看得到的東西不必先講，
     * 講了反而先替人看過一遍。
     *
     * 兩種語言的句數必須一樣多。型別只管得到「這個鍵是不是字串陣列」，
     * 管不到長度——少一句不會報錯，只會讓某一種語言的人少讀到一行
     */
    intro: [
      '白沙無邊，其上落著{count}座箱庭。',
      '一庭一音，松有風，澤有蛙。',
      '庭與庭之間什麼也沒有，那是留給耳朵的空白。',
      '在日夜流轉之間，找一個安心的角落，聆聽吧。',
    ],
    start: '開始漫遊',
    back: '回到漫遊',
    loading: '正在耙沙⋯⋯',
    /** 音效來源是版權標註，兩種語言都要有，不能只掛在其中一邊 */
    credit: '音效：<a href="https://sound-effects.bbcrewind.co.uk/" target="_blank" rel="noopener">BBC Sound Effects</a>　空間音效：<a href="https://www.babylonjs.com/" target="_blank" rel="noopener">Babylon.js</a>',
  },
  'en': {
    subtitle: 'Put on headphones and step into a garden of sound on white sand',
    intro: [
      'Endless white sand. {count} dioramas rest upon it.',
      'One garden, one sound. Wind in the pines, frogs in the marsh.',
      'Between them, nothing. That emptiness is for the ears.',
      'As day turns to night, find a quiet corner and listen.',
    ],
    start: 'Start Roaming',
    back: 'Back to Roaming',
    loading: 'Raking the sand...',
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
  /**
   * 內容比螢幕高時要從頂端開始，不能置中
   *
   * align-items: center 配上 overflow-y: auto 是經典的陷阱：
   * 內容一旦比容器高，溢出的部分會往「兩端」各推一半，
   * 而捲軸只捲得到下半邊——上半邊被推到捲動範圍之外，永遠看不到。
   * 改成靠上對齊，再讓內容自己用 margin: auto 置中：
   * 空間夠時照樣置中，不夠時就從頂端排起，一格都不會被切掉
   */
  align-items: flex-start
  justify-content: center
  padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))
  background: rgba(0, 0, 0, 0.72)
  backdrop-filter: blur(4px)
  -webkit-backdrop-filter: blur(4px)
  overflow-y: auto

.panel-body
  /** 空間夠就置中、不夠就靠上，與外層的 flex-start 搭配 */
  margin: auto
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
