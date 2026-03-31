import type { BeybladeConfig, BeybladeStats } from '../../types'

export function calculateFinalStats(config: BeybladeConfig): BeybladeStats {
  const partList = [config.attackRing, config.weightDisk, config.spinTip]

  const base = partList.reduce(
    (result, part) => ({
      attack: result.attack + (part.statsModifier.attack ?? 0),
      defense: result.defense + (part.statsModifier.defense ?? 0),
      stamina: result.stamina + (part.statsModifier.stamina ?? 0),
      speed: result.speed + (part.statsModifier.speed ?? 0),
    }),
    { attack: 0, defense: 0, stamina: 0, speed: 0 },
  )

  return {
    ...base,
    // 爆擊率完全由攻擊環決定
    critical: config.attackRing.statsModifier.critical ?? 0,
  }
}
