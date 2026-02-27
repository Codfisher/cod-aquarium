/**
 * 將多個 block 組裝後可產生 cluster
 */

import type { Weather } from '../../../types'
import type { TraitRegion } from '../../block/trait-region'
import type { Block } from '../../block/type'
import type { Soundscape, SoundscapeType } from '../type'
import { concat, filter, isTruthy, pipe, prop, sumBy } from 'remeda'
import { blockDefinitions } from '../../block/builder/data'

interface SoundscapeRule {
  type: SoundscapeType;
  predicate: (data: {
    traitRegionList: TraitRegion[];
    blockMap: Map<string, Block>;
    weather?: Weather;
  }) => boolean;
  transform: (soundscapeList: Soundscape[]) => Soundscape[];
}

let idCounter = 0
function getId() {
  return idCounter++
}

export const soundscapeRuleList: SoundscapeRule[] = [
  /** 風吹樹梢 */
  {
    type: 'rustle',
    // tree size >= 3
    predicate: ({ traitRegionList, weather }) => {
      if (weather === 'rain') {
        return false
      }

      return [
        traitRegionList.some((traitRegion) => traitRegion.trait === 'tree' && traitRegion.size >= 3),
      ].some(isTruthy)
    },
    transform: concat([{
      id: getId(),
      type: 'rustle',
      mode: { value: 'loop' },
      soundList: [
        {
          src: 'hexazen/sounds/rustle-tree.mp3',
          volume: 0.3,
        },
      ],
    }]),
  },
  /** 營火 */
  {
    type: 'campfire',
    // 有 campfire
    predicate({ traitRegionList }) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'campfire')
    },
    transform: concat([
      {
        id: getId(),
        type: 'campfire',
        mode: { value: 'loop' },
        soundList: [
          {
            src: 'hexazen/sounds/campfire.mp3',
            volume: 1,
          },
        ],
      },
    ]),
  },

  /** 蟲鳴 */
  {
    type: 'insect',
    // grass size >= 4
    predicate({ traitRegionList, weather }) {
      if (weather === 'rain') {
        return false
      }

      return traitRegionList.some((traitRegion) => traitRegion.trait === 'grass' && traitRegion.size >= 4)
    },
    transform: concat([
      {
        id: getId(),
        type: 'insect',
        mode: { value: 'interval' },
        soundList: [
          {
            src: 'hexazen/sounds/insect.mp3',
            volume: 0.1,
          },
          {
            src: 'hexazen/sounds/insect-cricket.mp3',
            volume: 0.1,
          },
          {
            src: 'hexazen/sounds/insect-dark-bush-cricket.mp3',
            volume: 0.1,
          },
        ],
      },
    ]),
  },

  /** 鳥叫 */
  {
    type: 'bird',
    // tree >= 6
    predicate({ traitRegionList, weather }) {
      if (weather === 'rain') {
        return false
      }

      return traitRegionList.some((traitRegion) => traitRegion.trait === 'tree' && traitRegion.size >= 6)
    },
    transform: concat([
      {
        id: getId(),
        type: 'bird',
        mode: { value: 'interval' },
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
    predicate({ traitRegionList, blockMap }) {
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
        id: getId(),
        type: 'frog',
        mode: { value: 'interval' },
        soundList: [
          {
            src: 'hexazen/sounds/frog.mp3',
            volume: 0.2,
          },
          {
            src: 'hexazen/sounds/frog-common-toad.mp3',
          },
          {
            src: 'hexazen/sounds/frog-chorus-of-grey-tree-frog-and-green-frog.mp3',
            volume: 0.2,
          },
        ],
      },
    ]),
  },

  /** 獸鳴 */
  {
    type: 'beast',
    // tree >= 10
    predicate({ traitRegionList, weather }) {
      if (weather === 'rain') {
        return false
      }

      return traitRegionList.some((traitRegion) => traitRegion.trait === 'tree' && traitRegion.size >= 10)
    },
    transform: concat([
      {
        id: getId(),
        type: 'beast',
        mode: { value: 'interval' },
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
    predicate({ traitRegionList }) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'river' && traitRegion.size >= 2)
    },
    transform: concat([
      {
        id: getId(),
        type: 'river',
        mode: { value: 'loop' },
        soundList: [
          {
            src: 'hexazen/sounds/river-fast-flowing.mp3',
            volume: 0.1,
          },
        ],
      },
    ]),
  },

  /** 建築 */
  {
    type: 'building',
    // building 總和 size >= 5
    predicate({ traitRegionList }) {
      const totalSize = pipe(
        traitRegionList,
        filter(({ trait }) => trait === 'building'),
        sumBy(prop('size')),
      )
      return totalSize >= 5
    },
    transform: concat([
      {
        id: getId(),
        type: 'building',
        mode: { value: 'interval' },
        soundList: [
          {
            src: 'hexazen/sounds/building-market.mp3',
            volume: 0.1,
          },
          {
            src: 'hexazen/sounds/building-british-museum.mp3',
            volume: 0.1,
          },
        ],
      },
    ]),
  },

  /** 海 */
  {
    type: 'ocean',
    // water size >= 15
    predicate({ traitRegionList }) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'water' && traitRegion.size >= 15)
    },
    transform: concat([
      {
        id: getId(),
        type: 'ocean',
        mode: { value: 'loop' },
        soundList: [
          {
            src: 'hexazen/sounds/ocean.mp3',
            volume: 0.3,
          },
        ],
      },
    ]),
  },
  {
    // 海岸
    type: 'ocean',
    // water size >= 15，且有岸
    predicate({ traitRegionList }) {
      return [
        traitRegionList.some((traitRegion) => traitRegion.trait === 'water' && traitRegion.size >= 15),
        traitRegionList.some((traitRegion) => traitRegion.trait !== 'water'),
      ].every(isTruthy)
    },
    transform: concat([
      {
        id: getId(),
        type: 'ocean',
        mode: { value: 'loop' },
        soundList: [
          {
            src: 'hexazen/sounds/ocean-coastal.mp3',
            volume: 0.4,
          },
        ],
      },
    ]),
  },
  {
    // 海豚
    type: 'ocean',
    // water size >= 15
    predicate({ traitRegionList, weather }) {
      if (weather === 'rain') {
        return false
      }

      return traitRegionList.some((traitRegion) => traitRegion.trait === 'water' && traitRegion.size >= 15)
    },
    transform: concat([
      {
        id: getId(),
        type: 'ocean',
        mode: { value: 'interval' },
        soundList: [
          {
            src: 'hexazen/sounds/ocean-bottle-nosed-dolphin.mp3',
            volume: 0.1,
          },
          {
            src: 'hexazen/sounds/ocean-bottle-nosed-dolphin-2.mp3',
            volume: 0.1,
          },
        ],
      },
    ]),
  },

  /** 高山 */
  {
    // 強冷風
    type: 'alpine',
    // alpine size >= 10
    predicate({ traitRegionList }) {
      return traitRegionList.some((traitRegion) => traitRegion.trait === 'alpine' && traitRegion.size >= 10)
    },
    transform: concat([
      {
        id: getId(),
        type: 'alpine',
        mode: { value: 'loop' },
        soundList: [
          {
            src: 'hexazen/sounds/alpine-sinister-wind.mp3',
            volume: 0.1,
          },
        ],
      },
    ]),
  },
  {
    // 高山雪藏雞
    type: 'alpine',
    // alpine size >= 10
    predicate({ traitRegionList, weather }) {
      if (weather === 'rain') {
        return false
      }

      return traitRegionList.some((traitRegion) => traitRegion.trait === 'alpine' && traitRegion.size >= 10)
    },
    transform: concat([
      {
        id: getId(),
        type: 'alpine',
        mode: { value: 'interval' },
        soundList: [
          {
            src: 'hexazen/sounds/alpine-tibetan-snowcock.mp3',
            volume: 0.1,
          },
        ],
      },
    ]),
  },

  /** 雨 */
  {
    // 建築內的雨
    type: 'rain',
    predicate({ traitRegionList, weather }) {
      if (weather !== 'rain') {
        return false
      }

      return traitRegionList.some((traitRegion) => traitRegion.trait === 'building' && traitRegion.size >= 5)
    },
    transform: concat([
      {
        id: getId(),
        type: 'rain',
        mode: { value: 'loop' },
        soundList: [
          {
            src: 'hexazen/sounds/rain-roof.mp3',
            volume: 0.3,
          },
        ],
      },
    ]),
  },
  {
    // 草地的雨
    type: 'rain',
    predicate({ weather }) {
      return weather === 'rain'
    },
    transform: concat([
      {
        id: getId(),
        type: 'rain',
        mode: { value: 'loop' },
        soundList: [
          {
            src: 'hexazen/sounds/rain-grassland.mp3',
            volume: 1,
          },
        ],
      },
    ]),
  },
  {
    // 森林的雨
    type: 'rain',
    predicate({ traitRegionList, weather }) {
      if (weather !== 'rain') {
        return false
      }

      return traitRegionList.some((traitRegion) => traitRegion.trait === 'tree' && traitRegion.size >= 2)
    },
    transform: concat([
      {
        id: getId(),
        type: 'rain',
        mode: { value: 'loop' },
        soundList: [
          {
            src: 'hexazen/sounds/rain-foliage.mp3',
            volume: 0.4,
          },
        ],
      },
    ]),
  },
  {
    // 雷聲
    type: 'rain',
    predicate({ weather }) {
      return weather === 'rain'
    },
    transform: concat([
      {
        id: getId(),
        type: 'rain',
        mode: {
          value: 'interval',
          range: [10, 30],
        },
        soundList: [
          { src: 'hexazen/sounds/thunder.mp3', volume: 0.1 },
          { src: 'hexazen/sounds/thunder-2.mp3', volume: 0.1 },
        ],
      },
    ]),
  },
]
