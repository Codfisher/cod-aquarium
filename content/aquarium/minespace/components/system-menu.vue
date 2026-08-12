<template>
  <div
    v-if="open"
    class="system-menu"
  >
    <div class="menu-body">
      <div class="menu-title">
        {{ t('title') }}
      </div>

      <div class="menu-section">
        <label class="menu-label">
          {{ t('volume') }}
          <span class="menu-value">{{ isMuted ? t('muted') : `${Math.round(volume * 100)}%` }}</span>
        </label>

        <div class="volume-row">
          <button
            class="mc-button icon-button"
            @click="isMuted = !isMuted"
          >
            <u-icon
              :name="isMuted ? 'i-mingcute:volume-mute-fill' : 'i-mingcute:volume-fill'"
              class="text-xl"
            />
          </button>

          <input
            v-model.number="volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="volume-slider"
          >
        </div>
      </div>

      <div class="menu-section">
        <label class="menu-label">
          {{ t('timeOfDay') }}
          <span class="menu-value">{{ isAutoTime ? timeLabel : `${timeLabel}・${t('timeStopped')}` }}</span>
        </label>

        <div class="volume-row">
          <button
            class="mc-button icon-button"
            :class="{ 'mc-button-active': isAutoTime }"
            :title="isAutoTime ? t('timeAuto') : t('timeStopped')"
            @click="isAutoTime = !isAutoTime"
          >
            <u-icon
              :name="isAutoTime ? 'i-material-symbols:play-arrow-rounded' : 'i-material-symbols:pause-rounded'"
              class="text-xl"
            />
          </button>

          <input
            v-model.number="timeOfDay"
            type="range"
            min="0"
            max="0.999"
            step="0.001"
            class="volume-slider"
          >
        </div>

        <label class="menu-label speed-label">
          {{ t('daySpeed') }}
          <span class="menu-value">{{ dayLengthText }}</span>
        </label>

        <input
          v-model.number="daySpeedRatio"
          type="range"
          min="0"
          max="1"
          step="0.01"
          class="volume-slider"
        >
      </div>

      <div class="menu-section">
        <label class="menu-label">{{ t('graphicsQuality') }}</label>
        <div class="button-row">
          <button
            class="mc-button flex-1"
            :class="{ 'mc-button-active': quality === 'high' }"
            @click="quality = 'high'"
          >
            {{ t('high') }}
          </button>
          <button
            class="mc-button flex-1"
            :class="{ 'mc-button-active': quality === 'low' }"
            @click="quality = 'low'"
          >
            {{ t('low') }}
          </button>
        </div>
      </div>

      <div class="menu-section">
        <label class="menu-label">{{ t('travel') }}</label>
        <div class="landmark-grid">
          <button
            v-for="landmark in landmarkList"
            :key="landmark.id"
            class="mc-button landmark-button"
            :title="locale === 'en' ? landmark.timbre.en : landmark.timbre['zh-hant']"
            @click="$emit('travel', landmark)"
          >
            <u-icon
              :name="landmark.icon"
              class="text-base"
            />
            {{ locale === 'en' ? landmark.title.en : landmark.title['zh-hant'] }}
          </button>
        </div>
      </div>

      <div class="menu-section">
        <label class="menu-label">{{ t('controls') }}</label>
        <control-guide />
      </div>

      <button
        class="mc-button"
        @click="$emit('intro')"
      >
        <u-icon
          name="i-material-symbols:help-outline"
          class="text-base"
        />
        {{ t('intro') }}
      </button>

      <button
        class="mc-button resume-button"
        @click="$emit('resume')"
      >
        {{ t('resume') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Landmark } from '../domains/world/landmark'
import { computed } from 'vue'
import { useGraphicsQuality } from '../composables/use-graphics-quality'
import { useSimpleI18n } from '../composables/use-simple-i18n'
import { getDayLengthSecond } from '../domains/weather/day-night'
import { LANDMARK_LIST } from '../domains/world/landmark'
import ControlGuide from './control-guide.vue'

defineProps<{
  open: boolean;
  /** 目前的時刻讀數，例如「06:20 破曉」 */
  timeLabel: string;
}>()

defineEmits<{
  resume: [];
  intro: [];
  travel: [landmark: Landmark];
}>()

const volume = defineModel<number>('volume', { required: true })
const isMuted = defineModel<boolean>('muted', { required: true })
/** 一天的時刻，0 為子夜、0.5 為正午 */
const timeOfDay = defineModel<number>('timeOfDay', { required: true })
/** 時間會不會自己走 */
const isAutoTime = defineModel<boolean>('autoTime', { required: true })
/** 一天走多快，0 為最緩、1 為最快 */
const daySpeedRatio = defineModel<number>('daySpeed', { required: true })

const { quality } = useGraphicsQuality()
const landmarkList = LANDMARK_LIST

/** 一天多長，超過一分鐘就用分鐘表示 */
const dayLengthText = computed(() => {
  const lengthSecond = Math.round(getDayLengthSecond(daySpeedRatio.value))

  return lengthSecond >= 90
    ? `${t('dayLength')} ${Math.round(lengthSecond / 60)} ${t('minute')}`
    : `${t('dayLength')} ${lengthSecond} ${t('second')}`
})

const { locale, t } = useSimpleI18n({
  'zh-hant': {
    title: '暫停',
    volume: '音量',
    muted: '靜音',
    timeOfDay: '時刻',
    timeAuto: '日夜自動交替',
    timeStopped: '時間停住',
    daySpeed: '流速',
    dayLength: '一天',
    minute: '分',
    second: '秒',
    graphicsQuality: '畫面等級',
    high: '高',
    low: '低',
    travel: '快速前往',
    controls: '操作方式',
    intro: '遊玩說明',
    resume: '繼續漫遊',
  },
  'en': {
    title: 'Paused',
    volume: 'Volume',
    muted: 'Muted',
    timeOfDay: 'Time of day',
    timeAuto: 'Day cycle running',
    timeStopped: 'Time held',
    daySpeed: 'Flow',
    dayLength: 'One day',
    minute: 'min',
    second: 'sec',
    graphicsQuality: 'Graphics',
    high: 'High',
    low: 'Low',
    travel: 'Fast Travel',
    controls: 'Controls',
    intro: 'How to Play',
    resume: 'Resume',
  },
} as const)
</script>

<style scoped lang="sass">
.system-menu
  position: absolute
  inset: 0
  z-index: 40
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
  background: rgba(0, 0, 0, 0.65)
  backdrop-filter: blur(3px)
  -webkit-backdrop-filter: blur(3px)
  overflow-y: auto

.menu-body
  /** 空間夠就置中、不夠就靠上，與外層的 flex-start 搭配 */
  margin: auto
  width: 100%
  max-width: 560px
  display: flex
  flex-direction: column
  gap: 22px
  color: #E6E6E6
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6)

.menu-title
  font-size: 2rem
  font-weight: 900
  text-align: center

.menu-section
  display: flex
  flex-direction: column
  gap: 10px

.menu-label
  display: flex
  justify-content: space-between
  align-items: baseline
  font-size: 14px
  opacity: 0.85

.menu-value
  font-size: 13px
  opacity: 0.7

.volume-row
  display: flex
  align-items: center
  gap: 12px

.volume-slider
  flex: 1
  accent-color: #8ACA8A
  cursor: pointer

.button-row
  display: flex
  gap: 10px

/**
 * 地標一共十七座
 *
 * 兩欄要排九列，加上音量、畫質與操作說明之後整張選單長到得捲動。
 * 桌機排三欄剛好一屏放得下；手機的寬度塞不下三欄的中文標題，
 * 窄螢幕再退回兩欄
 */
.landmark-grid
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 8px

  @media (max-width: 480px)
    grid-template-columns: repeat(2, minmax(0, 1fr))

.mc-button
  display: flex
  align-items: center
  justify-content: center
  gap: 6px
  background: #AAAAAA
  border: none
  color: white
  cursor: pointer
  text-align: center
  box-shadow: inset -2px -4px 0 #555555, inset 2px 2px 0 #FFFFFF
  text-shadow: 2px 2px 0 #3F3F3F
  transition: transform 0.1s
  padding: 10px 14px
  font-size: 14px

  &:hover
    background: #C6C6C6

  &:active
    transform: scale(0.98)
    background: #777777
    box-shadow: inset 2px 4px 0 #555555, inset -2px -2px 0 #FFFFFF

.mc-button-active
  background: #5A8A5A
  box-shadow: inset -2px -4px 0 #3A5A3A, inset 2px 2px 0 #8ACA8A

  &:hover
    background: #6AAA6A

.icon-button
  width: 46px
  padding: 8px

/** 流速是時刻底下的附屬設定，標題壓小一階並往內縮 */
.speed-label
  margin-top: 2px
  font-size: 13px
  opacity: 0.7

/** 三欄之後每一格變窄，字級與內距都要跟著收 */
.landmark-button
  font-size: 12px
  padding: 8px 6px
  gap: 4px

.resume-button
  padding: 14px
  font-size: 1.1rem
  font-weight: 700
</style>
