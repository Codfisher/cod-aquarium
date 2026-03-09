<template>
  <div
    v-if="show"
    class="absolute inset-0 bg-black/60 flex flex-col items-center z-50 mc-font overflow-y-auto"
  >
    <div class="mc-container flex flex-col items-center gap-6 px-4 py-8 my-auto">
      <span class="text-4xl text-neutral-200 font-bold leading-relaxed">
        {{ t('title') }}
      </span>

      <div class="flex flex-col gap-8 w-full max-w-100">
        <div class="flex flex-col gap-3">
          <label class="text-lg mc-text-shadow text-neutral-300">
            {{ t('playerName') }}
          </label>
          <div class="mc-input-wrapper">
            <input
              v-model="localName"
              type="text"
              class="mc-input w-full"
              :placeholder="t('enterName')"
            >
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <label class="text-lg mc-text-shadow text-neutral-300">
            {{ t('graphicsQuality') }}
          </label>
          <div class="flex gap-3">
            <button
              class="mc-button flex-1 py-3 text-lg"
              :class="{ 'mc-button-active': quality === 'high' }"
              @click="quality = 'high'"
            >
              {{ t('high') }}
            </button>
            <button
              class="mc-button flex-1 py-3 text-lg"
              :class="{ 'mc-button-active': quality === 'low' }"
              @click="quality = 'low'"
            >
              {{ t('low') }}
            </button>
          </div>
        </div>

        <controls-guide-modal>
          <button class="mc-button w-full py-3 text-lg">
            {{ t('controlsGuide') }}
          </button>
        </controls-guide-modal>

        <button
          class="mc-button w-full py-4 text-xl"
          @click="$emit('resume')"
        >
          {{ t('resumeGame') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGraphicsQuality } from '../composables/use-graphics-quality'
import { useSimpleI18n } from '../composables/use-simple-i18n'
import ControlsGuideModal from './controls-guide-modal.vue'

const { t } = useSimpleI18n({
  'zh-hant': {
    title: '系統選單',
    playerName: '玩家名稱:',
    enterName: '輸入玩家名稱...',
    graphicsQuality: '畫面等級:',
    high: '高',
    low: '低',
    controlsGuide: '操控說明',
    resumeGame: '回到遊戲',
  },
  'en': {
    title: 'System Menu',
    playerName: 'Player Name:',
    enterName: 'Enter player name...',
    graphicsQuality: 'Graphics Quality:',
    high: 'High',
    low: 'Low',
    controlsGuide: 'Controls Guide',
    resumeGame: 'Resume Game',
  },
} as const)

const props = defineProps<{
  show: boolean;
  playerName: string;
}>()

const emit = defineEmits<{
  'resume': [];
  'update:playerName': [name: string];
}>()

const { quality } = useGraphicsQuality()

const localName = ref(props.playerName)

watch(() => props.playerName, (newVal) => {
  localName.value = newVal
})

watch(localName, (newVal) => {
  emit('update:playerName', newVal)
})
</script>

<style scoped lang="sass">
.mc-font
  font-family: 'Minecraft', 'Segoe UI', Tahoma, sans-serif
  image-rendering: pixelated

.mc-container
  width: 100%
  max-width: 500px

.mc-button
  display: block
  position: relative
  background: #AAAAAA
  border: none
  color: white
  cursor: pointer
  text-align: center
  box-shadow: inset -2px -4px 0px #555555, inset 2px 2px 0px #FFFFFF
  text-shadow: 2px 2px 0px #3F3F3F
  transition: transform 0.1s
  padding: 10px 20px

  &:hover
    background: #C6C6C6
    box-shadow: inset -2px -4px 0px #555555, inset 2px 2px 0px #FFFFFF, 0 0 0 2px white

  &:active
    transform: scale(0.98)
    box-shadow: inset 2px 4px 0px #555555, inset -2px -2px 0px #FFFFFF
    background: #777777

.mc-button-active
  background: #5A8A5A
  box-shadow: inset -2px -4px 0px #3A5A3A, inset 2px 2px 0px #8ACA8A

  &:hover
    background: #6AAA6A
    box-shadow: inset -2px -4px 0px #3A5A3A, inset 2px 2px 0px #8ACA8A, 0 0 0 2px white

.mc-input-wrapper
  position: relative
  background: #000000
  padding: 2px
  border: 2px solid #A0A0A0
  box-shadow: inset 2px 2px 0px #000000

.mc-input
  background: transparent
  border: none
  outline: none
  color: #E0E0E0
  font-size: 1.25rem
  padding: 8px 12px
  width: 100%

  &::placeholder
    color: #555555
</style>
