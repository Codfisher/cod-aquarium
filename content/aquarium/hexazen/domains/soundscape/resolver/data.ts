/**
 * 將多個 block 組裝後可產生 cluster
 */

import type { TraitRegion } from '../../block/trait-region'
import type { Block } from '../../block/type'
import type { Soundscape, SoundscapeType } from '../type'

interface SoundscapeRule {
  type: SoundscapeType;
  condition: (
    traitRegionList: TraitRegion[],
    blockMap: Map<string, Block>
  ) => boolean;
  transform: (soundscapeList: Soundscape[]) => Soundscape[];
}

export const soundscapeRuleList: SoundscapeRule[] = [
  /** 草地 */
  {
    type: 'grass',
    // 有任何 grass size >= 2
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'grass' && traitRegion.size >= 2)
    },
    transform(result) {
      result.push({
        type: 'grass',
        mode: 'loop',
        soundList: [
          {
            src: 'hexazen/sounds/grass.mp3',
          },
        ],
      })

      return result
    },
  },
  /** 蟲鳴 */
  {
    type: 'insect',
    condition(traitRegionList) {
      return true
    },
    transform(result) {
      return result
    },
  },

  /** 鳥叫 */
  {
    type: 'bird',
    condition(traitRegionList) {
      return true
    },
    transform(result) {
      return result
    },
  },

  /** 蛙鳴 */
  {
    type: 'frog',
    condition(traitRegionList) {
      return true
    },
    transform(result) {
      result.push({
        type: 'frog',
        mode: 'interval',
        soundList: [
          {
            src: 'hexazen/sounds/frog.mp3',
          },
        ],
      })

      return result
    },
  },

  /** 獸鳴 */
  {
    type: 'beast',
    condition(traitRegionList) {
      return true
    },
    transform(result) {
      return result
    },
  },
]
