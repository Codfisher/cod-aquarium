/**
 * 將多個 block 組裝後可產生 cluster
 */

import { TraitRegion } from "../../block/trait-region";
import { Soundscape } from "../type";

interface SoundscapeRule {
  type: string;
  condition: (traitRegionList: TraitRegion[]) => boolean;
  transform: (soundscapeList: Soundscape[]) => Soundscape[];
}

export const soundscapeRuleList = [
  /** 草地 */
  {
    type: 'grass',
    /** 有任何 grass */
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'grass')
    },
    transform(result) {

      result.push({
        type: 'grass',
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
] as const satisfies SoundscapeRule[]
