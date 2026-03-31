import type { Ref } from 'vue'
import type { BattleResult, BeybladeConfig } from '../../types'
import { BattlePhase } from '../../types'
import { ref } from 'vue'

export interface BattleManagerOptions {
  onPhaseChange?: (phase: BattlePhase) => void;
}

export function useBattleManager(options?: BattleManagerOptions) {
  const currentPhase = ref<BattlePhase>(BattlePhase.CONFIGURE)
  const battleResult = ref<BattleResult | null>(null)

  function setPhase(phase: BattlePhase) {
    currentPhase.value = phase
    options?.onPhaseChange?.(phase)
  }

  function startQte() {
    setPhase(BattlePhase.QTE_CHARGE)
  }

  function advanceQte() {
    switch (currentPhase.value) {
      case BattlePhase.QTE_CHARGE:
        setPhase(BattlePhase.QTE_AIM)
        break
      case BattlePhase.QTE_AIM:
        setPhase(BattlePhase.QTE_LAUNCH)
        break
      case BattlePhase.QTE_LAUNCH:
        setPhase(BattlePhase.BATTLE)
        break
    }
  }

  function endBattle(result: BattleResult) {
    battleResult.value = result
    setPhase(BattlePhase.RESULT)
  }

  function restart() {
    battleResult.value = null
    setPhase(BattlePhase.CONFIGURE)
  }

  return {
    currentPhase: currentPhase as Ref<BattlePhase>,
    battleResult: battleResult as Ref<BattleResult | null>,
    startQte,
    advanceQte,
    endBattle,
    restart,
  }
}
