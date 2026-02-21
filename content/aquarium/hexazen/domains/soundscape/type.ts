import type { soundscapeRuleList } from './resolver/data'

export type SoundscapeType = (typeof soundscapeRuleList)[number]['type']
