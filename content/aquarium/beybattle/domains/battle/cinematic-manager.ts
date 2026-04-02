import { ref, computed } from 'vue'
import { MAX_SPIN_RATE } from '../physics/spin-physics'

// --- 演出強度等級 ---
export type IntensityPhase = 'calm' | 'intense' | 'climax'

// --- 戲劇性事件 ---
export type DramaticEvent =
  | 'firstClash'
  | 'combo'
  | 'cliffEdge'
  | 'counter'
  | 'finalBlow'

export interface DramaticEventTrigger {
  event: DramaticEvent;
  positionX: number;
  positionY: number;
  /** combo 次數（僅 combo 事件用） */
  comboCount?: number;
  /** 涉及的陀螺（'player' | 'ai'） */
  target?: 'player' | 'ai';
}

/** 事件優先級（越高越優先） */
const EVENT_PRIORITY: Record<DramaticEvent, number> = {
  firstClash: 1,
  combo: 2,
  cliffEdge: 3,
  counter: 4,
  finalBlow: 5,
}

/** 慢動作持續時間（真實秒數，不是體感） */
export const SLOW_MOTION_DURATION: Record<DramaticEvent, number> = {
  firstClash: 0.15,
  combo: 0,
  cliffEdge: 0,
  counter: 0.25,
  finalBlow: 0.5,
}

/** 慢動作時間縮放 */
export const SLOW_MOTION_SCALE: Record<DramaticEvent, number> = {
  firstClash: 0.4,
  combo: 1,
  cliffEdge: 1,
  counter: 0.3,
  finalBlow: 0.2,
}

/** 事件文字 */
export const EVENT_TEXT: Record<DramaticEvent, string> = {
  firstClash: 'CLASH!',
  combo: 'COMBO',
  cliffEdge: 'DANGER!',
  counter: 'COUNTER!',
  finalBlow: 'FINISH!',
}

export const EVENT_TEXT_COLOR: Record<DramaticEvent, string> = {
  firstClash: '#ffffff',
  combo: '#facc15',
  cliffEdge: '#ef4444',
  counter: '#fbbf24',
  finalBlow: '#ffffff',
}

export function useCinematicManager() {
  // --- 狀態 ---
  const intensityPhase = ref<IntensityPhase>('calm')
  const activeEvent = ref<DramaticEventTrigger | null>(null)
  const activeEventText = ref('')
  const activeEventColor = ref('#ffffff')
  const showEventText = ref(false)
  const eventTextKey = ref(0)

  // --- 慢動作 ---
  const slowMotionTimeScale = ref(1.0)
  let slowMotionRemaining = 0

  // --- 碰撞追蹤 ---
  let firstClashTriggered = false
  let recentCollisionTimestampList: number[] = []
  let comboCount = 0

  // --- 冷卻 ---
  const cooldownMap: Partial<Record<DramaticEvent, number>> = {}
  const COOLDOWN_DURATION = 3.0

  // --- 鏡頭演出 ---
  const cameraZoomTarget = ref(12)
  const cameraLookAtTarget = ref<{ x: number; y: number; z: number } | null>(null)
  let cameraResetTimer = 0

  // --- 速度線 ---
  const speedLineIntensity = ref(0)

  // --- vignette ---
  const vignetteIntensity = ref(0)
  const vignetteColor = ref('rgba(0,0,0,0.5)')

  function reset() {
    intensityPhase.value = 'calm'
    activeEvent.value = null
    showEventText.value = false
    slowMotionTimeScale.value = 1.0
    slowMotionRemaining = 0
    firstClashTriggered = false
    recentCollisionTimestampList = []
    comboCount = 0
    Object.keys(cooldownMap).forEach((key) => delete cooldownMap[key as DramaticEvent])
    cameraZoomTarget.value = 12
    cameraLookAtTarget.value = null
    cameraResetTimer = 0
    speedLineIntensity.value = 0
    vignetteIntensity.value = 0
  }

  /** 每幀更新 — 傳入雙方轉速百分比 */
  function update(
    playerSpinPercent: number,
    aiSpinPercent: number,
    deltaTime: number,
    currentTime: number,
    battleActive: boolean = true,
  ) {
    // 非戰鬥中：淡出所有視覺效果，但仍處理計時器
    if (!battleActive) {
      intensityPhase.value = 'calm'
      speedLineIntensity.value = Math.max(0, speedLineIntensity.value - deltaTime * 3)
      vignetteIntensity.value = Math.max(0, vignetteIntensity.value - deltaTime * 3)
    }
    else {
      const minSpin = Math.min(playerSpinPercent, aiSpinPercent)

      // --- 更新演出強度 ---
      if (minSpin > 60) {
        intensityPhase.value = 'calm'
      }
      else if (minSpin > 30) {
        intensityPhase.value = 'intense'
      }
      else {
        intensityPhase.value = 'climax'
      }

      // --- 漸進式視覺參數 ---
      if (intensityPhase.value === 'climax') {
        speedLineIntensity.value = Math.min(1, (30 - minSpin) / 30)
      }
      else {
        speedLineIntensity.value = Math.max(0, speedLineIntensity.value - deltaTime * 2)
      }

      if (intensityPhase.value === 'climax') {
        vignetteIntensity.value = 0.6
        vignetteColor.value = 'rgba(180, 20, 20, 0.4)'
      }
      else if (intensityPhase.value === 'intense') {
        vignetteIntensity.value = 0.3
        vignetteColor.value = 'rgba(0, 0, 0, 0.5)'
      }
      else {
        vignetteIntensity.value = Math.max(0, vignetteIntensity.value - deltaTime)
      }
    }

    // --- 慢動作更新 ---
    if (slowMotionRemaining > 0) {
      slowMotionRemaining -= deltaTime
      if (slowMotionRemaining <= 0) {
        slowMotionTimeScale.value = 1.0
      }
    }

    // --- 冷卻更新 ---
    for (const [event, endTime] of Object.entries(cooldownMap)) {
      if (currentTime > (endTime as number)) {
        delete cooldownMap[event as DramaticEvent]
      }
    }

    // --- 鏡頭回歸 ---
    if (cameraResetTimer > 0) {
      cameraResetTimer -= deltaTime
      if (cameraResetTimer <= 0) {
        cameraZoomTarget.value = 12
        cameraLookAtTarget.value = null
      }
    }

    // --- 清理舊碰撞紀錄 ---
    recentCollisionTimestampList = recentCollisionTimestampList.filter(
      (timestamp) => currentTime - timestamp < 1.5,
    )
  }

  /** 碰撞發生時呼叫 */
  function onCollision(
    positionX: number,
    positionY: number,
    playerSpinPercent: number,
    aiSpinPercent: number,
    currentTime: number,
    isPlayerAttacker: boolean,
  ) {
    const eventCandidateList: DramaticEventTrigger[] = []

    // 首次碰撞
    if (!firstClashTriggered) {
      firstClashTriggered = true
      eventCandidateList.push({
        event: 'firstClash',
        positionX,
        positionY,
      })
    }

    // Combo 偵測
    recentCollisionTimestampList.push(currentTime)
    if (recentCollisionTimestampList.length >= 3 && !isOnCooldown('combo', currentTime)) {
      comboCount = recentCollisionTimestampList.length
      eventCandidateList.push({
        event: 'combo',
        positionX,
        positionY,
        comboCount,
      })
    }

    // 絕地反擊
    const attackerSpin = isPlayerAttacker ? playerSpinPercent : aiSpinPercent
    if (attackerSpin < 15 && !isOnCooldown('counter', currentTime)) {
      eventCandidateList.push({
        event: 'counter',
        positionX,
        positionY,
        target: isPlayerAttacker ? 'player' : 'ai',
      })
    }

    // 選出最高優先級事件
    if (eventCandidateList.length > 0) {
      const bestEvent = eventCandidateList.sort(
        (a, b) => EVENT_PRIORITY[b.event] - EVENT_PRIORITY[a.event],
      )[0]
      triggerEvent(bestEvent, currentTime)
    }
  }

  /** 接近出界時呼叫 */
  function onNearEdge(
    target: 'player' | 'ai',
    positionX: number,
    positionY: number,
    currentTime: number,
  ) {
    if (isOnCooldown('cliffEdge', currentTime)) return

    triggerEvent({
      event: 'cliffEdge',
      positionX,
      positionY,
      target,
    }, currentTime)
  }

  /** 最後一擊 */
  function onFinalBlow(positionX: number, positionY: number, currentTime: number) {
    triggerEvent({
      event: 'finalBlow',
      positionX,
      positionY,
    }, currentTime)
  }

  function triggerEvent(trigger: DramaticEventTrigger, currentTime: number) {
    // 如果當前有更高優先級的事件在播放，跳過
    if (activeEvent.value && EVENT_PRIORITY[activeEvent.value.event] >= EVENT_PRIORITY[trigger.event]) {
      return
    }

    activeEvent.value = trigger

    // 文字彈出
    const textPrefix = trigger.event === 'combo' && trigger.comboCount
      ? `×${trigger.comboCount} `
      : ''
    activeEventText.value = textPrefix + EVENT_TEXT[trigger.event]
    activeEventColor.value = EVENT_TEXT_COLOR[trigger.event]
    eventTextKey.value++
    showEventText.value = true
    setTimeout(() => { showEventText.value = false }, 800)

    // 慢動作
    const slowDuration = SLOW_MOTION_DURATION[trigger.event]
    if (slowDuration > 0) {
      slowMotionTimeScale.value = SLOW_MOTION_SCALE[trigger.event]
      slowMotionRemaining = slowDuration
    }

    // 鏡頭演出
    if (trigger.event === 'finalBlow') {
      cameraZoomTarget.value = 7
      cameraLookAtTarget.value = { x: trigger.positionX, y: 0, z: trigger.positionY }
      cameraResetTimer = 0.8
    }
    else if (trigger.event === 'counter') {
      cameraZoomTarget.value = 8
      cameraLookAtTarget.value = { x: trigger.positionX, y: 0, z: trigger.positionY }
      cameraResetTimer = 0.5
    }
    else if (trigger.event === 'firstClash') {
      cameraZoomTarget.value = 9
      cameraLookAtTarget.value = { x: trigger.positionX, y: 0, z: trigger.positionY }
      cameraResetTimer = 0.35
    }
    else if (trigger.event === 'cliffEdge') {
      cameraZoomTarget.value = 8
      cameraLookAtTarget.value = { x: trigger.positionX, y: 0, z: trigger.positionY }
      cameraResetTimer = 0.4
    }
    // combo 不拉鏡頭，只有文字和閃屏

    // 設定冷卻
    if (trigger.event === 'combo' || trigger.event === 'cliffEdge') {
      cooldownMap[trigger.event] = currentTime + COOLDOWN_DURATION
    }

    // 清除 activeEvent
    const eventDuration = Math.max(slowDuration, 0.3) * 1000
    setTimeout(() => {
      if (activeEvent.value === trigger) {
        activeEvent.value = null
      }
    }, eventDuration)
  }

  function isOnCooldown(event: DramaticEvent, currentTime: number): boolean {
    const endTime = cooldownMap[event]
    return endTime !== undefined && currentTime < endTime
  }

  return {
    intensityPhase,
    activeEvent,
    activeEventText,
    activeEventColor,
    showEventText,
    eventTextKey,
    slowMotionTimeScale,
    speedLineIntensity,
    vignetteIntensity,
    vignetteColor,
    cameraZoomTarget,
    cameraLookAtTarget,
    reset,
    update,
    onCollision,
    onNearEdge,
    onFinalBlow,
  }
}
