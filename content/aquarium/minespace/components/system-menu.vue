<template>
  <div
    v-if="open"
    class="system-menu"
  >
    <div class="menu-body">
      <div class="menu-title">
        {{ t('title') }}
      </div>

      <!--
        設定收成一項一列

        每一項原本是「標題一行、控制項一行」，五項就吃掉十行。
        名稱、控制項與讀數排在同一列之後高度直接砍半，
        而且三欄各自對齊，掃一眼就看得完
      -->
      <div class="setting-group">
        <div class="setting-row">
          <span class="setting-name">{{ t('volume') }}</span>
          <button
            class="mc-button icon-button"
            :title="isMuted ? t('muted') : t('volume')"
            @click="isMuted = !isMuted"
          >
            <u-icon
              :name="isMuted ? 'i-mingcute:volume-mute-fill' : 'i-mingcute:volume-fill'"
              class="text-lg"
            />
          </button>
          <input
            v-model.number="volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="menu-slider"
          >
          <span class="setting-value">{{ isMuted ? t('muted') : `${Math.round(volume * 100)}%` }}</span>
        </div>

        <div class="setting-row">
          <span class="setting-name">{{ t('timeOfDay') }}</span>
          <button
            class="mc-button icon-button"
            :class="{ 'mc-button-active': isAutoTime }"
            :title="isAutoTime ? t('timeAuto') : t('timeStopped')"
            @click="isAutoTime = !isAutoTime"
          >
            <u-icon
              :name="isAutoTime ? 'i-material-symbols:play-arrow-rounded' : 'i-material-symbols:pause-rounded'"
              class="text-lg"
            />
          </button>
          <input
            v-model.number="timeOfDay"
            type="range"
            min="0"
            max="0.999"
            step="0.001"
            class="menu-slider"
          >
          <span class="setting-value">{{ timeLabel }}</span>
        </div>

        <div class="setting-row">
          <span class="setting-name">{{ t('daySpeed') }}</span>
          <input
            v-model.number="daySpeedRatio"
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="menu-slider slider-indent"
          >
          <span class="setting-value">{{ dayLengthText }}</span>
        </div>

        <div class="setting-row">
          <span class="setting-name">{{ t('fieldOfView') }}</span>
          <input
            v-model.number="cameraFov"
            type="range"
            :min="CAMERA_FOV_RANGE[0]"
            :max="CAMERA_FOV_RANGE[1]"
            step="0.01"
            class="menu-slider slider-indent"
          >
          <span class="setting-value">{{ Math.round(cameraFov * 180 / Math.PI) }}°</span>
        </div>

        <div class="setting-row">
          <span class="setting-name">{{ t('graphicsQuality') }}</span>
          <div class="quality-row">
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

      <!--
        操作說明收起來

        開始畫面已經有一份一模一樣的，這裡是備查用的第二份。
        攤開來要七列，而它是「看過一次就記住」的東西——
        收進摺疊裡，需要的人點開就好
      -->
      <details class="control-details">
        <summary class="control-summary">
          {{ t('controls') }}
        </summary>
        <control-guide class="control-body" />
      </details>

      <div class="button-row">
        <button
          class="mc-button flex-1"
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
  </div>
</template>

<script setup lang="ts">
import type { Landmark } from '../domains/world/landmark'
import { computed } from 'vue'
import { CAMERA_FOV_RANGE } from '../composables/use-babylon-scene'
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
/** 鏡頭的視野角度（弧度） */
const cameraFov = defineModel<number>('cameraFov', { required: true })

const { quality } = useGraphicsQuality()
const landmarkList = LANDMARK_LIST

/** 一天多長，超過一分鐘就用分鐘表示 */
const dayLengthText = computed(() => {
  const lengthSecond = Math.round(getDayLengthSecond(daySpeedRatio.value))

  return lengthSecond >= 90
    ? `${Math.round(lengthSecond / 60)} ${t('minute')}`
    : `${lengthSecond} ${t('second')}`
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
    minute: '分',
    second: '秒',
    fieldOfView: '視野',
    graphicsQuality: '畫質',
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
    timeOfDay: 'Time',
    timeAuto: 'Day cycle running',
    timeStopped: 'Time held',
    daySpeed: 'Flow',
    minute: 'min',
    second: 'sec',
    fieldOfView: 'View',
    graphicsQuality: 'Quality',
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
  padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))
  background: rgba(0, 0, 0, 0.65)
  backdrop-filter: blur(3px)
  -webkit-backdrop-filter: blur(3px)
  overflow-y: auto

.menu-body
  /** 空間夠就置中、不夠就靠上，與外層的 flex-start 搭配 */
  margin: auto
  width: 100%
  max-width: 600px
  display: flex
  flex-direction: column
  gap: 16px
  color: #E6E6E6
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6)

.menu-title
  font-size: 1.7rem
  font-weight: 900
  text-align: center

.menu-section
  display: flex
  flex-direction: column
  gap: 8px

.menu-label
  font-size: 13px
  opacity: 0.85

/** 五項設定排成一疊，列與列之間留一點縫就好 */
.setting-group
  display: flex
  flex-direction: column
  gap: 8px

.setting-row
  display: flex
  align-items: center
  gap: 10px

/** 名稱欄固定寬度，五列的控制項才會對齊在同一條線上 */
.setting-name
  flex: none
  width: 3.2em
  font-size: 13px
  opacity: 0.85

.setting-value
  flex: none
  min-width: 5.4em
  text-align: right
  font-size: 12px
  opacity: 0.7

.menu-slider
  flex: 1
  min-width: 0
  accent-color: #8ACA8A
  cursor: pointer

/** 沒有按鈕的那幾列要往內縮，滑桿的起點才與有按鈕的對齊 */
.slider-indent
  margin-left: 56px

.quality-row
  flex: 1
  display: flex
  gap: 8px

.button-row
  display: flex
  gap: 10px

/**
 * 地標一共二十座
 *
 * 桌機排四欄剛好五列，比三欄少掉兩列。
 * 中等寬度退回三欄，手機的寬度塞不下中文標題就剩兩欄
 */
.landmark-grid
  display: grid
  grid-template-columns: repeat(4, minmax(0, 1fr))
  gap: 6px

  @media (max-width: 560px)
    grid-template-columns: repeat(3, minmax(0, 1fr))

  @media (max-width: 400px)
    grid-template-columns: repeat(2, minmax(0, 1fr))

.control-details
  border-top: 1px solid rgba(255, 255, 255, 0.14)
  padding-top: 12px

.control-summary
  cursor: pointer
  font-size: 13px
  opacity: 0.85
  user-select: none

  &:hover
    opacity: 1

.control-body
  margin-top: 10px

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
  padding: 8px 12px
  font-size: 13px

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
  flex: none
  width: 46px
  padding: 6px

/** 四欄之後每一格更窄，字級與內距都要跟著收 */
.landmark-button
  font-size: 12px
  padding: 7px 4px
  gap: 3px

.resume-button
  flex: 1.4
  padding: 12px
  font-size: 1.05rem
  font-weight: 700
</style>
