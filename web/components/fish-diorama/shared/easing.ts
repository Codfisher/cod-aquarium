/** 共用緩動曲線：手工動畫的節奏語彙。
 *
 * 線性插值與單一 `Math.sin` 是「程式在動」的最大破綻——等速沒有重量、
 * 對稱沒有意圖。手作演出的基本語彙是：
 * **預備（反向蓄力）→ 爆發（快）→ 過衝（超過目標回彈）→ 落定（衰減震盪）**。
 * 所有演出的時間曲線一律從這裡取用，不要再手寫線性收尾。
 *
 * 所有函式輸入 0~1 進度、輸出動畫比例；back / elastic 類會暫時超出 0~1，
 * 用在縮放時記得母體要留超出空間。
 */

export const DEFAULT_BACK_OVERSHOOT = 1.70158

export function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** 快出慢停：位移、淡出的預設收尾 */
export function easeOutCubic(ratio: number): number {
  const inverted = 1 - clampRatio(ratio)
  return 1 - inverted * inverted * inverted
}

/** 慢起快衝：消失、吸入類動作的預設起手 */
export function easeInCubic(ratio: number): number {
  const clamped = clampRatio(ratio)
  return clamped * clamped * clamped
}

/** 爆發出手：起步瞬間就衝到大半，尾段近乎停住。
 * 比 easeOutCubic 更極端，適合粒子彈出、擊飛這種「一下子就散開」的動作——
 * 力道全在第一瞬間，之後只是慢慢飄
 */
export function easeOutExpo(ratio: number): number {
  const clamped = clampRatio(ratio)
  return clamped >= 1 ? 1 : 1 - 2 ** (-10 * clamped)
}

/** 慢起慢停：鏡頭移動、長距離平移 */
export function easeInOutCubic(ratio: number): number {
  const clamped = clampRatio(ratio)
  if (clamped < 0.5) {
    return 4 * clamped * clamped * clamped
  }
  const inverted = -2 * clamped + 2
  return 1 - (inverted * inverted * inverted) / 2
}

/** 過衝回彈：彈出、放大登場。終點前會衝過頭再彈回來 */
export function easeOutBack(ratio: number, overshoot = DEFAULT_BACK_OVERSHOOT): number {
  const offset = clampRatio(ratio) - 1
  return 1 + (overshoot + 1) * offset * offset * offset + overshoot * offset * offset
}

/** 反向蓄力：起步前先往反方向縮一下（anticipation），適合收服、跳躍起手 */
export function easeInBack(ratio: number, overshoot = DEFAULT_BACK_OVERSHOOT): number {
  const clamped = clampRatio(ratio)
  return (overshoot + 1) * clamped * clamped * clamped - overshoot * clamped * clamped
}

/** 彈性落定：Q 彈材質的登場，彈幅比 easeOutBack 大、震盪多一輪 */
export function easeOutElastic(ratio: number): number {
  const clamped = clampRatio(ratio)
  if (clamped === 0 || clamped === 1) {
    return clamped
  }
  return 2 ** (-10 * clamped) * Math.sin((clamped * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
}

/** 衰減震盪：受擊晃動、落地踉蹌這類「彈幾下停住」的通用形。
 * 回傳 -1~1 隨進度衰減到 0 的震盪值，乘上振幅使用。
 * cycleCount 控制來回次數（非整數也可以，尾巴會停在非零相位再被衰減收掉）、
 * decayPower 控制衰減速度（越大停得越快）。
 */
export function computeDecayingWobble(ratio: number, cycleCount = 3, decayPower = 1.4): number {
  const clamped = clampRatio(ratio)
  return Math.sin(clamped * Math.PI * cycleCount) * (1 - clamped) ** decayPower
}

/** 壓下回彈：按鍵、快門這種 0→1→0 的單峰脈衝。
 * 前段快壓、後段慢回，比對稱的 `sin(progress * π)` 更像手指按壓的重量。
 */
export function computePressPulse(ratio: number): number {
  const clamped = clampRatio(ratio)
  const pressPortion = 0.32
  if (clamped < pressPortion) {
    return easeOutCubic(clamped / pressPortion)
  }
  return 1 - easeInOutCubic((clamped - pressPortion) / (1 - pressPortion))
}

/** 多頻率搖曳：三個不可通約頻率疊加，取代單一 sin 的機械呼吸。
 * 回傳約 -1~1。timeSeconds 已乘好各自的速度再傳入；phase 讓每個實體錯開，
 * 同時也錯開副頻率的相位，兩株草即使同速度也不會同步。
 */
export function sampleOrganicSway(timeSeconds: number, phase = 0): number {
  return (
    Math.sin(timeSeconds + phase) * 0.62
    + Math.sin(timeSeconds * 2.383 + phase * 1.7 + 1.3) * 0.26
    + Math.sin(timeSeconds * 0.731 + phase * 0.5 + 4.1) * 0.12
  )
}
