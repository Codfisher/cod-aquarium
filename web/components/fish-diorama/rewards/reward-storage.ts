/** 遊戲進度的本機儲存：每款遊戲的最佳分數、已解鎖獎勵、目前穿戴的配件。
 *
 * 與舊的 `fish-diorama-unlocked-spot-list`（作品連結解鎖）並存不衝突：
 * 那份負責「過關解鎖連結」，這份負責「高分解鎖獎勵」。
 */
import type { MiniGameId } from '../games/game-contract'
import type { AccessorySlot, RewardId } from './reward-registry'
import { rewardDefinitionMap, rewardIdList } from './reward-registry'

const PROGRESS_STORAGE_KEY = 'fish-diorama-game-progress'

export interface GameProgress {
  /** 每款遊戲的歷史最佳分數 */
  bestScoreMap: Partial<Record<MiniGameId, number>>;
  /** 已解鎖的獎勵 */
  unlockedRewardIdList: RewardId[];
  /** 目前穿戴中的配件（每個部位至多一件） */
  equippedRewardIdList: RewardId[];
}

function createEmptyProgress(): GameProgress {
  return { bestScoreMap: {}, unlockedRewardIdList: [], equippedRewardIdList: [] }
}

/** 讀取進度。資料損壞或無法存取時回傳空進度，不讓首頁掛掉 */
export function loadGameProgress(): GameProgress {
  try {
    const storedText = localStorage.getItem(PROGRESS_STORAGE_KEY)
    if (!storedText) {
      return createEmptyProgress()
    }
    const storedValue = JSON.parse(storedText) as Partial<GameProgress>
    const validRewardIdSet = new Set<string>(rewardIdList)
    return {
      bestScoreMap: storedValue.bestScoreMap ?? {},
      unlockedRewardIdList: (storedValue.unlockedRewardIdList ?? [])
        .filter((rewardId) => validRewardIdSet.has(rewardId)),
      equippedRewardIdList: (storedValue.equippedRewardIdList ?? [])
        .filter((rewardId) => validRewardIdSet.has(rewardId)),
    }
  }
  catch {
    return createEmptyProgress()
  }
}

/** 寫入進度。無痕模式等寫入失敗就只保留本次瀏覽 */
export function saveGameProgress(progress: GameProgress): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  }
  catch {
    // 寫入失敗不影響本次遊玩
  }
}

export function clearGameProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_STORAGE_KEY)
  }
  catch {
    // 清除失敗就維持現狀
  }
}

/** 穿上配件。同部位已有配件會先脫下（一個部位只能戴一件） */
export function equipAccessory(progress: GameProgress, rewardId: RewardId): GameProgress {
  if (!progress.unlockedRewardIdList.includes(rewardId)) {
    return progress
  }
  const targetSlot: AccessorySlot = rewardDefinitionMap[rewardId].slot
  const keptRewardIdList = progress.equippedRewardIdList.filter((equippedId) => (
    rewardDefinitionMap[equippedId].slot !== targetSlot
  ))
  return { ...progress, equippedRewardIdList: [...keptRewardIdList, rewardId] }
}

export function unequipAccessory(progress: GameProgress, rewardId: RewardId): GameProgress {
  return {
    ...progress,
    equippedRewardIdList: progress.equippedRewardIdList.filter((equippedId) => equippedId !== rewardId),
  }
}
