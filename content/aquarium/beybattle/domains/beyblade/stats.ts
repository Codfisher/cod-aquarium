import type { BeybladeConfig, BeybladeStats } from '../../types'

const DEFAULT_STATS: BeybladeStats = {
  attack: 0,
  defense: 0,
  stamina: 0,
  speed: 0,
}

export function calculateFinalStats(config: BeybladeConfig): BeybladeStats {
  const partList = [config.attackRing, config.weightDisk, config.spinTip]

  return partList.reduce<BeybladeStats>((result, part) => {
    return {
      attack: result.attack + (part.statsModifier.attack ?? 0),
      defense: result.defense + (part.statsModifier.defense ?? 0),
      stamina: result.stamina + (part.statsModifier.stamina ?? 0),
      speed: result.speed + (part.statsModifier.speed ?? 0),
    }
  }, { ...DEFAULT_STATS })
}
