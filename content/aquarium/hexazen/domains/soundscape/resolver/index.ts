import type { TraitRegion } from '../../block/trait-region'
import { soundscapeRuleList } from './data'
import type { Soundscape } from '../type'

export function resolveSoundscape(traitRegionList: TraitRegion[]) {
  const soundscapeList = soundscapeRuleList.filter((rule) => rule.condition(traitRegionList))

  const result = soundscapeList.reduce((acc, rule) => {
    return rule.transform(acc)
  }, [] as Soundscape[])

  return result
}
