import type { MiniGameMeta } from './game-contract'
import { describe, expect, it } from 'vitest'
import { collectNewMilestoneList, getNextMilestone } from './game-contract'
import { miniGameIdList, miniGameMetaMap } from './game-registry'

/** 測試用的假遊戲：里程碑刻意用整齊的數字，斷言才好讀 */
const fakeMeta = {
  id: 'stoneHop',
  title: '測試遊戲',
  description: '',
  controlHint: '',
  briefing: {
    goal: '',
    controlStepList: [],
    failCondition: '',
    scoreRule: '',
    demoKind: 'chargeJump',
  },
  scoreUnit: '步',
  clearScore: 10,
  milestoneList: [
    { score: 40, rewardId: 'waterFlask' },
    { score: 100, rewardId: 'swimFin' },
    { score: 220, rewardId: 'rainbowTrail' },
  ],
  sceneOptions: { clearColorHex: '#ffffff' },
  loadFactory: async () => {
    throw new Error('測試不載入實作')
  },
} satisfies MiniGameMeta

describe('getNextMilestone', () => {
  it('沒有任何分數時回傳第一個里程碑', () => {
    expect(getNextMilestone(fakeMeta, 0)?.score).toBe(40)
  })

  it('剛好達標時前進到下一個里程碑', () => {
    expect(getNextMilestone(fakeMeta, 40)?.score).toBe(100)
  })

  it('全部達成後沒有下一個目標', () => {
    expect(getNextMilestone(fakeMeta, 999)).toBeUndefined()
  })
})

describe('collectNewMilestoneList', () => {
  it('首次遊玩一口氣跨過多個里程碑時全部收下', () => {
    const earnedList = collectNewMilestoneList(fakeMeta, 0, 150)
    expect(earnedList.map((milestone) => milestone.rewardId)).toEqual(['waterFlask', 'swimFin'])
  })

  it('已達成過的里程碑不重複發放', () => {
    const earnedList = collectNewMilestoneList(fakeMeta, 100, 150)
    expect(earnedList).toHaveLength(0)
  })

  it('刷新紀錄但未跨過門檻時沒有獎勵', () => {
    const earnedList = collectNewMilestoneList(fakeMeta, 41, 99)
    expect(earnedList).toHaveLength(0)
  })

  it('分數剛好等於門檻即算達成', () => {
    const earnedList = collectNewMilestoneList(fakeMeta, 39, 40)
    expect(earnedList.map((milestone) => milestone.rewardId)).toEqual(['waterFlask'])
  })

  it('分數低於歷史最佳時不發放任何獎勵', () => {
    const earnedList = collectNewMilestoneList(fakeMeta, 220, 10)
    expect(earnedList).toHaveLength(0)
  })
})

describe('遊戲註冊表', () => {
  it('每款遊戲的里程碑分數由低到高排序', () => {
    for (const gameId of miniGameIdList) {
      const scoreList = miniGameMetaMap[gameId].milestoneList.map((milestone) => milestone.score)
      expect(scoreList, `${gameId} 的里程碑順序`).toEqual([...scoreList].sort((a, b) => a - b))
    }
  })

  it('過關門檻低於第一個里程碑，先解鎖連結再談配件', () => {
    for (const gameId of miniGameIdList) {
      const meta = miniGameMetaMap[gameId]
      expect(meta.clearScore, `${gameId} 的過關門檻`).toBeLessThan(meta.milestoneList[0]!.score)
    }
  })

  it('每個獎勵只由一款遊戲的一個里程碑發放', () => {
    const rewardIdList = miniGameIdList.flatMap((gameId) => (
      miniGameMetaMap[gameId].milestoneList.map((milestone) => milestone.rewardId)
    ))
    expect(new Set(rewardIdList).size).toBe(rewardIdList.length)
  })
})
