export type TimerMode = 'sleep' | 'pomodoro'
export type PomodoroPhase = 'work' | 'break'

export interface PomodoroPreset {
  workMinutes: number
  breakMinutes: number
}

export const SLEEP_PRESET_LIST = [15, 30, 60, 90] as const

export const POMODORO_PRESET_LIST: readonly PomodoroPreset[] = [
  { workMinutes: 25, breakMinutes: 5 },
  { workMinutes: 50, breakMinutes: 10 },
  { workMinutes: 90, breakMinutes: 20 },
]
