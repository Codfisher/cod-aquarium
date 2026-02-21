import type { soundscapeRuleList } from './resolver/data'

export type SoundscapeType = (typeof soundscapeRuleList)[number]['type']

interface Sound {
  src: string
  volume?: number
}

export interface Soundscape {
  type: SoundscapeType
  soundList: Sound[]
}