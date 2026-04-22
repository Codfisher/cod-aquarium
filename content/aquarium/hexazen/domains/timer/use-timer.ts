import { computed, onUnmounted, ref } from 'vue'
import type { PomodoroPhase, TimerMode } from './type'

interface UseTimerOptions {
  onSleepEnd: () => void
  onPhaseChange: (nextPhase: PomodoroPhase) => void
}

export function useTimer({ onSleepEnd, onPhaseChange }: UseTimerOptions) {
  const mode = ref<TimerMode>('sleep')
  const isRunning = ref(false)
  const remainingSeconds = ref(0)
  const pomodoroPhase = ref<PomodoroPhase>('work')
  const sleepMinutes = ref(30)
  const workMinutes = ref(25)
  const breakMinutes = ref(5)

  let tickIntervalId: ReturnType<typeof setInterval> | null = null
  let endTimestamp: number | null = null

  const formattedTime = computed(() => {
    const minutes = Math.floor(remainingSeconds.value / 60)
    const seconds = remainingSeconds.value % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  })

  const isPaused = computed(() => !isRunning.value && remainingSeconds.value > 0)

  function startTick() {
    if (tickIntervalId)
      clearInterval(tickIntervalId)

    endTimestamp = Date.now() + remainingSeconds.value * 1000

    tickIntervalId = setInterval(() => {
      const remaining = Math.ceil((endTimestamp! - Date.now()) / 1000)
      if (remaining <= 0) {
        remainingSeconds.value = 0
        handleEnd()
        return
      }
      remainingSeconds.value = remaining
    }, 200)
  }

  function handleEnd() {
    if (tickIntervalId) {
      clearInterval(tickIntervalId)
      tickIntervalId = null
    }
    endTimestamp = null

    if (mode.value === 'sleep') {
      isRunning.value = false
      remainingSeconds.value = 0
      onSleepEnd()
    }
    else {
      const nextPhase: PomodoroPhase = pomodoroPhase.value === 'work' ? 'break' : 'work'
      pomodoroPhase.value = nextPhase
      onPhaseChange(nextPhase)
      remainingSeconds.value = (nextPhase === 'work' ? workMinutes.value : breakMinutes.value) * 60
      startTick()
    }
  }

  function start() {
    pomodoroPhase.value = 'work'
    remainingSeconds.value = mode.value === 'sleep'
      ? sleepMinutes.value * 60
      : workMinutes.value * 60
    isRunning.value = true
    startTick()
  }

  function pause() {
    isRunning.value = false
    if (tickIntervalId) {
      clearInterval(tickIntervalId)
      tickIntervalId = null
    }
    endTimestamp = null
  }

  function resume() {
    isRunning.value = true
    startTick()
  }

  function stop() {
    pause()
    remainingSeconds.value = 0
    pomodoroPhase.value = 'work'
  }

  function setMode(newMode: TimerMode) {
    stop()
    mode.value = newMode
  }

  onUnmounted(() => {
    if (tickIntervalId)
      clearInterval(tickIntervalId)
  })

  return {
    mode,
    isRunning,
    isPaused,
    remainingSeconds,
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
  }
}
