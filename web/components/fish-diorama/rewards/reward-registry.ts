/** 獎勵註冊表：高分里程碑解鎖的配件。
 *
 * 配件掛在鱈魚身上，解鎖後在箱庭永久可見、可自由穿脫。
 * 這裡只有純資料，不碰 Babylon，讓 Vue 收藏冊與遊戲 HUD 都能直接引用。
 */

export type RewardId =
  // 蠟筆滑道
  | 'crayonHat'
  | 'rainbowTrail'
  // 快門無雙
  | 'divingMask'
  | 'flashBalloon'
  // 靈感溯源
  | 'waterFlask'
  | 'swimFin'

/** 配件掛載的部位。同一部位只能戴一件，不同部位互不影響 */
export type AccessorySlot = 'head' | 'face' | 'neck' | 'body' | 'fin' | 'tail'

export interface RewardDefinition {
  id: RewardId;
  name: string;
  /** 收藏冊上的一句說明，解鎖後才看得到 */
  description: string;
  /** 未解鎖時的提示，只給方向不劇透 */
  lockedHint: string;
  slot: AccessorySlot;
}

export const rewardDefinitionMap: Record<RewardId, RewardDefinition> = {
  crayonHat: {
    id: 'crayonHat',
    name: '蠟筆帽',
    description: '削尖的紅蠟筆，戴久了頭頂沾蠟。',
    lockedHint: '在蠟筆滑道潛得夠深',
    slot: 'head',
  },
  rainbowTrail: {
    id: 'rainbowTrail',
    name: '彩虹尾跡',
    description: '游到哪撒到哪，七彩蠟筆屑落地慢慢褪色。',
    lockedHint: '在蠟筆滑道潛得更深',
    slot: 'tail',
  },
  divingMask: {
    id: 'divingMask',
    name: '潛水鏡',
    description: '兩片圓鏡片罩住雙眼，一眨就閃。',
    lockedHint: '在快門無雙收服足夠多怪魚',
    slot: 'face',
  },
  flashBalloon: {
    id: 'flashBalloon',
    name: '閃光氣球',
    description: '拆下來的閃光燈泡綁在左鰭，游著游著自己亮一下。',
    lockedHint: '在快門無雙收服更多怪魚',
    slot: 'fin',
  },
  waterFlask: {
    id: 'waterFlask',
    name: '隨身水壺',
    description: '整隻泡在水裡，還背著一壺水，蓋子沒關緊，一路漏。',
    lockedHint: '在靈感溯源連續踩準',
    slot: 'neck',
  },
  swimFin: {
    id: 'swimFin',
    name: '游泳圈',
    description: '是魚，卻得整隻鑽過去才套得上。',
    lockedHint: '在靈感溯源連得更久',
    slot: 'body',
  },
}

export const rewardIdList = Object.keys(rewardDefinitionMap) as RewardId[]

export const rewardDefinitionList = rewardIdList.map((rewardId) => rewardDefinitionMap[rewardId])

export function getRewardDefinition(rewardId: RewardId): RewardDefinition {
  return rewardDefinitionMap[rewardId]
}
