import type { GameProgress } from './reward-storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rewardDefinitionList, rewardIdList } from './reward-registry'
import {
  equipAccessory,
  loadGameProgress,
  saveGameProgress,
  unequipAccessory,
} from './reward-storage'

/** node 環境沒有 localStorage，用最小可用的替身頂上 */
function stubLocalStorage(initialText?: string) {
  const storageMap = new Map<string, string>()
  if (initialText !== undefined) {
    storageMap.set('fish-diorama-game-progress', initialText)
  }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageMap.set(key, value)
    },
    removeItem: (key: string) => {
      storageMap.delete(key)
    },
  })
  return storageMap
}

function createProgress(overrides: Partial<GameProgress> = {}): GameProgress {
  return {
    bestScoreMap: {},
    unlockedRewardIdList: [],
    equippedRewardIdList: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('穿戴配件', () => {
  it('未解鎖的配件穿不上去', () => {
    const progress = createProgress()
    expect(equipAccessory(progress, 'crayonHat').equippedRewardIdList).toHaveLength(0)
  })

  it('重複穿上同一件不會變成兩件', () => {
    const progress = createProgress({
      unlockedRewardIdList: ['crayonHat'],
      equippedRewardIdList: ['crayonHat'],
    })
    expect(equipAccessory(progress, 'crayonHat').equippedRewardIdList).toEqual(['crayonHat'])
  })

  it('每件配件各佔一個部位，全部可以同時穿上', () => {
    // 互斥只該發生在真的搶同一個部位時。氣球綁在左胸鰭、泳圈套在身體，
    // 兩者實際上碰不到彼此，不該被迫二選一
    const slotList = rewardDefinitionList.map((definition) => definition.slot)
    expect(new Set(slotList).size).toBe(slotList.length)

    let progress = createProgress({ unlockedRewardIdList: [...rewardIdList] })
    for (const rewardId of rewardIdList) {
      progress = equipAccessory(progress, rewardId)
    }
    expect(progress.equippedRewardIdList).toEqual(rewardIdList)
  })

  it('不同部位的配件可以同時穿戴', () => {
    const progress = createProgress({ unlockedRewardIdList: ['crayonHat', 'divingMask'] })
    const withHat = equipAccessory(progress, 'crayonHat')
    const withBoth = equipAccessory(withHat, 'divingMask')
    expect(withBoth.equippedRewardIdList).toEqual(['crayonHat', 'divingMask'])
  })

  it('脫下配件只影響指定的那一件', () => {
    const progress = createProgress({
      unlockedRewardIdList: ['crayonHat', 'divingMask'],
      equippedRewardIdList: ['crayonHat', 'divingMask'],
    })
    expect(unequipAccessory(progress, 'crayonHat').equippedRewardIdList).toEqual(['divingMask'])
  })

  it('穿脫不會就地改動原本的進度物件', () => {
    const progress = createProgress({ unlockedRewardIdList: ['crayonHat'] })
    equipAccessory(progress, 'crayonHat')
    expect(progress.equippedRewardIdList).toHaveLength(0)
  })
})

describe('讀寫進度', () => {
  it('沒有存過的資料時回傳空進度', () => {
    stubLocalStorage()
    expect(loadGameProgress()).toEqual(createProgress())
  })

  it('壞掉的 JSON 視同沒有進度，不讓首頁掛掉', () => {
    stubLocalStorage('{ 這不是 JSON')
    expect(loadGameProgress()).toEqual(createProgress())
  })

  it('過濾掉已不存在的獎勵 id，改版後的舊資料不會殘留', () => {
    stubLocalStorage(JSON.stringify({
      bestScoreMap: { stoneHop: 42 },
      unlockedRewardIdList: ['crayonHat', 'thisRewardWasRemoved'],
      equippedRewardIdList: ['alsoGone'],
    }))
    const progress = loadGameProgress()
    expect(progress.unlockedRewardIdList).toEqual(['crayonHat'])
    expect(progress.equippedRewardIdList).toHaveLength(0)
    expect(progress.bestScoreMap.stoneHop).toBe(42)
  })

  it('存進去的進度讀得回來', () => {
    stubLocalStorage()
    const progress = createProgress({
      bestScoreMap: { crayonSlide: 320 },
      unlockedRewardIdList: ['crayonHat', 'rainbowTrail'],
      equippedRewardIdList: ['crayonHat'],
    })
    saveGameProgress(progress)
    expect(loadGameProgress()).toEqual(progress)
  })

  it('localStorage 無法寫入時不拋錯，本次遊玩照樣進行', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('無痕模式')
      },
      removeItem: () => {},
    })
    expect(() => saveGameProgress(createProgress())).not.toThrow()
  })
})
