import type { BeybladeConfig, Difficulty, PartDefinition } from '../../types'
import type { QteResult } from '../qte/qte-engine'
import { ARENA_RADIUS } from '../arena/arena-constants'
import { attackRingPartList, spinTipPartList, weightDiskPartList } from '../beyblade/parts'

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomFromList<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

const CHARGE_RATE_RANGE: Record<Difficulty, [number, number]> = {
  easy: [0.65, 0.85],
  medium: [0.8, 0.95],
  hard: [0.92, 1.0],
}

export function generateAiQteResult(
  difficulty: Difficulty,
  playerAimPosition?: { x: number; y: number },
): QteResult {
  const [min, max] = CHARGE_RATE_RANGE[difficulty]
  const chargeRate = randomInRange(min, max)

  let aimPosition: { x: number; y: number }
  let launchAngle: number

  if (difficulty === 'easy') {
    // 簡單：隨機位置
    const aimRadius = randomInRange(0, ARENA_RADIUS * 0.5)
    const aimAngle = Math.random() * Math.PI * 2
    aimPosition = {
      x: Math.cos(aimAngle) * aimRadius,
      y: Math.sin(aimAngle) * aimRadius,
    }
    launchAngle = Math.random() * Math.PI * 2
  }
  else if (difficulty === 'medium') {
    // 中等：偏好中心，發射方向朝向玩家
    const aimRadius = randomInRange(0, ARENA_RADIUS * 0.3)
    const aimAngle = Math.random() * Math.PI * 2
    aimPosition = {
      x: Math.cos(aimAngle) * aimRadius,
      y: Math.sin(aimAngle) * aimRadius,
    }

    if (playerAimPosition) {
      // 朝向玩家方向發射
      launchAngle = Math.atan2(
        playerAimPosition.y - aimPosition.y,
        playerAimPosition.x - aimPosition.x,
      ) + randomInRange(-0.3, 0.3)
    }
    else {
      launchAngle = Math.random() * Math.PI * 2
    }
  }
  else {
    // 困難：戰略性位置，精確朝玩家發射
    // 佔據場地優勢位置（中心偏移，逼玩家到邊緣）
    const strategicAngle = Math.random() * Math.PI * 2
    const aimRadius = randomInRange(ARENA_RADIUS * 0.1, ARENA_RADIUS * 0.25)
    aimPosition = {
      x: Math.cos(strategicAngle) * aimRadius,
      y: Math.sin(strategicAngle) * aimRadius,
    }

    if (playerAimPosition) {
      // 精確攔截發射
      launchAngle = Math.atan2(
        playerAimPosition.y - aimPosition.y,
        playerAimPosition.x - aimPosition.x,
      ) + randomInRange(-0.1, 0.1)
    }
    else {
      launchAngle = Math.random() * Math.PI * 2
    }
  }

  return {
    chargeRate,
    chargeRating: chargeRate >= 0.92 ? 'perfect' : chargeRate >= 0.8 ? 'great' : 'good',
    aimPosition,
    launchAngle,
  }
}

export function generateAiPartSelection(
  difficulty: Difficulty,
  playerConfig?: BeybladeConfig,
): BeybladeConfig {
  if (difficulty === 'easy') {
    return {
      attackRing: randomFromList(attackRingPartList),
      weightDisk: randomFromList(weightDiskPartList),
      spinTip: randomFromList(spinTipPartList),
    }
  }

  if (difficulty === 'hard' && playerConfig) {
    // 針對玩家配置反制
    const playerTotalAttack = (playerConfig.attackRing.statsModifier.attack ?? 0)
      + (playerConfig.weightDisk.statsModifier.attack ?? 0)
      + (playerConfig.spinTip.statsModifier.attack ?? 0)

    const playerTotalDefense = (playerConfig.attackRing.statsModifier.defense ?? 0)
      + (playerConfig.weightDisk.statsModifier.defense ?? 0)
      + (playerConfig.spinTip.statsModifier.defense ?? 0)

    const playerTotalStamina = (playerConfig.attackRing.statsModifier.stamina ?? 0)
      + (playerConfig.weightDisk.statsModifier.stamina ?? 0)
      + (playerConfig.spinTip.statsModifier.stamina ?? 0)

    // 找出玩家最弱的屬性來對應攻擊
    const weakestStat = Math.min(playerTotalAttack, playerTotalDefense, playerTotalStamina)

    let targetStat: 'attack' | 'defense' | 'stamina'
    if (weakestStat === playerTotalDefense) {
      // 玩家防禦弱 → AI 全攻擊
      targetStat = 'attack'
    }
    else if (weakestStat === playerTotalStamina) {
      // 玩家持久弱 → AI 高持久拖死
      targetStat = 'stamina'
    }
    else {
      // 玩家攻擊弱 → AI 高防禦耗時間
      targetStat = 'defense'
    }

    const sortByTarget = <T extends PartDefinition>(list: readonly T[]) =>
      [...list].sort((a, b) => (b.statsModifier[targetStat] ?? 0) - (a.statsModifier[targetStat] ?? 0))

    return {
      attackRing: sortByTarget(attackRingPartList)[0],
      weightDisk: sortByTarget(weightDiskPartList)[0],
      spinTip: sortByTarget(spinTipPartList)[0],
    }
  }

  // medium：偏向單一流派，但選前兩名的零件（有點隨機性）
  const strategyList = ['attack', 'defense', 'stamina'] as const
  const strategy = randomFromList(strategyList)

  const sortByStatDesc = <T extends PartDefinition>(list: readonly T[]) => {
    const sorted = [...list].sort((a, b) => (b.statsModifier[strategy] ?? 0) - (a.statsModifier[strategy] ?? 0))
    // 從前兩名中隨機選一個
    return sorted[Math.random() < 0.7 ? 0 : 1]
  }

  return {
    attackRing: sortByStatDesc(attackRingPartList),
    weightDisk: sortByStatDesc(weightDiskPartList),
    spinTip: sortByStatDesc(spinTipPartList),
  }
}
