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

const { t } = useSimpleI18n({
  'zh-hant': {
    subtitle: '戴上耳機，走進一片白沙上的聲音庭園',
    intro: [
      '一片無限延伸的白沙上，散落著十七座木頭底座的箱庭。',
      '每一座只收一種聲音的質地：松籟林是連綿的寬頻風聲，蛙聲澤是低頻的一問一答，岩響窟只有稀疏的滴水拖著長長的迴響。<b>走近會變大聲，轉頭會換邊</b>。',
      '箱庭與箱庭之間全是空白。那份安靜是刻意的——沒有聲音的時候，你才聽得出下一座在哪個方向。',
      '霧收得很近，看不到的地方就往有聲音的方向走。沙地沒有盡頭，走多遠都走不出去。',
      '建議<b>戴上耳機</b>，方位感會清楚很多。( ´ ▽ ` )ﾉ',
    ],
    start: '開始漫遊',
    back: '回到漫遊',
    loading: '正在耙沙⋯⋯',
    credit: '空間音效：<a href="https://www.babylonjs.com/" target="_blank" rel="noopener">Babylon.js</a>',
  },
  'en': {
    subtitle: 'Put on headphones and step into a garden of sound on white sand',
    intro: [
      'Seventeen dioramas rest on wooden plinths, scattered across an endless field of white sand.',
      'Each holds one texture of sound. The Garden of Pines is unbroken broadband wind; the Garden of Frogs is a low call and answer; the Garden of Echoes has only sparse drops trailing long reverberation. <b>Walk closer and it grows louder; turn your head and it switches sides.</b>',
      'Between the gardens there is nothing. That silence is deliberate — only when nothing is playing can you tell which way the next one lies.',
      'The fog sits close. When you cannot see, walk toward a sound. The sand has no edge; however far you go, you never leave it.',
      '<b>Headphones recommended</b> — the direction is much easier to feel. ( ´ ▽ ` )ﾉ',
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
