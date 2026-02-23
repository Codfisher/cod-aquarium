/**
 * 將多個 block 組裝後可產生 cluster
 */

import type { TraitRegion } from '../../block/trait-region'
import type { Block } from '../../block/type'
import type { Soundscape, SoundscapeType } from '../type'
import { concat, isTruthy } from 'remeda'
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
  /** 風吹樹梢 */
  {
    type: 'rustle',
    // tree size >= 2
    condition: (traitRegionList) => [
      traitRegionList.some((traitRegion) => traitRegion.trait === 'tree' && traitRegion.size >= 2),
    ].some(isTruthy),
    transform: concat([{
      type: 'rustle',
      mode: 'loop',
      soundList: [
        {
          src: 'hexazen/sounds/rustle-tree.mp3',
          volume: 0.8,
        },
      ],
    }]),
  },

  /** 蟲鳴 */
  {
    type: 'insect',
    // grass size >= 3
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'grass' && traitRegion.size >= 3)
    },
    transform: concat([
      {
        type: 'insect',
        mode: 'interval',
        soundList: [
          {
            src: 'hexazen/sounds/insect.mp3',
            volume: 0.2,
          },
          {
            src: 'hexazen/sounds/insect-cricket.mp3',
            volume: 0.2,
          },
          {
            src: 'hexazen/sounds/insect-dark-bush-cricket.mp3',
            volume: 0.2,
          },
        ],
      },
    ]),
  },

  /** 鳥叫 */
  {
    type: 'bird',
    // tree >= 5
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'tree' && traitRegion.size >= 5)
    },
    transform: concat([
      {
        type: 'bird',
        mode: 'interval',
        soundList: [
          {
            src: 'hexazen/sounds/bird-scottish-crossbill.mp3',
          },
          {
            src: 'hexazen/sounds/bird-blackbird.mp3',
          },
          {
            src: 'hexazen/sounds/bird-moorhen.mp3',
          },
        ],
      },
    ]),
  },

  /** 蛙鳴 */
  {
    type: 'frog',
    // 任意 water 旁至少有 5 個非 water
    condition(traitRegionList, blockMap) {
      // 找出所有 water TraitRegion
      const waterRegionList = traitRegionList.filter(
        (traitRegion) => traitRegion.trait === 'water',
      )

      for (const waterRegion of waterRegionList) {
        for (const [, waterHex] of waterRegion.hexMap) {
          let nonWaterCount = 0

          // 對每個 water 格，檢查 6 個鄰格
          for (let direction = 0; direction < 6; direction++) {
            const neighborHex = waterHex.neighbor(direction)
            const neighborBlock = blockMap.get(neighborHex.key())

            // 鄰格沒有放 block，跳過
            if (!neighborBlock)
              continue

            // 鄰格有 block 且不帶 water trait
            const isNotWater = !blockDefinitions[neighborBlock.type].traitList.includes('water')

            if (isNotWater) {
              nonWaterCount++

              if (nonWaterCount >= 5) {
                return true
              }
            }
          }
        }
      }

      return false
    },
    transform: concat([
      {
        type: 'frog',
        mode: 'interval',
        soundList: [
          {
            src: 'hexazen/sounds/frog.mp3',
            volume: 0.5,
          },
          {
            src: 'hexazen/sounds/frog-common-toad.mp3',
          },
          {
            src: 'hexazen/sounds/frog-burrowing-toad.mp3',
            volume: 0.5,
          },
        ],
      },
    ]),
  },

  /** 獸鳴 */
  {
    type: 'beast',
    // tree >= 10
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'tree' && traitRegion.size >= 10)
    },
    transform: concat([
      {
        type: 'beast',
        mode: 'interval',
        soundList: [
          {
            src: 'hexazen/sounds/beast-american-pika.mp3',
          },
        ],
      },
    ]),
  },

  /** 河流 */
  {
    type: 'river',
    // 任意 river size >= 2
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'river' && traitRegion.size >= 2)
    },
    transform: concat([
      {
        type: 'river',
        mode: 'loop',
        soundList: [
          {
            src: 'hexazen/sounds/river-fast-flowing.mp3',
            volume: 0.8,
          },
        ],
      },
    ]),
  },

  /** 建築 */
  {
    type: 'building',
    // 任意 building size >= 5
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'building' && traitRegion.size >= 5)
    },
    transform: concat([
      {
        type: 'building',
        mode: 'interval',
        soundList: [
          {
            src: 'hexazen/sounds/building-market.mp3',
            volume: 0.5,
          },
          {
            src: 'hexazen/sounds/building-british-museum.mp3',
            volume: 0.5,
          },
        ],
      },
    ]),
  },

  /** 海 */
  {
    type: 'ocean',
    // water size >= 15
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'water' && traitRegion.size >= 15)
    },
    transform: concat([
      {
        type: 'ocean',
        mode: 'loop',
        soundList: [
          {
            src: 'hexazen/sounds/ocean.mp3',
            volume: 0.5,
          },
        ],
      },
    ]),
  },
  {
    /** 海岸 */
    type: 'ocean',
    // water size >= 15，且有岸
    condition(traitRegionList) {
      return [
        traitRegionList.some((traitRegion) => traitRegion.trait === 'water' && traitRegion.size >= 15),
        traitRegionList.some((traitRegion) => traitRegion.trait !== 'water'),
      ].every(isTruthy)
    },
    transform: concat([
      {
        type: 'ocean',
        mode: 'loop',
        soundList: [
          {
            src: 'hexazen/sounds/ocean-coastal.mp3',
            volume: 0.8,
          },
        ],
      },
    ]),
  },
  {
    type: 'ocean',
    // water size >= 15
    condition(traitRegionList) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'water' && traitRegion.size >= 15)
    },
    transform: concat([
      {
        type: 'ocean',
        mode: 'interval',
        soundList: [
          {
            src: 'hexazen/sounds/ocean-bottle-nosed-dolphin.mp3',
            volume: 0.3,
          },
          {
            src: 'hexazen/sounds/ocean-bottle-nosed-dolphin-2.mp3',
            volume: 0.3,
          },
        ],
      },
    ]),
  },
]
