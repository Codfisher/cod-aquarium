import type { Block } from '../../block/type'
import type { Soundscape } from '../type'
import { pipe, prop, reduce, uniqueBy } from 'remeda'
import { calcTraitRegionList } from '../../block/trait-region'
import { soundscapeRuleList } from './data'

export function resolveSoundscape(
  blockMap: Map<string, Block>,
) {
  const traitRegionList = calcTraitRegionList(blockMap)

  const soundscapeList = soundscapeRuleList.filter((rule) => rule.condition(traitRegionList, blockMap))

  const result = pipe(
    soundscapeList,
    reduce((acc, rule) => {
      return rule.transform(acc)
    }, [] as Soundscape[]),
    // uniqueBy(prop('type')),
  )

  return result
}
