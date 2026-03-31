import { computed, ref } from 'vue'
import { ARENA_RADIUS } from '../arena/arena-constants'
import {
  CHARGE_GREAT_MIN,
  CHARGE_PERFECT_MIN,
  qteStageConfigList,
} from './qte-stages'

export type ChargeRating = 'perfect' | 'great' | 'good'

export interface QteResult {
  /** 轉速倍率 0~1 */
  chargeRate: number;
  chargeRating: ChargeRating;
  /** 落點位置 */
  aimPosition: { x: number; y: number };
  /** 發射角度（弧度） */
  launchAngle: number;
}

export function useQteEngine() {
  const currentStageIndex = ref(0)
  const isActive = ref(false)
  const isComplete = ref(false)

  /** 蓄力指標值 0~1（來回擺動） */
  const chargeValue = ref(0)
  /** 瞄準角度（決定落點在圓上的位置） */
  const aimAngle = ref(0)
  /** 發射方向角度 */
  const launchDirectionAngle = ref(0)

  // 鎖定的結果
  const lockedChargeValue = ref(0)
  const lockedAimPosition = ref({ x: 0, y: 0 })
  const lockedLaunchAngle = ref(0)

  let animationDirection = 1
  let elapsed = 0

  const currentStageName = computed(() => {
    if (currentStageIndex.value >= qteStageConfigList.length) return 'done'
    return qteStageConfigList[currentStageIndex.value].name
  })

  function start() {
    currentStageIndex.value = 0
    isActive.value = true
    isComplete.value = false
    chargeValue.value = 0
    aimAngle.value = 0
    launchDirectionAngle.value = 0
    animationDirection = 1
    elapsed = 0
  }

  function update(deltaTime: number) {
    if (!isActive.value || isComplete.value) return

    const stageConfig = qteStageConfigList[currentStageIndex.value]
    if (!stageConfig) return

    elapsed += deltaTime

    // 超時自動確認
    if (elapsed >= stageConfig.timeLimit) {
      confirmStage()
      return
    }

    const speed = stageConfig.indicatorSpeed

    switch (currentStageIndex.value) {
      case 0: {
        // 蓄力：指標來回擺動
        chargeValue.value += animationDirection * speed * deltaTime
        if (chargeValue.value >= 1) {
          chargeValue.value = 1
          animationDirection = -1
        }
        else if (chargeValue.value <= 0) {
          chargeValue.value = 0
          animationDirection = 1
        }
        break
      }
      case 1: {
        // 瞄準：準心沿圓形軌跡移動
        aimAngle.value += speed * deltaTime * Math.PI * 2
        break
      }
      case 2: {
        // 發射：方向箭頭旋轉
        launchDirectionAngle.value += speed * deltaTime * Math.PI * 2
        break
      }
    }
  }

  function confirmStage() {
    if (!isActive.value || isComplete.value) return

    switch (currentStageIndex.value) {
      case 0: {
        lockedChargeValue.value = chargeValue.value
        break
      }
      case 1: {
        const aimRadius = ARENA_RADIUS * 0.6
        lockedAimPosition.value = {
          x: Math.cos(aimAngle.value) * aimRadius,
          y: Math.sin(aimAngle.value) * aimRadius,
        }
        break
      }
      case 2: {
        lockedLaunchAngle.value = launchDirectionAngle.value
        break
      }
    }

    currentStageIndex.value++
    elapsed = 0
    animationDirection = 1

    if (currentStageIndex.value >= qteStageConfigList.length) {
      isActive.value = false
      isComplete.value = true
    }
  }

  function getChargeRating(value: number): ChargeRating {
    if (value >= CHARGE_PERFECT_MIN) return 'perfect'
    if (value >= CHARGE_GREAT_MIN) return 'great'
    return 'good'
  }

  function getResult(): QteResult {
    const rating = getChargeRating(lockedChargeValue.value)
    const chargeRateMap: Record<ChargeRating, number> = {
      perfect: 1.0,
      great: 0.8,
      good: 0.6,
    }

    return {
      chargeRate: chargeRateMap[rating],
      chargeRating: rating,
      aimPosition: { ...lockedAimPosition.value },
      launchAngle: lockedLaunchAngle.value,
    }
  }

  return {
    currentStageIndex,
    currentStageName,
    isActive,
    isComplete,
    chargeValue,
    aimAngle,
    launchDirectionAngle,
    start,
    update,
    confirmStage,
    getResult,
  }
}
