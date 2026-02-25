import type { TraitRegion } from '../../block/trait-region'
import type { Block } from '../../block/type'
import type { Soundscape } from '../type'
import { pipe, reduce } from 'remeda'
import { soundscapeRuleList } from './data'

export function resolveSoundscape(
  data: {
    traitRegionList: TraitRegion[],
    blockMap: Map<string, Block>,
  }
) {
  const validRuleList = soundscapeRuleList.filter((rule) =>
    rule.predicate(data)
  )

  const soundscapeList = pipe(
    validRuleList,
    reduce((acc, rule) => {
      return rule.transform(acc)
    }, [] as Soundscape[]),
    // uniqueBy(prop('type')),
  )

  return soundscapeList
}
