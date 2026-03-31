<template>
  <div
    class="qte-overlay"
    @click="handleTap"
    @keydown.space.prevent="handleTap"
    tabindex="0"
    ref="panelRef"
  >
    <!-- 蓄力階段 -->
    <div v-if="currentStageName === 'charge'" class="qte-stage">
      <div class="qte-stage__label">{{ t('charge') }}</div>

      <!-- 能量條 -->
      <div class="charge-bar">
        <!-- Perfect 區域 -->
        <div class="charge-bar__zone charge-bar__zone--perfect" />
        <!-- Great 區域 -->
        <div class="charge-bar__zone charge-bar__zone--great" />

        <!-- 指標 -->
        <div
          class="charge-bar__indicator"
          :style="{ bottom: `${chargeValue * 100}%` }"
        />

        <!-- 刻度 -->
        <div
          v-for="i in 10"
          :key="i"
          class="charge-bar__tick"
          :style="{ bottom: `${i * 10}%` }"
        />
      </div>

      <div class="qte-stage__hint">{{ t('tapToConfirm') }}</div>
    </div>

    <!-- 瞄準階段 -->
    <div v-else-if="currentStageName === 'aim'" class="qte-stage">
      <div class="qte-stage__label">{{ t('aim') }}</div>
      <div class="qte-stage__hint">{{ t('tapToConfirm') }}</div>
    </div>

    <!-- 發射階段 -->
    <div v-else-if="currentStageName === 'launch'" class="qte-stage">
      <div class="qte-stage__label">{{ t('launch') }}</div>
      <div class="qte-stage__hint">{{ t('tapToConfirm') }}</div>
    </div>

    <!-- 階段指示器 -->
    <div class="stage-indicator">
      <div
        v-for="(stage, index) in stageNameList"
        :key="stage"
        class="stage-indicator__dot"
        :class="{
          'stage-indicator__dot--active': stage === currentStageName,
          'stage-indicator__dot--done': stageNameList.indexOf(currentStageName) > index,
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { useSimpleI18n } from '../../composables/use-simple-i18n'

defineProps<{
  currentStageName: string;
  chargeValue: number;
}>()

const emit = defineEmits<{
  confirm: [];
}>()

const panelRef = useTemplateRef<HTMLDivElement>('panelRef')
const stageNameList = ['charge', 'aim', 'launch']

onMounted(() => {
  panelRef.value?.focus()
})

function handleTap() {
  emit('confirm')
}

const { t } = useSimpleI18n({
  'zh-hant': {
    charge: '蓄力',
    aim: '瞄準',
    launch: '發射',
    tapToConfirm: '點擊 / 空白鍵',
  },
  'en': {
    charge: 'CHARGE',
    aim: 'AIM',
    launch: 'LAUNCH',
    tapToConfirm: 'TAP / SPACE',
  },
} as const)
</script>

<style lang="sass" scoped>
.qte-overlay
  position: fixed
  inset: 0
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  z-index: 10
  cursor: pointer
  outline: none

.qte-stage
  display: flex
  flex-direction: column
  align-items: center
  gap: 1.5rem
  animation: stage-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1)

  &__label
    font-family: 'Orbitron', sans-serif
    font-weight: 800
    font-size: 1.5rem
    letter-spacing: 0.3em
    color: white
    text-shadow: 0 0 30px rgba(255,255,255,0.4)

  &__hint
    font-family: 'Rajdhani', sans-serif
    font-weight: 600
    font-size: 0.8rem
    letter-spacing: 0.25em
    color: rgba(255,255,255,0.35)
    text-transform: uppercase
    animation: hint-pulse 1.5s ease-in-out infinite

.charge-bar
  position: relative
  width: 3rem
  height: 16rem
  border: 1px solid rgba(255,255,255,0.15)
  clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)
  overflow: hidden

  &::before
    content: ''
    position: absolute
    inset: 0
    background: linear-gradient(to top, rgba(255,50,50,0.08), rgba(255,200,50,0.08), rgba(50,255,50,0.08))

  &__zone
    position: absolute
    left: 0
    width: 100%

    &--perfect
      top: 0
      height: 15%
      background: rgba(251, 191, 36, 0.25)
      border-bottom: 1px solid rgba(251, 191, 36, 0.5)

    &--great
      top: 15%
      height: 10%
      background: rgba(74, 222, 128, 0.15)
      border-bottom: 1px solid rgba(74, 222, 128, 0.3)

  &__indicator
    position: absolute
    left: -2px
    right: -2px
    height: 3px
    background: white
    box-shadow: 0 0 12px rgba(255,255,255,0.8), 0 0 24px rgba(255,255,255,0.4)
    transition: none
    z-index: 2

    &::before, &::after
      content: ''
      position: absolute
      top: 50%
      transform: translateY(-50%)
      width: 0
      height: 0
      border: 5px solid transparent

    &::before
      left: -8px
      border-right-color: white

    &::after
      right: -8px
      border-left-color: white

  &__tick
    position: absolute
    left: 0
    width: 8px
    height: 1px
    background: rgba(255,255,255,0.15)

.stage-indicator
  position: fixed
  bottom: 3rem
  display: flex
  gap: 0.5rem

  &__dot
    width: 2rem
    height: 3px
    background: rgba(255,255,255,0.15)
    transition: all 0.3s ease

    &--active
      background: white
      box-shadow: 0 0 8px rgba(255,255,255,0.5)

    &--done
      background: rgba(255,255,255,0.4)

@keyframes stage-enter
  from
    opacity: 0
    transform: translateY(10px)
  to
    opacity: 1
    transform: translateY(0)

@keyframes hint-pulse
  0%, 100%
    opacity: 0.35
  50%
    opacity: 0.7
</style>
