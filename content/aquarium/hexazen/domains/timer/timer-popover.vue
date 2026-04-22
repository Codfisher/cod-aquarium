<template>
  <u-popover
    :ui="{
      content: 'p-0 border-0 bg-transparent shadow-none ring-0',
    }"
    :content="{
      side: 'right',
      sideOffset: 16,
    }"
  >
    <slot
      :is-running="isRunning"
      :is-paused="isPaused"
      :mode="mode"
      :pomodoro-phase="pomodoroPhase"
      :formatted-time="formattedTime"
    />

    <template #content>
      <chamfer-border-card content-class="p-4 space-y-4 w-64 text-gray-700">
        <!-- 模式切換 -->
        <div class="grid grid-cols-2 gap-1.5">
          <base-btn
            :label="t('sleep')"
            :color="mode === 'sleep' ? 'primary' : 'neutral'"
            :variant="mode === 'sleep' ? 'solid' : 'soft'"
            size="sm"
            class="w-full "
            @click="setMode('sleep')"
          />
          <base-btn
            :label="t('pomodoro')"
            :color="mode === 'pomodoro' ? 'primary' : 'neutral'"
            :variant="mode === 'pomodoro' ? 'solid' : 'soft'"
            size="sm"
            class="w-full "
            @click="setMode('pomodoro')"
          />
        </div>

        <!-- 設定區 -->
        <div class="space-y-2.5 ">
          <!-- 睡眠設定 -->
          <template v-if="mode === 'sleep'">
            <div class="grid grid-cols-4 gap-1">
              <base-btn
                v-for="preset in SLEEP_PRESET_LIST"
                :key="preset"
                :label="`${preset}`"
                size="xs"
                :color="sleepMinutes === preset ? 'primary' : 'neutral'"
                :variant="sleepMinutes === preset ? 'soft' : 'ghost'"
                @click="selectSleepPreset(preset)"
              />
            </div>

            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 shrink-0 w-10">{{ t('custom') }}</span>
              <u-input
                v-model.number="customSleepMinutes"
                type="number"
                size="xs"
                :min="1"
                :max="999"
                class="flex-1 min-w-0"
                @change="applyCustomSleep"
              />
              <span class="text-xs text-gray-400 shrink-0">{{ t('min') }}</span>
            </div>
          </template>

          <!-- 番茄鐘設定 -->
          <template v-else>
            <div class="grid grid-cols-3 gap-1">
              <base-btn
                v-for="preset in POMODORO_PRESET_LIST"
                :key="`${preset.workMinutes}/${preset.breakMinutes}`"
                :label="`${preset.workMinutes}/${preset.breakMinutes}`"
                size="xs"
                :color="workMinutes === preset.workMinutes && breakMinutes === preset.breakMinutes ? 'primary' : 'neutral'"
                :variant="workMinutes === preset.workMinutes && breakMinutes === preset.breakMinutes ? 'soft' : 'ghost'"
                @click="selectPomodoroPreset(preset)"
              />
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 shrink-0 w-10">{{ t('work') }}</span>
                <u-input
                  v-model.number="workMinutes"
                  type="number"
                  size="xs"
                  :min="1"
                  :max="999"
                  :disabled="isRunning || isPaused"
                  class="flex-1 min-w-0"
                />
                <span class="text-xs text-gray-400 shrink-0">{{ t('min') }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 shrink-0 w-10">{{ t('break') }}</span>
                <u-input
                  v-model.number="breakMinutes"
                  type="number"
                  size="xs"
                  :min="1"
                  :max="999"
                  :disabled="isRunning || isPaused"
                  class="flex-1 min-w-0"
                />
                <span class="text-xs text-gray-400 shrink-0">{{ t('min') }}</span>
              </div>
            </div>
          </template>
        </div>

        <!-- 倒數顯示 -->
        <transition name="timer-counter">
          <div
            v-if="isRunning || isPaused"
            class="space-y-2"
          >
            <u-separator
              size="xs"
              :ui="{ border: 'border-gray-100' }"
            />

            <div class="text-center py-1">
              <div class="flex items-center justify-center gap-1.5 text-xs text-gray-400 min-h-4 mb-0.5">
                <template v-if="mode === 'pomodoro'">
                  <div
                    class="w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-500"
                    :class="pomodoroPhase === 'work' ? 'bg-orange-400' : 'bg-green-400'"
                  />
                  <span>{{ pomodoroPhase === 'work' ? t('working') : t('resting') }}</span>
                  <template v-if="isPaused">
                    <span class="text-gray-200">·</span>
                    <span>{{ t('paused') }}</span>
                  </template>
                </template>
                <template v-else-if="isPaused">
                  <span>{{ t('paused') }}</span>
                </template>
              </div>

              <div
                class="text-4xl font-mono font-bold tracking-widest transition-colors duration-500"
                :class="{
                  'text-blue-500': mode === 'sleep',
                  'text-orange-500': mode === 'pomodoro' && pomodoroPhase === 'work',
                  'text-green-500': mode === 'pomodoro' && pomodoroPhase === 'break',
                  'opacity-50': isPaused,
                }"
              >
                {{ formattedTime }}
              </div>
            </div>
          </div>
        </transition>

        <!-- 控制按鈕 -->
        <div class="flex items-center gap-1.5">
          <!-- 未開始：全寬主要按鈕 -->
          <template v-if="!isRunning && !isPaused">
            <base-btn
              :label="t('start')"
              color="primary"
              variant="solid"
              size="sm"
              class="flex-1"
              @click="start()"
            />
          </template>

          <!-- 進行中：主動作 + 縮小的破壞性按鈕 -->
          <template v-else-if="isRunning">
            <base-btn
              v-if="mode === 'pomodoro'"
              :label="t('pause')"
              color="neutral"
              variant="solid"
              size="sm"
              class="flex-1"
              @click="pause()"
            />
            <base-btn
              :label="t('stop')"
              color="error"
              variant="ghost"
              size="sm"
              :class="mode === 'pomodoro' ? 'shrink-0' : 'flex-1'"
              @click="stop()"
            />
          </template>

          <!-- 暫停中：恢復優先，停止退場 -->
          <template v-else>
            <base-btn
              :label="t('resume')"
              color="primary"
              variant="solid"
              size="sm"
              class="flex-1"
              @click="resume()"
            />
            <base-btn
              :label="t('stop')"
              color="error"
              variant="ghost"
              size="sm"
              class="shrink-0"
              @click="stop()"
            />
          </template>
        </div>
      </chamfer-border-card>
    </template>
  </u-popover>
</template>

<script setup lang="ts">
import type { PomodoroPhase, PomodoroPreset } from './type'
import { ref } from 'vue'
import BaseBtn from '../../components/base-btn.vue'
import ChamferBorderCard from '../../components/chamfer-border-card.vue'
import { useSimpleI18n } from '../../composables/use-simple-i18n'
import { POMODORO_PRESET_LIST, SLEEP_PRESET_LIST } from './type'
import { useTimer } from './use-timer'

const volume = defineModel<number>('volume', { required: true })
const muted = defineModel<boolean>('muted', { required: true })

function playBeep(frequency: number, duration: number, count: number, intervalMs: number) {
  const audioContext = new AudioContext()
  for (let index = 0; index < count; index++) {
    setTimeout(() => {
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.frequency.value = frequency
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)
      oscillator.start()
      oscillator.stop(audioContext.currentTime + duration)
    }, index * intervalMs)
  }
  const totalDuration = intervalMs * (count - 1) + duration * 1000
  setTimeout(() => audioContext.close(), totalDuration + 300)
}

function handleSleepEnd() {
  const originalVolume = volume.value
  const steps = 30
  let currentStep = 0
  const fadeInterval = setInterval(() => {
    currentStep++
    volume.value = Math.max(0, originalVolume * (1 - currentStep / steps))
    if (currentStep >= steps) {
      clearInterval(fadeInterval)
      muted.value = true
    }
  }, 100)
}

function handlePhaseChange(nextPhase: PomodoroPhase) {
  if (nextPhase === 'break') {
    playBeep(880, 0.6, 3, 700)
  }
  else {
    playBeep(523, 1.2, 2, 1500)
  }
}

const {
  mode,
  isRunning,
  isPaused,
  formattedTime,
  pomodoroPhase,
  sleepMinutes,
  workMinutes,
  breakMinutes,
  start,
  pause,
  resume,
  stop,
  setMode,
} = useTimer({
  onSleepEnd: handleSleepEnd,
  onPhaseChange: handlePhaseChange,
})

const customSleepMinutes = ref(sleepMinutes.value)

function selectSleepPreset(minutes: typeof SLEEP_PRESET_LIST[number]) {
  sleepMinutes.value = minutes
  customSleepMinutes.value = minutes
}

function applyCustomSleep() {
  const raw = Number(customSleepMinutes.value)
  const value = Number.isNaN(raw) ? 30 : Math.max(1, Math.min(999, raw))
  customSleepMinutes.value = value
  sleepMinutes.value = value
}

function selectPomodoroPreset(preset: PomodoroPreset) {
  workMinutes.value = preset.workMinutes
  breakMinutes.value = preset.breakMinutes
}

const { t } = useSimpleI18n({
  'zh-hant': {
    sleep: '睡眠',
    pomodoro: '番茄鐘',
    custom: '自訂',
    min: '分',
    work: '工作',
    break: '休息',
    working: '工作中',
    resting: '休息中',
    paused: '已暫停',
    start: '開始',
    pause: '暫停',
    resume: '繼續',
    stop: '停止',
  },
  'en': {
    sleep: 'Sleep',
    pomodoro: 'Pomodoro',
    custom: 'Custom',
    min: 'min',
    work: 'Work',
    break: 'Break',
    working: 'Working',
    resting: 'Resting',
    paused: 'Paused',
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
  },
} as const)
</script>

<style scoped lang="sass">
.timer-counter
  &-enter-active, &-leave-active
    transition: opacity 0.3s, transform 0.3s
  &-enter-from, &-leave-to
    opacity: 0
    transform: translateY(-4px)
</style>
