/**
 * 將多個 block 組裝後可產生 cluster
 */

import type { TraitRegion } from '../../block/trait-region'
import type { Block } from '../../block/type'
import type { Soundscape, SoundscapeType } from '../type'
import { concat } from 'remeda'
import { blockDefinitions } from '../../block/builder/data'

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
    // 有任何 grass
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'grass')
    },
    transform: concat([{
      type: 'grass',
      mode: 'loop',
      soundList: [
        {
          src: 'hexazen/sounds/grass.mp3',
        },
      ],
    }]),
  },
  /** 蟲鳴 */
  {
    type: 'insect',
    // 有任何 grass size >= 3
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'grass' && traitRegion.size >= 3)
    },
    transform: concat([
      {
        type: 'insect',
        mode: 'loop',
        soundList: [
          {
            src: 'hexazen/sounds/insect.mp3',
            volume: 0.5,
          },
        ],
      },
    ]),
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
    condition(traitRegionList, blockMap) {
      // 找出所有 water TraitRegion
      const waterRegionList = traitRegionList.filter(
        (traitRegion) => traitRegion.trait === 'water',
      )
      // 對每個 water 格，檢查 6 個鄰格
      for (const waterRegion of waterRegionList) {
        for (const [, waterHex] of waterRegion.hexMap) {
          for (let direction = 0; direction < 6; direction++) {
            const neighborHex = waterHex.neighbor(direction)
            const neighborBlock = blockMap.get(neighborHex.key())
            if (!neighborBlock)
              continue // 鄰格沒有放 block，跳過
            // 鄰格有 block 且不帶 water trait → 符合條件

            const isNotWater = !blockDefinitions[neighborBlock.type].traitList.includes('water')

            if (isNotWater)
              return true
          }
        }
      }
      return false
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
