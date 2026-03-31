<template>
  <u-app>
    <div class="bey-root">
      <main-scene
        ref="mainSceneRef"
        class="bey-canvas"
        :current-phase="currentPhase"
        :player-config="playerConfig"
        :difficulty="difficulty"
        :arena-type="arenaType"
        :focus-category="focusCategory"
        :qte-engine="qteEngine"
        :cinematic="cinematic"
        @ready="handleReady()"
        @battle-end="handleBattleEnd"
      />

      <!-- 掃描線紋理（全域） -->
      <div class="scanlines" />

      <!-- 角落裝飾 -->
      <div class="corner-deco corner-deco--tl" />
      <div class="corner-deco corner-deco--br" />

      <!-- 返回 -->
      <a href="/" class="back-link">
        <span class="back-link__arrow">&#9664;</span>
        <span class="back-link__text">EXIT</span>
      </a>

      <!-- 標題 -->
      <transition name="title-enter">
        <div v-if="currentPhase === BattlePhase.CONFIGURE" class="title-area">
          <div class="title-area__sub">MECHA ARENA</div>
          <h1 class="title-area__main">BEYBATTLE</h1>
          <div class="title-area__line" />
        </div>
      </transition>

      <!-- QTE 評級 -->
      <transition name="rating-pop">
        <div v-if="showRating" :key="ratingKey" class="rating-popup" :class="`rating-popup--${lastRating}`">
          {{ lastRating.toUpperCase() }}!
        </div>
      </transition>

      <!-- 碰撞閃屏 -->
      <transition name="flash">
        <div v-if="showFlash" class="collision-flash" />
      </transition>

      <!-- 速度線（決戰期） -->
      <div
        v-if="cinematic.speedLineIntensity.value > 0"
        class="speed-lines"
        :style="{ opacity: cinematic.speedLineIntensity.value * 0.6 }"
      />

      <!-- Vignette（激烈期/決戰期） -->
      <div
        v-if="cinematic.vignetteIntensity.value > 0"
        class="battle-vignette"
        :style="{
          boxShadow: `inset 0 0 ${80 * cinematic.vignetteIntensity.value}px ${40 * cinematic.vignetteIntensity.value}px ${cinematic.vignetteColor.value}`,
        }"
      />

      <!-- 戲劇性事件文字 -->
      <transition name="event-text">
        <div
          v-if="cinematic.showEventText.value"
          :key="cinematic.eventTextKey.value"
          class="event-text"
          :style="{ color: cinematic.activeEventColor.value, textShadow: `0 0 40px ${cinematic.activeEventColor.value}, 0 0 80px ${cinematic.activeEventColor.value}` }"
        >
          {{ cinematic.activeEventText.value }}
        </div>
      </transition>

      <!-- ====== 配置階段 ====== -->
      <transition name="panel-slide">
        <div v-if="currentPhase === BattlePhase.CONFIGURE" class="config-panel">
          <div class="config-panel__inner">
            <!-- 頂部區域：手機橫排（雷達圖+設定），桌面直排 -->
            <div class="config-panel__top">
              <div class="config-panel__stats">
                <stats-display :stats="playerStats" :size="120" color="#ef4444" />
              </div>

              <div class="config-panel__settings">
                <!-- 難度 -->
                <div class="config-section">
                  <div class="config-section__label">DIFFICULTY</div>
                  <div class="config-section__row">
                    <button
                      v-for="option in difficultyOptionList"
                      :key="option.value"
                      class="tag-button"
                      :class="{
                        [`tag-button--${option.value}`]: true,
                        'tag-button--active': difficulty === option.value,
                      }"
                      @click="difficulty = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- 場地 -->
                <div class="config-section">
                  <div class="config-section__label">ARENA</div>
                  <div class="config-section__row config-section__row--wrap">
                    <button
                      v-for="type in arenaTypeList"
                      :key="type"
                      class="tag-button"
                      :class="{
                        [`tag-button--arena-${type}`]: true,
                        'tag-button--active': arenaType === type,
                      }"
                      @click="arenaType = type"
                    >
                      {{ getArenaName(type, locale) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 零件 -->
            <div class="config-panel__parts">
              <part-picker @change="handleConfigChange" @focus-category="handleFocusCategory" />
            </div>

            <!-- 開始 -->
            <button class="launch-button" @click="handleStartBattle()">
              <span class="launch-button__text">{{ t('startBattle') }}</span>
              <span class="launch-button__icon">&#9654;&#9654;</span>
            </button>
          </div>
        </div>
      </transition>

      <!-- QTE -->
      <qte-panel
        v-if="isQtePhase"
        :current-stage-name="qteEngine.currentStageName.value"
        :charge-value="qteEngine.chargeValue.value"
        :time-remaining-ratio="qteEngine.timeRemainingRatio.value"
        @confirm="handleQteConfirm()"
      />

      <!-- ====== 戰鬥 HUD ====== -->
      <transition name="hud-slide">
        <div v-if="currentPhase === BattlePhase.BATTLE" class="battle-hud">
          <!-- 玩家 -->
          <div class="hud-bar hud-bar--player">
            <div class="hud-bar__info">
              <span class="hud-bar__name">{{ t('player') }}</span>
              <span class="hud-bar__percent">{{ Math.round(playerSpinPercent) }}</span>
            </div>
            <div class="hud-bar__track">
              <div
                class="hud-bar__fill hud-bar__fill--player"
                :class="{ 'hud-bar__fill--critical': playerSpinPercent <= 30 }"
                :style="{ width: `${playerSpinPercent}%` }"
              />
            </div>
          </div>

          <!-- VS -->
          <div class="hud-vs">VS</div>

          <!-- AI -->
          <div class="hud-bar hud-bar--ai">
            <div class="hud-bar__info hud-bar__info--right">
              <span class="hud-bar__percent">{{ Math.round(aiSpinPercent) }}</span>
              <span class="hud-bar__name">{{ t('ai') }}</span>
            </div>
            <div class="hud-bar__track">
              <div
                class="hud-bar__fill hud-bar__fill--ai"
                :class="{ 'hud-bar__fill--critical': aiSpinPercent <= 30 }"
                :style="{ width: `${aiSpinPercent}%` }"
              />
            </div>
          </div>
        </div>
      </transition>

      <!-- 結果 -->
      <battle-result
        v-if="currentPhase === BattlePhase.RESULT && battleResult"
        :result="battleResult"
        @restart="handleRestart()"
      />

      <div class="version-tag">v{{ version }}</div>
    </div>
  </u-app>
</template>

<script setup lang="ts">
import type { ArenaType, BattleResult as BattleResultType, BeybladeConfig, Difficulty, PartCategory } from './types'
import type { ChargeRating } from './domains/qte/qte-engine'
import { useColorMode } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useFontLoader } from './composables/use-font-loader'
import { useSimpleI18n } from './composables/use-simple-i18n'
import { version } from './constants/version'
import { arenaTypeList, getArenaName } from './domains/arena/arena-builder'
import BattleResult from './domains/battle/battle-result.vue'
import { useBattleManager } from './domains/battle/battle-manager'
import { useCinematicManager } from './domains/battle/cinematic-manager'
import { attackRingPartList, spinTipPartList, weightDiskPartList } from './domains/beyblade/parts'
import { calculateFinalStats } from './domains/beyblade/stats'
import PartPicker from './domains/beyblade/part-picker.vue'
import StatsDisplay from './domains/beyblade/stats-display.vue'
import { useQteEngine } from './domains/qte/qte-engine'
import QtePanel from './domains/qte/qte-panel.vue'
import MainScene from './main-scene.vue'
import { BattlePhase } from './types'

const colorMode = useColorMode()
colorMode.value = 'light'

useFontLoader()

const {
  currentPhase,
  battleResult,
  startQte,
  advanceQte,
  endBattle,
  restart,
} = useBattleManager()

const qteEngine = useQteEngine()
const cinematic = useCinematicManager()

const difficulty = ref<Difficulty>('medium')
const arenaType = ref<ArenaType>('classic')

const focusCategory = ref<PartCategory | null>(null)
function handleFocusCategory(category: PartCategory | null) {
  focusCategory.value = category
}

const playerConfig = ref<BeybladeConfig>({
  attackRing: attackRingPartList[0],
  weightDisk: weightDiskPartList[0],
  spinTip: spinTipPartList[0],
})

const playerStats = computed(() => calculateFinalStats(playerConfig.value))

function handleConfigChange(config: BeybladeConfig) {
  playerConfig.value = config
}

const mainSceneRef = ref<InstanceType<typeof MainScene>>()
const playerSpinPercent = computed(() => mainSceneRef.value?.spinPercentData?.player ?? 100)
const aiSpinPercent = computed(() => mainSceneRef.value?.spinPercentData?.ai ?? 100)

const showRating = ref(false)
const lastRating = ref<ChargeRating>('good')
const ratingKey = ref(0)

const showFlash = ref(false)

let lastPlayerSpin = 100
watch(playerSpinPercent, (value) => {
  const drop = lastPlayerSpin - value
  if (drop > 3 && currentPhase.value === BattlePhase.BATTLE) {
    showFlash.value = true
    setTimeout(() => { showFlash.value = false }, 80)
  }
  lastPlayerSpin = value
})

function triggerRatingPopup(rating: ChargeRating) {
  lastRating.value = rating
  ratingKey.value++
  showRating.value = true
  setTimeout(() => { showRating.value = false }, 800)
}

const isQtePhase = computed(() => [
  BattlePhase.QTE_CHARGE,
  BattlePhase.QTE_AIM,
  BattlePhase.QTE_LAUNCH,
].includes(currentPhase.value))

function handleReady() {}

function handleStartBattle() {
  startQte()
  qteEngine.start()
}

function handleQteConfirm() {
  if (qteEngine.currentStageIndex.value === 0) {
    const value = qteEngine.chargeValue.value
    const rating: ChargeRating = value >= 0.85 ? 'perfect' : value >= 0.75 ? 'great' : 'good'
    triggerRatingPopup(rating)
  }
  qteEngine.confirmStage()
  advanceQte()
}

function handleBattleEnd(result: BattleResultType) {
  endBattle(result)
}

function handleRestart() {
  lastPlayerSpin = 100
  cinematic.reset()
  restart()
}

const { t, locale } = useSimpleI18n({
  'zh-hant': {
    startBattle: '開始戰鬥',
    player: 'P1',
    ai: 'CPU',
    easy: '簡單',
    medium: '中等',
    hard: '困難',
  },
  'en': {
    startBattle: 'LAUNCH',
    player: 'P1',
    ai: 'CPU',
    easy: 'EASY',
    medium: 'MED',
    hard: 'HARD',
  },
} as const)

const difficultyOptionList = computed(() => [
  { value: 'easy' as Difficulty, label: t('easy') },
  { value: 'medium' as Difficulty, label: t('medium') },
  { value: 'hard' as Difficulty, label: t('hard') },
])
</script>

<style lang="sass" scoped>
// ========================
// Design tokens
// ========================
$font-display: 'Orbitron', sans-serif
$font-body: 'Rajdhani', sans-serif
$bg: #060610
$surface: rgba(255,255,255,0.03)
$border: rgba(255,255,255,0.08)
$text-dim: rgba(255,255,255,0.25)
$text-mid: rgba(255,255,255,0.5)
$text-bright: rgba(255,255,255,0.85)
$red: #ef4444
$blue: #3b82f6
$clip-angle: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)

// ========================
// Root
// ========================
.bey-root
  position: fixed
  inset: 0
  background: $bg
  font-family: $font-body
  overflow: hidden

.bey-canvas
  width: 100%
  height: 100%

.scanlines
  position: fixed
  inset: 0
  pointer-events: none
  z-index: 50
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.008) 2px, rgba(255,255,255,0.008) 4px)
  mix-blend-mode: overlay

// ========================
// Corner decorations
// ========================
.corner-deco
  position: fixed
  width: 40px
  height: 40px
  pointer-events: none
  z-index: 40
  opacity: 0.15

  &--tl
    top: 12px
    left: 12px
    border-top: 1px solid white
    border-left: 1px solid white

  &--br
    bottom: 12px
    right: 12px
    border-bottom: 1px solid white
    border-right: 1px solid white

// ========================
// Back link
// ========================
.back-link
  position: fixed
  top: 1rem
  left: 1rem
  z-index: 40
  display: flex
  align-items: center
  gap: 0.4rem
  color: $text-dim
  text-decoration: none
  transition: color 0.3s ease
  font-family: $font-body
  font-weight: 600
  font-size: 0.7rem
  letter-spacing: 0.15em

  &:hover
    color: $text-mid

  &__arrow
    font-size: 0.5rem

// ========================
// Title
// ========================
.title-area
  position: fixed
  top: 1rem
  left: 50%
  transform: translateX(-50%)
  z-index: 10
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.15rem

  &__sub
    font-family: $font-body
    font-weight: 600
    font-size: 0.55rem
    letter-spacing: 0.5em
    color: $text-dim

  &__main
    font-family: $font-display
    font-weight: 900
    font-size: clamp(1.2rem, 4vw, 1.8rem)
    letter-spacing: 0.15em
    color: $text-bright
    text-shadow: 0 0 30px rgba(255,255,255,0.15)

  &__line
    width: 60px
    height: 1px
    margin-top: 0.25rem
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)

// ========================
// Config panel — 手機：底部抽屜，桌面：左側欄
// ========================
.config-panel
  position: fixed
  z-index: 10
  pointer-events: auto

  // 手機（預設）：底部面板
  bottom: 0
  left: 0
  right: 0
  top: auto
  max-height: 55dvh

  // 桌面：左側欄
  @media (min-width: 768px)
    top: 0
    right: auto
    bottom: 0
    max-height: none
    width: 300px

.config-panel__inner
  height: 100%
  display: flex
  flex-direction: column
  gap: 0.75rem
  background: linear-gradient(135deg, rgba(10,10,30,0.95) 0%, rgba(10,10,20,0.85) 100%)
  backdrop-filter: blur(16px)
  overflow-y: auto
  scrollbar-width: none

  // 手機：上邊框 + 頂部圓角 + 適當 padding
  padding: 0.75rem 1rem 1rem
  border-top: 1px solid $border
  border-radius: 16px 16px 0 0

  // 桌面：右邊框 + 無圓角 + 更多頂部 padding
  @media (min-width: 768px)
    padding: 3.5rem 1rem 1rem
    border-top: none
    border-right: 1px solid $border
    border-radius: 0

  &::-webkit-scrollbar
    display: none

.config-panel__top
  display: flex
  gap: 0.75rem
  align-items: flex-start
  flex-shrink: 0

  // 桌面：直排
  @media (min-width: 768px)
    flex-direction: column
    align-items: stretch

.config-panel__stats
  display: flex
  justify-content: center
  flex-shrink: 0

  // 手機：雷達圖縮小
  @media (max-width: 767px)
    :deep(canvas)
      width: 80px !important
      height: 80px !important

.config-panel__settings
  display: flex
  flex-direction: column
  gap: 0.5rem
  flex: 1
  min-width: 0

.config-panel__parts
  flex: 1
  min-height: 0
  overflow-y: auto
  scrollbar-width: none

  &::-webkit-scrollbar
    display: none

// 手機底部面板拖曳指示條
.config-panel__inner::before
  @media (max-width: 767px)
    content: ''
    display: block
    width: 32px
    height: 3px
    margin: 0 auto 0.5rem
    background: rgba(255,255,255,0.15)
    border-radius: 2px
    flex-shrink: 0

// ========================
// Config sections
// ========================
.config-section
  display: flex
  flex-direction: column
  gap: 0.35rem

  &__label
    font-family: $font-body
    font-weight: 700
    font-size: 0.55rem
    letter-spacing: 0.3em
    color: $text-dim

  &__row
    display: flex
    gap: 0.3rem

    &--wrap
      flex-wrap: wrap

// ========================
// Tag buttons (difficulty / arena)
// ========================
.tag-button
  padding: 0.3rem 0.7rem
  font-family: $font-body
  font-weight: 700
  font-size: 0.65rem
  letter-spacing: 0.1em
  color: $text-dim
  background: $surface
  border: 1px solid transparent
  cursor: pointer
  clip-path: $clip-angle
  transition: all 0.2s ease
  min-height: 1.75rem
  user-select: none

  &:hover
    color: $text-mid
    background: rgba(255,255,255,0.06)

  &--active
    border-color: $border

  // Difficulty colors
  &--easy.tag-button--active
    color: #4ade80
    border-color: rgba(74, 222, 128, 0.3)
    background: rgba(74, 222, 128, 0.1)
    text-shadow: 0 0 8px rgba(74, 222, 128, 0.3)

  &--medium.tag-button--active
    color: #facc15
    border-color: rgba(250, 204, 21, 0.3)
    background: rgba(250, 204, 21, 0.1)
    text-shadow: 0 0 8px rgba(250, 204, 21, 0.3)

  &--hard.tag-button--active
    color: #ef4444
    border-color: rgba(239, 68, 68, 0.3)
    background: rgba(239, 68, 68, 0.1)
    text-shadow: 0 0 8px rgba(239, 68, 68, 0.3)

  // Arena colors
  &--arena-classic.tag-button--active
    color: #60a5fa
    border-color: rgba(96, 165, 250, 0.3)
    background: rgba(96, 165, 250, 0.08)

  &--arena-volcano.tag-button--active
    color: #fb923c
    border-color: rgba(251, 146, 60, 0.3)
    background: rgba(251, 146, 60, 0.08)

  &--arena-ice.tag-button--active
    color: #67e8f9
    border-color: rgba(103, 232, 249, 0.3)
    background: rgba(103, 232, 249, 0.08)

  &--arena-void.tag-button--active
    color: #c084fc
    border-color: rgba(192, 132, 252, 0.3)
    background: rgba(192, 132, 252, 0.08)

  &--arena-sakura.tag-button--active
    color: #f9a8d4
    border-color: rgba(249, 168, 212, 0.3)
    background: rgba(249, 168, 212, 0.08)

// ========================
// Launch button
// ========================
.launch-button
  position: relative
  display: flex
  align-items: center
  justify-content: center
  gap: 0.75rem
  width: 100%
  padding: 0.75rem 2rem
  background: rgba(239, 68, 68, 0.15)
  border: 1px solid rgba(239, 68, 68, 0.4)
  color: $red
  font-family: $font-display
  font-weight: 700
  font-size: 0.85rem
  letter-spacing: 0.25em
  cursor: pointer
  clip-path: $clip-angle
  transition: all 0.3s ease
  min-height: 2.75rem
  overflow: hidden

  &::before
    content: ''
    position: absolute
    inset: 0
    background: linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.08), transparent)
    animation: shimmer 3s ease-in-out infinite

  &:hover
    background: rgba(239, 68, 68, 0.25)
    border-color: rgba(239, 68, 68, 0.6)
    text-shadow: 0 0 20px rgba(239, 68, 68, 0.5)

  &:active
    transform: scale(0.97)

  &__text
    position: relative
    z-index: 1

  &__icon
    position: relative
    z-index: 1
    font-size: 0.5rem
    letter-spacing: -0.1em

// ========================
// Battle HUD
// ========================
.battle-hud
  position: fixed
  bottom: 0
  left: 0
  right: 0
  z-index: 10
  pointer-events: none
  display: flex
  align-items: flex-end
  justify-content: center
  gap: 1rem
  padding: 1.25rem
  background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)

.hud-vs
  font-family: $font-display
  font-weight: 900
  font-size: 0.6rem
  letter-spacing: 0.3em
  color: $text-dim
  padding-bottom: 0.4rem

.hud-bar
  flex: 1
  max-width: 240px
  display: flex
  flex-direction: column
  gap: 0.3rem

  &__info
    display: flex
    align-items: baseline
    gap: 0.4rem

    &--right
      flex-direction: row-reverse

  &__name
    font-family: $font-body
    font-weight: 700
    font-size: 0.65rem
    letter-spacing: 0.2em
    color: $text-mid

  &__percent
    font-family: $font-display
    font-weight: 700
    font-size: 0.8rem
    color: $text-bright

  &__track
    height: 4px
    background: rgba(255,255,255,0.06)
    position: relative
    overflow: hidden
    clip-path: polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)

  &__fill
    height: 100%
    transition: width 0.15s ease
    position: relative

    &--player
      background: linear-gradient(90deg, rgba(239,68,68,0.6), $red)

    &--ai
      background: linear-gradient(90deg, $blue, rgba(59,130,246,0.6))
      margin-left: auto

    &--critical
      animation: critical-pulse 0.5s ease-in-out infinite alternate

// ========================
// Rating popup
// ========================
.rating-popup
  position: fixed
  inset: 0
  display: flex
  align-items: center
  justify-content: center
  z-index: 30
  pointer-events: none
  font-family: $font-display
  font-weight: 900
  font-size: clamp(3rem, 12vw, 6rem)
  letter-spacing: 0.1em

  &--perfect
    color: #fbbf24
    text-shadow: 0 0 40px rgba(251, 191, 36, 0.6), 0 0 80px rgba(251, 191, 36, 0.2)

  &--great
    color: #4ade80
    text-shadow: 0 0 40px rgba(74, 222, 128, 0.5), 0 0 80px rgba(74, 222, 128, 0.2)

  &--good
    color: #60a5fa
    text-shadow: 0 0 40px rgba(96, 165, 250, 0.5), 0 0 80px rgba(96, 165, 250, 0.2)

// ========================
// Collision flash
// ========================
.collision-flash
  position: fixed
  inset: 0
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.25) 0%, transparent 70%)
  pointer-events: none
  z-index: 25

// ========================
// Speed lines (決戰期背景)
// ========================
.speed-lines
  position: fixed
  inset: 0
  pointer-events: none
  z-index: 15
  background: repeating-conic-gradient(from 0deg, transparent 0deg, transparent 4deg, rgba(255,255,255,0.04) 4deg, rgba(255,255,255,0.04) 5deg)
  animation: speed-lines-rotate 0.8s linear infinite
  mask-image: radial-gradient(ellipse at center, transparent 20%, black 70%)

@keyframes speed-lines-rotate
  to
    transform: rotate(5deg)

// ========================
// Battle vignette
// ========================
.battle-vignette
  position: fixed
  inset: 0
  pointer-events: none
  z-index: 14
  transition: box-shadow 0.5s ease

// ========================
// Event text (戲劇性事件)
// ========================
.event-text
  position: fixed
  inset: 0
  display: flex
  align-items: center
  justify-content: center
  pointer-events: none
  z-index: 28
  font-family: $font-display
  font-weight: 900
  font-size: clamp(2.5rem, 10vw, 5rem)
  letter-spacing: 0.15em
  user-select: none

.event-text
  &-enter-active
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)
  &-leave-active
    transition: all 0.5s ease-out
  &-enter-from
    opacity: 0
    transform: scale(0.4) translateY(10px)
  &-leave-to
    opacity: 0
    transform: scale(1.2) translateY(-30px)

// ========================
// Version
// ========================
.version-tag
  position: fixed
  bottom: 4px
  right: 8px
  font-family: $font-body
  font-size: 0.5rem
  color: rgba(255,255,255,0.08)
  letter-spacing: 0.1em
  z-index: 5

// ========================
// Animations
// ========================
@keyframes shimmer
  0%, 100%
    transform: translateX(-100%)
  50%
    transform: translateX(100%)

@keyframes critical-pulse
  from
    opacity: 0.5
  to
    opacity: 1

// Transitions
.title-enter
  &-enter-active
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1)
  &-leave-active
    transition: all 0.3s ease
  &-enter-from
    opacity: 0
    transform: translateX(-50%) translateY(-15px)
  &-leave-to
    opacity: 0
    transform: translateX(-50%) translateY(-5px)

.panel-slide
  &-enter-active
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1)
  &-leave-active
    transition: all 0.3s ease

  // 手機：從底部滑入
  &-enter-from
    opacity: 0
    transform: translateY(40px)
  &-leave-to
    opacity: 0
    transform: translateY(20px)

  // 桌面：從左側滑入
  @media (min-width: 768px)
    &-enter-from
      opacity: 0
      transform: translateX(-30px)
    &-leave-to
      opacity: 0
      transform: translateX(-20px)

.hud-slide
  &-enter-active
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1)
  &-leave-active
    transition: all 0.3s ease
  &-enter-from
    opacity: 0
    transform: translateY(20px)
  &-leave-to
    opacity: 0

.rating-pop
  &-enter-active
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)
  &-leave-active
    transition: all 0.5s ease-out
  &-enter-from
    opacity: 0
    transform: scale(0.5)
  &-leave-to
    opacity: 0
    transform: scale(1.3) translateY(-20px)

.flash
  &-enter-active
    transition: opacity 0.02s
  &-leave-active
    transition: opacity 0.12s ease-out
  &-enter-from, &-leave-to
    opacity: 0
</style>
