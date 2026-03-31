<template>
  <div class="result-overlay">
    <!-- 掃描線背景 -->
    <div class="scanlines" />

    <!-- 中央結果 -->
    <div class="result-container">
      <!-- 裝飾線 -->
      <div class="deco-line deco-line--top" />

      <div class="result-label">RESULT</div>

      <div class="result-text" :class="`result-text--${result}`">
        {{ resultText }}
      </div>

      <!-- 裝飾底線 -->
      <div class="deco-line deco-line--bottom" />

      <button
        class="restart-button"
        @click="emit('restart')"
      >
        <span class="restart-button__text">{{ t('playAgain') }}</span>
        <span class="restart-button__arrow">&#9654;</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BattleResult } from '../../types'
import { computed } from 'vue'
import { useSimpleI18n } from '../../composables/use-simple-i18n'

const props = defineProps<{
  result: BattleResult;
}>()

const emit = defineEmits<{
  restart: [];
}>()

const { t } = useSimpleI18n({
  'zh-hant': {
    win: '勝利',
    lose: '落敗',
    draw: '平手',
    playAgain: '再來一局',
  },
  'en': {
    win: 'VICTORY',
    lose: 'DEFEAT',
    draw: 'DRAW',
    playAgain: 'PLAY AGAIN',
  },
} as const)

const resultText = computed(() => t(props.result))
</script>

<style lang="sass" scoped>
.result-overlay
  position: fixed
  inset: 0
  z-index: 20
  display: flex
  align-items: center
  justify-content: center
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%)
  backdrop-filter: blur(8px)
  animation: overlay-in 0.6s cubic-bezier(0.16, 1, 0.3, 1)

.scanlines
  position: absolute
  inset: 0
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)
  pointer-events: none

.result-container
  display: flex
  flex-direction: column
  align-items: center
  gap: 1rem
  animation: content-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both

.result-label
  font-family: 'Rajdhani', sans-serif
  font-weight: 600
  font-size: 0.75rem
  letter-spacing: 0.4em
  color: rgba(255,255,255,0.3)
  text-transform: uppercase

.result-text
  font-family: 'Orbitron', sans-serif
  font-weight: 900
  font-size: clamp(3rem, 10vw, 6rem)
  letter-spacing: 0.08em
  line-height: 1
  animation: text-glitch 0.1s 0.5s 3

  &--win
    color: #fbbf24
    text-shadow: 0 0 40px rgba(251, 191, 36, 0.5), 0 0 80px rgba(251, 191, 36, 0.2), 0 2px 0 #b45309

  &--lose
    color: #ef4444
    text-shadow: 0 0 40px rgba(239, 68, 68, 0.5), 0 0 80px rgba(239, 68, 68, 0.2), 0 2px 0 #991b1b

  &--draw
    color: #94a3b8
    text-shadow: 0 0 40px rgba(148, 163, 184, 0.4), 0 2px 0 #475569

.deco-line
  width: min(80vw, 400px)
  height: 1px
  position: relative

  &::before, &::after
    content: ''
    position: absolute
    top: 0
    height: 1px

  &--top
    &::before
      left: 0
      width: 100%
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)
      animation: line-scan 2s ease-in-out infinite

    &::after
      left: 50%
      transform: translateX(-50%)
      width: 40px
      height: 3px
      top: -1px
      background: rgba(255,255,255,0.5)

  &--bottom
    &::before
      left: 0
      width: 100%
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)
      animation: line-scan 2s ease-in-out 1s infinite

.restart-button
  margin-top: 1.5rem
  position: relative
  display: flex
  align-items: center
  gap: 0.75rem
  padding: 0.75rem 2.5rem
  background: transparent
  border: 1px solid rgba(255,255,255,0.2)
  color: rgba(255,255,255,0.7)
  font-family: 'Rajdhani', sans-serif
  font-weight: 700
  font-size: 0.9rem
  letter-spacing: 0.2em
  text-transform: uppercase
  cursor: pointer
  clip-path: polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)
  transition: all 0.3s ease
  min-height: 44px

  &:hover
    background: rgba(255,255,255,0.08)
    border-color: rgba(255,255,255,0.4)
    color: white

  &__arrow
    font-size: 0.6rem
    transition: transform 0.3s ease

  &:hover &__arrow
    transform: translateX(4px)

@keyframes overlay-in
  from
    opacity: 0
  to
    opacity: 1

@keyframes content-in
  from
    opacity: 0
    transform: translateY(20px) scale(0.95)
  to
    opacity: 1
    transform: translateY(0) scale(1)

@keyframes text-glitch
  0%, 100%
    transform: translateX(0)
  25%
    transform: translateX(-2px)
  75%
    transform: translateX(2px)

@keyframes line-scan
  0%, 100%
    opacity: 0.3
  50%
    opacity: 1
</style>
