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
import { useGraphicsQuality } from '../composables/use-graphics-quality'
import { useSimpleI18n } from '../composables/use-simple-i18n'
import { LANDMARK_LIST } from '../domains/world/landmark'

defineProps<{
  open: boolean;
}>()

defineEmits<{
  resume: [];
  intro: [];
  travel: [landmark: Landmark];
}>()

const volume = defineModel<number>('volume', { required: true })
const isMuted = defineModel<boolean>('muted', { required: true })

const { quality } = useGraphicsQuality()
const landmarkList = LANDMARK_LIST

const { locale, t } = useSimpleI18n({
  'zh-hant': {
    title: '暫停',
    volume: '音量',
    muted: '靜音',
    graphicsQuality: '畫面等級',
    high: '高',
    low: '低',
    travel: '快速前往',
    intro: '遊玩說明',
    resume: '繼續漫遊',
  },
  'en': {
    title: 'Paused',
    volume: 'Volume',
    muted: 'Muted',
    graphicsQuality: 'Graphics',
    high: 'High',
    low: 'Low',
    travel: 'Fast Travel',
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
  align-items: center
  justify-content: center
  padding: 24px
  background: rgba(0, 0, 0, 0.65)
  backdrop-filter: blur(3px)
  -webkit-backdrop-filter: blur(3px)
  overflow-y: auto

.menu-body
  width: 100%
  max-width: 420px
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

.landmark-grid
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 8px

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

.landmark-button
  font-size: 13px
  padding: 9px 8px

.resume-button
  padding: 14px
  font-size: 1.1rem
  font-weight: 700
</style>
